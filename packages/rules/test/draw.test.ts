import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DRAW_RULES, getPlayerView, LATINO_RULES, legalActions, nextRound, pipTotal, ruleSetOf, startMatch, transition, targetScore,
  type GameState, type TileId,
} from "../src/index.ts";
import { dealFor, dealWithHands, PLAYERS } from "./helpers.ts";

const draw = (deal = dealFor(3), targetScore?: 100 | 150 | 200) => startMatch("draw", PLAYERS, deal, { rules: "DRAW", ...(targetScore ? { targetScore } : {}) }).state;
const play = (state: GameState, tileId: TileId, side?: "LEFT" | "RIGHT") => {
  const result = transition(state, { type: "PLACE", actorId: state.currentPlayerId!, tileId, ...(side ? { side } : {}) }); assert.ok(result.ok, !result.ok ? result.error.message : ""); return result.state;
};
/** Estado a medida: cadena con extremos dados, manos y pozo fijos, turno de P0. */
function custom(base: GameState, hands: Record<string, TileId[]>, boneyard: TileId[], ends: [number, number], extra: Partial<GameState> = {}): GameState {
  return { ...base, hands, boneyard, chain: [{ id: "3-3", left: ends[0], right: ends[1], playedBy: "P1" }], leftEnd: ends[0], rightEnd: ends[1], currentPlayerId: "P0", consecutivePasses: 0, ...extra };
}

describe("Con robo: reparto y salida", () => {
  test("cinco fichas por jugador y ocho en el pozo, sin repetir ninguna de las 28", () => {
    const state = draw();
    for (const player of PLAYERS) assert.equal(state.hands[player.playerId]!.length, 5);
    assert.equal(state.boneyard!.length, 8);
    assert.equal(new Set([...Object.values(state.hands).flat(), ...state.boneyard!]).size, 28);
    assert.equal(state.rules, "DRAW"); assert.equal(ruleSetOf(state), DRAW_RULES); assert.equal(targetScore(state), 100);
  });

  test("sale quien tiene el doble más alto y solo puede salir con él", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = draw(dealFor(seed)); const all = Object.values(state.hands).flat();
      const doubles = all.filter((id) => id.split("-")[0] === id.split("-")[1]).sort((a, b) => Number(b[0]) - Number(a[0]));
      const actions = legalActions(state, state.currentPlayerId!);
      assert.equal(actions.length, 1);
      if (doubles.length) assert.equal(actions[0]!.tileId, doubles[0]);
      assert.ok(state.hands[state.currentPlayerId!]!.includes(actions[0]!.tileId!));
      const wrong = state.hands[state.currentPlayerId!]!.find((id) => id !== actions[0]!.tileId);
      if (wrong) { const result = transition(state, { type: "PLACE", actorId: state.currentPlayerId!, tileId: wrong }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "INVALID_OPENING"); }
    }
  });

  test("sin dobles en mano sale la ficha de más puntos", () => {
    const base = draw();
    const hands = { P0: ["0-1", "0-2", "1-2", "0-3", "1-3"], P1: ["5-6", "0-4", "1-4", "2-3", "0-5"], P2: ["1-5", "2-4", "0-6", "1-6", "2-5"], P3: ["3-4", "2-6", "3-5", "4-5", "3-6"] } as Record<string, TileId[]>;
    const opening = DRAW_RULES.opening({ ...base, hands });
    assert.deepEqual(opening, { playerId: "P1", tileId: "5-6" });
  });

  test("la salida queda registrada como centro de la mesa y la cadena sigue por los extremos", () => {
    let state = draw(); const opening = legalActions(state, state.currentPlayerId!)[0]!.tileId!;
    state = play(state, opening); assert.equal(state.openingTileId, opening); assert.equal(state.chain.length, 1);
  });

  test("objetivos 100, 150 y 200; cualquier otro y las parejas con robo se rechazan", () => {
    assert.equal(targetScore(draw(dealFor(3), 150)), 150);
    assert.equal(targetScore(startMatch("l", PLAYERS, dealFor(3), { targetScore: 200 }).state), 200);
    assert.throws(() => startMatch("x", PLAYERS, dealFor(3), { rules: "DRAW", targetScore: 120 as 100 }), /100, 150 or 200/);
    assert.throws(() => startMatch("x", PLAYERS, dealFor(3), { rules: "DRAW", mode: "PAIRS" }), /Only Latino/);
  });
});

describe("Con robo: robar y pasar", () => {
  const base = draw();
  test("sin jugada y con pozo, la única acción es robar; robar no pasa el turno", () => {
    const state = custom(base, { P0: ["0-1", "0-2"], P1: ["6-6"], P2: ["5-5"], P3: ["4-4"] }, ["2-4", "3-4", "1-6"], [3, 3]);
    assert.deepEqual(legalActions(state, "P0"), [{ type: "DRAW" }]);
    const pass = transition(state, { type: "PASS", actorId: "P0" }); assert.equal(pass.ok, false); if (!pass.ok) assert.equal(pass.error.code, "PASS_FORBIDDEN");
    const first = transition(state, { type: "DRAW", actorId: "P0" }); assert.ok(first.ok);
    assert.deepEqual(first.state.hands.P0, ["0-1", "0-2", "2-4"]); assert.deepEqual(first.state.boneyard, ["3-4", "1-6"]);
    assert.equal(first.state.currentPlayerId, "P0"); assert.deepEqual(first.events, [{ type: "TILE_DRAWN", actorId: "P0", boneyardCount: 2 }]);
    // Roba hasta poder: con el 3-4 ya puede colocar y robar se prohíbe.
    const second = transition(first.state, { type: "DRAW", actorId: "P0" }); assert.ok(second.ok);
    assert.deepEqual(legalActions(second.state, "P0"), [{ type: "PLACE", tileId: "3-4", side: "LEFT" }, { type: "PLACE", tileId: "3-4", side: "RIGHT" }]);
    const third = transition(second.state, { type: "DRAW", actorId: "P0" }); assert.equal(third.ok, false); if (!third.ok) assert.equal(third.error.code, "DRAW_FORBIDDEN");
  });

  test("con el pozo vacío, pasa; robar entonces se rechaza", () => {
    const state = custom(base, { P0: ["0-1"], P1: ["6-6"], P2: ["5-5"], P3: ["4-4"] }, [], [3, 3]);
    assert.deepEqual(legalActions(state, "P0"), [{ type: "PASS" }]);
    const result = transition(state, { type: "DRAW", actorId: "P0" }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "DRAW_FORBIDDEN");
    const passed = transition(state, { type: "PASS", actorId: "P0" }); assert.ok(passed.ok); assert.equal(passed.state.currentPlayerId, "P3");
  });

  test("la vista de cada jugador muestra cuántas quedan en el pozo, nunca cuáles", () => {
    const view = getPlayerView(draw(), "P0"); assert.equal(view.boneyardCount, 8); assert.equal("boneyard" in view, false); assert.equal("hands" in view, false);
    assert.equal("boneyardCount" in getPlayerView(startMatch("l", PLAYERS, dealFor(3)).state, "P0"), false);
  });

  test("solo roba quien tiene el turno", () => {
    const state = custom(base, { P0: ["0-1"], P1: ["6-6"], P2: ["5-5"], P3: ["4-4"] }, ["2-4"], [3, 3]);
    const result = transition(state, { type: "DRAW", actorId: "P1" }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "NOT_YOUR_TURN");
  });
});

describe("Con robo: final de mano y puntuación", () => {
  const base = draw();
  test("al dominar, el ganador suma los puntos en mano de los tres rivales", () => {
    const state = custom(base, { P0: ["3-4"], P1: ["6-6", "1-2"], P2: ["5-5"], P3: ["4-4", "0-0"] }, ["2-4"], [3, 3]);
    const result = transition(state, { type: "PLACE", actorId: "P0", tileId: "3-4", side: "RIGHT" }); assert.ok(result.ok);
    assert.equal(result.state.roundResult!.reason, "DOMINO"); assert.equal(result.state.roundResult!.winnerId, "P0");
    assert.equal(result.state.roundResult!.scoreDeltas.P0, 15 + 10 + 8); assert.equal(result.state.players.find((p) => p.playerId === "P0")!.score, 33);
  });

  test("tranque (pozo vacío y cuatro pases): gana quien menos tiene y suma los puntos de los rivales; empate en el mínimo, nadie", () => {
    let state = custom(base, { P0: ["0-1"], P1: ["6-6"], P2: ["5-5"], P3: ["4-4"] }, [], [3, 3]);
    for (const actorId of ["P0", "P3", "P2", "P1"]) { const result = transition(state, { type: "PASS", actorId }); assert.ok(result.ok); state = result.state; }
    assert.equal(state.phase, "ROUND_ENDED"); assert.equal(state.roundResult!.reason, "BLOCKED"); assert.equal(state.roundResult!.winnerId, "P0");
    assert.equal(state.roundResult!.scoreDeltas.P0, 12 + 10 + 8);
    let tie = custom(base, { P0: ["0-1"], P1: ["6-6"], P2: ["5-5"], P3: ["1-0" as TileId] }, [], [3, 3]);
    tie = { ...tie, hands: { ...tie.hands, P3: ["0-1"] } };
    assert.deepEqual(DRAW_RULES.scoreEndOfHand(tie, "BLOCKED", "P1").state.roundResult!.tiedPlayerIds, ["P0", "P3"]);
  });

  test("gana la partida quien llega al objetivo elegido; la mano siguiente vuelve a repartir 5 y 8", () => {
    const state = custom(draw(dealFor(3), 150), { P0: ["3-4"], P1: ["6-6"], P2: ["5-5"], P3: ["4-4"] }, [], [3, 3],
      { players: base.players.map((p) => ({ ...p, score: p.playerId === "P0" ? 120 : 0 })) });
    const result = transition(state, { type: "PLACE", actorId: "P0", tileId: "3-4", side: "LEFT" }); assert.ok(result.ok);
    assert.equal(result.state.phase, "MATCH_ENDED"); assert.equal(result.state.matchResult!.championId, "P0"); assert.equal(result.state.matchResult!.finalScores.P0, 150);
    const short = custom(base, { P0: ["3-4"], P1: ["0-1"], P2: ["0-2"], P3: ["0-0"] }, [], [3, 3]);
    const round = transition(short, { type: "PLACE", actorId: "P0", tileId: "3-4", side: "LEFT" }); assert.ok(round.ok); assert.equal(round.state.phase, "ROUND_ENDED");
    const next = nextRound(round.state, dealFor(9)); assert.ok(!("error" in next));
    assert.equal(next.state.boneyard!.length, 8); assert.equal(next.state.rules, "DRAW"); assert.equal(next.state.hands.P0!.length, 5);
  });

  test("partidas completas con bots que siempre eligen la primera acción terminan y conservan las 28 fichas", () => {
    for (let seed = 1; seed <= 25; seed++) {
      let state = draw(dealFor(seed)); let round = 0; let guard = 0;
      while (state.phase !== "MATCH_ENDED" && guard++ < 20_000) {
        if (state.phase === "ROUND_ENDED") { const next = nextRound(state, dealFor(seed * 50 + ++round)); assert.ok(!("error" in next)); state = next.state; continue; }
        const inPlay = [...Object.values(state.hands).flat(), ...state.boneyard!, ...state.chain.map((tile) => tile.id)];
        assert.equal(new Set(inPlay).size, 28);
        const action = legalActions(state, state.currentPlayerId!)[0]!;
        const result = transition(state, action.type === "PLACE" ? { type: "PLACE", actorId: state.currentPlayerId!, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } : { type: action.type, actorId: state.currentPlayerId! });
        assert.ok(result.ok); state = result.state;
      }
      assert.equal(state.phase, "MATCH_ENDED"); const champion = state.matchResult!.championId;
      assert.ok(state.matchResult!.finalScores[champion]! >= 100);
    }
  });

  test("Latino sigue sin pozo ni robo", () => {
    const state = startMatch("l", PLAYERS, dealFor(3)).state; assert.equal(state.boneyard, undefined); assert.equal(state.rules, undefined);
    assert.equal(ruleSetOf(state), LATINO_RULES); assert.equal(pipTotal(Object.values(state.hands).flat()), 168);
    const blocked = custom(state, { P0: ["0-1"], P1: ["6-6"], P2: ["5-5"], P3: ["4-4"] }, [], [3, 3]);
    const { boneyard: _omit, ...latino } = blocked; assert.deepEqual(legalActions(latino as GameState, "P0"), [{ type: "PASS" }]);
    void dealWithHands;
  });
});
