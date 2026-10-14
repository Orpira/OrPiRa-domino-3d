import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ALL_FIVES_RULES, armsOpen, endValue, fivesPoints, getPlayerView, legalActions, nextRound, openEndsTotal, roundToFive, ruleSetOf, startMatch, transition,
  type GameState, type OrientedTile, type Side, type TileId,
} from "../src/index.ts";
import { chooseBotAction } from "../../bots/src/index.ts";
import { dealFor, PLAYERS } from "./helpers.ts";

const fives = (seed = 3, targetScore?: 100 | 150 | 200) => startMatch("af", PLAYERS, dealFor(seed), { rules: "ALL_FIVES", ...(targetScore ? { targetScore } : {}) }).state;
const t = (id: TileId, left: number, right: number, playedBy = "P1"): OrientedTile => ({ id, left, right, playedBy });
/** Tablero a medida, con P0 en turno y el pozo vacío salvo que se indique. */
function board(base: GameState, chain: OrientedTile[], hands: Record<string, TileId[]>, extra: Partial<GameState> = {}): GameState {
  return { ...base, chain, leftEnd: chain[0]?.left ?? null, rightEnd: chain.at(-1)?.right ?? null, hands, boneyard: [], currentPlayerId: "P0", consecutivePasses: 0, ...extra };
}
const place = (state: GameState, tileId: TileId, side?: Side) => {
  const result = transition(state, { type: "PLACE", actorId: state.currentPlayerId!, tileId, ...(side ? { side } : {}) }); assert.ok(result.ok, !result.ok ? `${result.error.code} ${result.error.message}` : ""); return result;
};
const others = { P1: ["0-0"], P2: ["1-1"], P3: ["2-2"] } as Record<string, TileId[]>;

describe("All Fives: spinner y brazos", () => {
  test("reparto y salida como con robo; el primer doble de salida es el spinner con los brazos cerrados", () => {
    const state = fives(); assert.equal(state.rules, "ALL_FIVES"); assert.equal(ruleSetOf(state), ALL_FIVES_RULES); assert.equal(state.boneyard!.length, 8);
    const opening = legalActions(state, state.currentPlayerId!)[0]!.tileId!; const placed = place(state, opening).state;
    const double = opening[0] === opening[2]; assert.equal(placed.spinnerId, double ? opening : undefined); assert.equal(armsOpen(placed), false);
  });

  test("el spinner puede llegar después de la salida; los brazos se abren con fichas a ambos lados", () => {
    let state = board(fives(), [t("3-4", 3, 4)], { P0: ["4-4", "4-6", "3-5", "1-4"], ...others });
    state = place(state, "4-4", "RIGHT").state; assert.equal(state.spinnerId, "4-4"); assert.deepEqual([state.up, state.down], [[], []]);
    assert.equal(armsOpen(state), false); assert.equal(endValue(state, "UP"), null);
    state = { ...state, currentPlayerId: "P0" }; state = place(state, "4-6", "RIGHT").state; assert.equal(armsOpen(state), true);
    state = { ...state, currentPlayerId: "P0" };
    assert.deepEqual(legalActions(state, "P0").filter((action) => action.side === "UP" || action.side === "DOWN"), [{ type: "PLACE", tileId: "1-4", side: "UP" }, { type: "PLACE", tileId: "1-4", side: "DOWN" }]);
    state = place(state, "1-4", "DOWN").state; assert.deepEqual(state.down, [{ id: "1-4", left: 4, right: 1, playedBy: "P0" }]); assert.equal(endValue(state, "DOWN"), 1);
    assert.equal(state.chain.length, 3); assert.equal(state.leftEnd, 3); assert.equal(state.rightEnd, 6);
    // Un segundo doble no es spinner.
    state = { ...state, currentPlayerId: "P0", hands: { ...state.hands, P0: ["6-6", "3-5"] } }; state = place(state, "6-6", "RIGHT").state; assert.equal(state.spinnerId, "4-4");
  });

  test("brazo cerrado o modalidad sin spinner: UP/DOWN se rechazan", () => {
    const closed = board(fives(), [t("4-4", 4, 4)], { P0: ["4-5"], ...others }, { spinnerId: "4-4", up: [], down: [] });
    const result = transition(closed, { type: "PLACE", actorId: "P0", tileId: "4-5", side: "UP" }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "INVALID_SIDE");
    const draw = { ...closed, rules: "DRAW" as const }; const other = transition(draw, { type: "PLACE", actorId: "P0", tileId: "4-5", side: "UP" }); assert.equal(other.ok, false);
    const open = board(fives(), [t("3-4", 3, 4), t("4-4", 4, 4), t("4-6", 4, 6)], { P0: ["2-5"], ...others }, { spinnerId: "4-4", up: [], down: [] });
    const mismatch = transition(open, { type: "PLACE", actorId: "P0", tileId: "2-5", side: "DOWN" }); assert.equal(mismatch.ok, false); if (!mismatch.ok) assert.equal(mismatch.error.code, "TILE_DOES_NOT_MATCH");
  });
});

describe("All Fives: puntos", () => {
  test("suma de extremos: una ficha suma sus dos mitades; un doble en un extremo cuenta doble; brazos vacíos no cuentan", () => {
    const base = fives();
    assert.equal(openEndsTotal(board(base, [t("5-5", 5, 5)], {})), 10);
    assert.equal(openEndsTotal(board(base, [t("6-4", 6, 4)], {})), 10);
    assert.equal(openEndsTotal(board(base, [t("6-6", 6, 6), t("6-3", 6, 3)], {})), 15);
    const spinner = board(base, [t("3-4", 3, 4), t("4-4", 4, 4), t("4-6", 4, 6)], {}, { spinnerId: "4-4", up: [], down: [] });
    assert.equal(openEndsTotal(spinner), 9); assert.equal(fivesPoints(spinner), 0);
    assert.equal(openEndsTotal({ ...spinner, down: [t("1-4", 4, 1)] }), 10);
    assert.equal(openEndsTotal({ ...spinner, down: [t("1-4", 4, 1)], up: [t("4-2", 4, 2), t("2-2", 2, 2)] }), 14);
  });

  test("al colocar con suma múltiplo de 5, quien coloca suma esos puntos; si no, nada", () => {
    // Extremos: 6–6 a la izquierda (doble: 12) y 3 a la derecha.
    const chain = [t("6-6", 6, 6), t("6-3", 6, 3)];
    const none = place(board(fives(), chain, { P0: ["3-5", "0-1"], ...others }), "3-5", "RIGHT"); // 12 + 5 = 17
    assert.equal(none.state.players[0]!.score, 0); assert.equal(none.events.some((event) => event.type === "SCORE_APPLIED"), false);
    const scored = place(board(fives(), chain, { P0: ["2-6", "0-1"], ...others }), "2-6", "LEFT"); // 2 + 3 = 5
    assert.deepEqual(scored.state.players.map((p) => p.score), [5, 0, 0, 0]);
  });

  test("puntos al colocar: 5–5 de salida da 10; jugar al brazo del spinner también puntúa", () => {
    const opening = board(fives(), [], { P0: ["5-5", "0-1"], ...others });
    const first = place(opening, "5-5"); assert.deepEqual(first.state.players.map((p) => p.score), [10, 0, 0, 0]);
    assert.deepEqual(first.events.find((event) => event.type === "SCORE_APPLIED"), { type: "SCORE_APPLIED", roundId: opening.roundId, scoreDeltas: { P0: 10 }, reason: "FIVES", openEndsTotal: 10 });
    // Spinner 4–4 con 3 a la izquierda y 6 a la derecha (9): un 1–4 abajo suma 3 + 6 + 1 = 10.
    const arms = board(fives(), [t("3-4", 3, 4), t("4-4", 4, 4), t("4-6", 4, 6)], { P0: ["1-4", "0-2"], ...others }, { spinnerId: "4-4", up: [], down: [] });
    const down = place(arms, "1-4", "DOWN"); assert.equal(down.state.players[0]!.score, 10);
  });

  test("quien alcanza el objetivo con una jugada gana en el acto (motivo TARGET)", () => {
    const base = fives(3, 150);
    const state = board(base, [], { P0: ["5-5", "0-1"], ...others }, { players: base.players.map((p) => ({ ...p, score: p.playerId === "P0" ? 145 : 30 })) });
    const result = place(state, "5-5"); assert.equal(result.state.phase, "MATCH_ENDED"); assert.equal(result.state.roundResult!.reason, "TARGET");
    assert.equal(result.state.matchResult!.championId, "P0"); assert.equal(result.state.matchResult!.finalScores.P0, 155);
    assert.deepEqual(result.state.roundResult!.scoreDeltas, { P0: 10, P1: 0, P2: 0, P3: 0 });
  });

  test("fin de mano: el ganador suma los puntos de los rivales redondeados a 5; tranque, gana el menor", () => {
    assert.deepEqual([0, 2, 3, 12, 13, 17, 18, 168].map(roundToFive), [0, 0, 5, 10, 15, 15, 20, 170]);
    const state = board(fives(), [t("3-3", 3, 3)], { P0: ["3-1"], P1: ["6-6"], P2: ["0-1"], P3: ["2-2"] } as Record<string, TileId[]>);
    // Extremos tras colocar: 3–3 (doble: 6) + 1 = 7, sin puntos. Rivales: 12 + 1 + 4 = 17 → 15.
    const domino = place({ ...state, hands: { ...state.hands, P0: ["1-3"] } }, "1-3", "RIGHT");
    assert.equal(domino.state.roundResult!.reason, "DOMINO"); assert.equal(domino.state.roundResult!.scoreDeltas.P0, 15);
    let blocked = { ...board(fives(), [t("3-3", 3, 3)], { P0: ["0-1"], P1: ["6-6"], P2: ["5-5"], P3: ["4-4"] } as Record<string, TileId[]>) };
    for (const actorId of ["P0", "P3", "P2", "P1"]) { const result = transition(blocked, { type: "PASS", actorId }); assert.ok(result.ok); blocked = result.state; }
    assert.equal(blocked.roundResult!.reason, "BLOCKED"); assert.equal(blocked.roundResult!.winnerId, "P0"); assert.equal(blocked.roundResult!.scoreDeltas.P0, 30); // 12 + 10 + 8
  });
});

describe("All Fives: partidas completas", () => {
  test("bots que prefieren puntuar terminan siempre, con las 28 fichas en juego y campeón ≥ objetivo", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let state = fives(seed); let round = 0; let guard = 0;
      while (state.phase !== "MATCH_ENDED" && guard++ < 20_000) {
        if (state.phase === "ROUND_ENDED") { const next = nextRound(state, dealFor(seed * 50 + ++round)); assert.ok(!("error" in next)); state = next.state; assert.equal(state.spinnerId, undefined); continue; }
        const inPlay = [...Object.values(state.hands).flat(), ...state.boneyard!, ...state.chain, ...(state.up ?? []), ...(state.down ?? [])].map((x) => typeof x === "string" ? x : x.id);
        assert.equal(new Set(inPlay).size, 28);
        const actor = state.currentPlayerId!; const action = chooseBotAction({ view: getPlayerView(state, actor), legalActions: legalActions(state, actor) });
        const result = transition(state, action.type === "PLACE" ? { type: "PLACE", actorId: actor, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } : { type: action.type, actorId: actor });
        assert.ok(result.ok, !result.ok ? result.error.code : ""); state = result.state;
        assert.ok(state.players.every((p) => p.score % 5 === 0));
      }
      assert.equal(state.phase, "MATCH_ENDED"); assert.ok(state.matchResult!.finalScores[state.matchResult!.championId]! >= 100);
    }
  });

  test("la vista incluye spinner y brazos (son públicos) pero nunca el pozo", () => {
    const state = board(fives(), [t("3-4", 3, 4), t("4-4", 4, 4), t("4-6", 4, 6)], { P0: ["1-4"], ...others }, { spinnerId: "4-4", up: [t("4-2", 4, 2)], down: [], boneyard: ["0-5"] });
    const view = getPlayerView(state, "P1"); assert.equal(view.spinnerId, "4-4"); assert.deepEqual(view.up, [t("4-2", 4, 2)]); assert.equal(view.boneyardCount, 1); assert.equal("boneyard" in view, false);
  });

  test("solo individual", () => { assert.throws(() => startMatch("x", PLAYERS, dealFor(1), { rules: "ALL_FIVES", mode: "PAIRS" }), /Only Latino/); });
});
