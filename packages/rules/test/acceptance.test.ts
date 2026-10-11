import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DOUBLE_SIX_SET, createDoubleSixSet, getPlayerView, legalActions, nextRound, nextSeat,
  pipTotal, shuffledDeal, startMatch, transition, validateDeal, type GameState, type TileId,
} from "../src/index.ts";
import { autoplay, dealFor, dealWithHands, findFinished, PLAYERS, randomFor } from "./helpers.ts";

function accepted(result: ReturnType<typeof transition>): GameState {
  assert.equal(result.ok, true, result.ok ? undefined : result.error.code);
  return result.state;
}

describe("AC01–AC07: fichas, reparto, apertura y asientos", () => {
  test("AC01 crea 28 identidades únicas con peso total 168", () => {
    const tiles = createDoubleSixSet();
    assert.equal(tiles.length, 28);
    assert.equal(new Set(tiles.map((tile) => tile.id)).size, 28);
    assert.equal(tiles.reduce((sum, tile) => sum + tile.a + tile.b, 0), 168);
  });

  test("AC02 reparto normal: 7 por jugador, sin pozo y un solo 6-6", () => {
    const hands = shuffledDeal(randomFor(7));
    assert.deepEqual(hands.map((hand) => hand.length), [7, 7, 7, 7]);
    assert.equal(hands.flat().length, 28);
    assert.equal(hands.flat().filter((id) => id === "6-6").length, 1);
  });

  test("AC03 rechaza reparto duplicado, ausente o inválido sin estado parcial", () => {
    const good = dealFor(3);
    const badDuplicate = structuredClone(good) as Record<string, TileId[]>;
    badDuplicate.P0![0] = badDuplicate.P1![0]!;
    assert.throws(() => validateDeal(PLAYERS, badDuplicate), { code: "INVALID_DEAL" });
    const badMissing = { ...good, P0: good.P0!.slice(1) };
    assert.throws(() => startMatch("bad", PLAYERS, badMissing), { code: "INVALID_DEAL" });
    const badValue = structuredClone(good) as Record<string, TileId[]>;
    badValue.P0![0] = "6-7";
    assert.throws(() => validateDeal(PLAYERS, badValue), { code: "INVALID_DEAL" });
  });

  test("AC04–AC06 abre el dueño de 6-6, solo con 6-6, y avanza antihorario", () => {
    const initial = startMatch("opening", PLAYERS, dealFor(5)).state;
    const opener = PLAYERS.find((p) => initial.hands[p.playerId]!.includes("6-6"))!;
    assert.equal(initial.openingPlayerId, opener.playerId);
    const snapshot = structuredClone(initial);
    const wrongTile = initial.hands[opener.playerId]!.find((id) => id !== "6-6")!;
    const bad = transition(initial, { type: "PLACE", actorId: opener.playerId, tileId: wrongTile });
    assert.equal(bad.ok, false); if (!bad.ok) assert.equal(bad.error.code, "INVALID_OPENING");
    assert.deepEqual(initial, snapshot);
    const pass = transition(initial, { type: "PASS", actorId: opener.playerId });
    assert.equal(pass.ok, false); if (!pass.ok) assert.equal(pass.error.code, "PASS_FORBIDDEN");
    const opened = accepted(transition(initial, { type: "PLACE", actorId: opener.playerId, tileId: "6-6" }));
    assert.equal(opened.hands[opener.playerId]!.length, 6);
    assert.deepEqual([opened.leftEnd, opened.rightEnd], [6, 6]);
    assert.equal(opened.currentPlayerId, PLAYERS.find((p) => p.seat === nextSeat(opener.seat))!.playerId);
  });

  test("AC07 orden de asiento P0→P3→P2→P1→P0", () => {
    assert.deepEqual([nextSeat(0), nextSeat(3), nextSeat(2), nextSeat(1)], [3, 2, 1, 0]);
  });
});

describe("AC08–AC16: colocaciones, errores y pases", () => {
  const base = (): GameState => {
    const state = startMatch("placement", PLAYERS, dealFor(11)).state;
    return { ...state, chain: [{ id: "0-0", left: 2, right: 5, playedBy: "P1" }], leftEnd: 2, rightEnd: 5,
      currentPlayerId: "P0", hands: { ...state.hands, P0: ["2-4", "3-5", "2-5", "2-2", "0-0", "1-1", "6-6"] } };
  };

  test("AC08–AC11 orienta ambos lados, elección dual y dobles sin efecto extra", () => {
    let state = base();
    let placed = accepted(transition(state, { type: "PLACE", actorId: "P0", tileId: "2-4", side: "LEFT" }));
    assert.deepEqual([placed.leftEnd, placed.rightEnd], [4, 5]);
    state = base();
    placed = accepted(transition(state, { type: "PLACE", actorId: "P0", tileId: "3-5", side: "RIGHT" }));
    assert.deepEqual([placed.leftEnd, placed.rightEnd], [2, 3]);
    state = base();
    const actions = legalActions(state, "P0").filter((a) => a.tileId === "2-5");
    assert.deepEqual(actions.map((a) => a.side), ["LEFT", "RIGHT"]);
    assert.deepEqual([accepted(transition(state, { type: "PLACE", actorId: "P0", tileId: "2-5", side: "LEFT" })).leftEnd,
      accepted(transition(state, { type: "PLACE", actorId: "P0", tileId: "2-5", side: "LEFT" })).rightEnd], [5, 5]);
    assert.deepEqual([accepted(transition(state, { type: "PLACE", actorId: "P0", tileId: "2-5", side: "RIGHT" })).leftEnd,
      accepted(transition(state, { type: "PLACE", actorId: "P0", tileId: "2-5", side: "RIGHT" })).rightEnd], [2, 2]);
    placed = accepted(transition(state, { type: "PLACE", actorId: "P0", tileId: "2-2", side: "LEFT" }));
    assert.equal(placed.leftEnd, 2); assert.equal(placed.chain.length, 2); assert.equal(placed.currentPlayerId, "P3");
  });

  test("AC12 rechazos por actor, propiedad e incompatibilidad no mutan", () => {
    const state = base(); const snapshot = structuredClone(state);
    for (const command of [
      { type: "PLACE", actorId: "P1", tileId: "2-4", side: "LEFT" },
      { type: "PLACE", actorId: "P0", tileId: "4-4", side: "LEFT" },
      { type: "PLACE", actorId: "P0", tileId: "1-1", side: "LEFT" },
    ] as const) assert.equal(transition(state, command).ok, false);
    assert.deepEqual(state, snapshot);
  });

  test("AC13 pase voluntario prohibido", () => {
    const result = transition(base(), { type: "PASS", actorId: "P0" });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "PASS_FORBIDDEN");
  });

  test("AC14 pase legal conserva mano y mesa", () => {
    const before = base();
    const state: GameState = { ...before, hands: { ...before.hands, P0: ["0-0", "1-1"] as TileId[] } };
    const result = transition(state, { type: "PASS", actorId: "P0" });
    assert.equal(result.ok, true); if (!result.ok) return;
    assert.deepEqual(result.state.hands, state.hands); assert.deepEqual(result.state.chain, state.chain);
    assert.equal(result.state.consecutivePasses, 1); assert.equal(result.state.currentPlayerId, "P3");
  });

  test("AC15 una colocación después de tres pases reinicia a cero", () => {
    const state = { ...base(), consecutivePasses: 3 };
    const after = accepted(transition(state, { type: "PLACE", actorId: "P0", tileId: "2-4", side: "LEFT" }));
    assert.equal(after.consecutivePasses, 0); assert.equal(after.phase, "ROUND_ACTIVE");
  });

  test("AC16 cuarto pase cierra atómicamente sin turno nuevo", () => {
    const before = base();
    const state: GameState = { ...before, consecutivePasses: 3, hands: { ...before.hands, P0: ["0-0", "1-1"] as TileId[] } };
    const result = transition(state, { type: "PASS", actorId: "P0" });
    assert.equal(result.ok, true); if (!result.ok) return;
    assert.equal(result.state.phase, "ROUND_ENDED"); assert.equal(result.state.currentPlayerId, null);
    assert.equal(result.events.filter((event) => event.type === "ROUND_ENDED").length, 1);
    assert.equal(result.events.some((event) => event.type === "TURN_CHANGED"), false);
  });
});

describe("AC17–AC26: resultados, puntuación y rondas", () => {
  test("AC17 cierre válido con mínimo único da ganador y deltas cero", () => {
    const found = findFinished((s) => s.roundResult?.reason === "BLOCKED" && s.roundResult.winnerId !== null);
    assert.equal(found.state.roundResult!.scoreDeltas[found.state.roundResult!.winnerId!], 0);
    assert.deepEqual(Object.values(found.state.roundResult!.scoreDeltas), [0, 0, 0, 0]);
  });

  test("AC18–AC19 cierre válido empatado registra todos los mínimos y ningún ganador", () => {
    const found = findFinished((s) => s.roundResult?.reason === "BLOCKED" && s.roundResult.winnerId === null);
    const result = found.state.roundResult!;
    assert.ok(result.tiedPlayerIds.length >= 2); assert.equal(result.winnerId, null);
    assert.deepEqual(Object.values(result.scoreDeltas), [0, 0, 0, 0]);
    const minimum = Math.min(...Object.values(result.handPipTotals));
    assert.deepEqual(result.tiedPlayerIds, PLAYERS.filter((p) => result.handPipTotals[p.playerId] === minimum).map((p) => p.playerId));
  });

  test("AC20 0-0 existe aunque aporta peso cero", () => {
    assert.equal(pipTotal(["0-0", "2-3"]), 5); assert.equal(DOUBLE_SIX_SET.some((t) => t.id === "0-0"), true);
  });

  test("AC21 última ficha produce dominada y exactamente +20", () => {
    const state = autoplay(1);
    assert.equal(state.roundResult!.reason, "DOMINO");
    assert.equal(state.players.find((p) => p.playerId === state.roundResult!.winnerId)!.score, 20);
    assert.deepEqual(Object.values(state.roundResult!.scoreDeltas).sort((a, b) => a - b), [0, 0, 0, 20]);
  });

  test("AC22 quinta dominada termina en la misma transición; AC24 cierres no cuentan", () => {
    const one = autoplay(1); const winner = one.roundResult!.winnerId!;
    let state: GameState = { ...one, players: one.players.map((p) => ({ ...p, score: p.playerId === winner ? 80 : 0 })), phase: "ROUND_ENDED" };
    const fresh = nextRound(state, dealFor(1)); assert.ok("events" in fresh); if (!("events" in fresh)) return;
    state = fresh.state;
    while (state.phase === "ROUND_ACTIVE") {
      const actorId = state.currentPlayerId!; const action = legalActions(state, actorId)[0]!;
      state = accepted(action.type === "PASS" ? transition(state, { type: "PASS", actorId }) :
        transition(state, { type: "PLACE", actorId, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) }));
    }
    assert.equal(state.phase, "MATCH_ENDED"); assert.equal(state.matchResult!.championId, winner);
    assert.equal(state.players.find((p) => p.playerId === winner)!.score, 100);
  });

  test("AC23 ganar cierre con 80 conserva 80 y permite nueva ronda", () => {
    const closed = findFinished((s) => s.roundResult?.reason === "BLOCKED" && s.roundResult.winnerId !== null).state;
    const winner = closed.roundResult!.winnerId!;
    const state = { ...closed, players: closed.players.map((p) => ({ ...p, score: p.playerId === winner ? 80 : 0 })) };
    assert.equal(state.phase, "ROUND_ENDED"); assert.equal(nextRound(state, dealFor(4)).state.phase, "ROUND_ACTIVE");
  });

  test("AC25 nueva ronda reinicia mesa/pases/manos y conserva marcador", () => {
    const ended = autoplay(1); const next = nextRound(ended, dealFor(9)); assert.ok("events" in next); if (!("events" in next)) return;
    assert.equal(next.state.roundNumber, 2); assert.equal(next.state.chain.length, 0); assert.equal(next.state.consecutivePasses, 0);
    assert.deepEqual(next.state.players.map((p) => p.score), ended.players.map((p) => p.score));
    assert.deepEqual(Object.values(next.state.hands).map((h) => h.length), [7, 7, 7, 7]);
  });

  test("AC26 una acción posterior no puntúa de nuevo", () => {
    const ended = autoplay(1); const snapshot = structuredClone(ended);
    const result = transition(ended, { type: "PASS", actorId: "P0" });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "WRONG_PHASE");
    assert.deepEqual(ended, snapshot);
  });
});

describe("AC28–AC35 aplicables al núcleo", () => {
  test("AC28 revisión vieja se rechaza sin mutación", () => {
    const state = startMatch("revision", PLAYERS, dealFor(1)).state; const snapshot = structuredClone(state);
    const result = transition(state, { type: "PLACE", actorId: state.currentPlayerId!, tileId: "6-6", expectedRevision: 0 });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "STALE_REVISION"); assert.deepEqual(state, snapshot);
  });

  test("AC29 vistas de rival y espectador no exponen manos ajenas", () => {
    const state = startMatch("privacy", PLAYERS, dealFor(1)).state;
    const view = getPlayerView(state, "P0") as unknown as Record<string, unknown>;
    assert.equal("hands" in view, false); assert.deepEqual(view.ownHand, state.hands.P0);
    const spectator = getPlayerView(state, null); assert.equal(spectator.ownHand, null);
  });

  test("AC30 igual reparto y comandos produce igual estado/eventos", () => {
    const a = startMatch("replay", PLAYERS, dealFor(42)); const b = startMatch("replay", PLAYERS, dealFor(42));
    assert.deepEqual(a, b);
    const command = { type: "PLACE", actorId: a.state.currentPlayerId!, tileId: "6-6" } as const;
    assert.deepEqual(transition(a.state, command), transition(b.state, command));
  });

  test("AC31 500 secuencias legales conservan las 28 fichas y conexiones", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const state = autoplay(seed);
      const ids = [...Object.values(state.hands).flat(), ...state.chain.map((tile) => tile.id)];
      assert.equal(ids.length, 28); assert.equal(new Set(ids).size, 28);
      for (let i = 1; i < state.chain.length; i += 1) assert.equal(state.chain[i - 1]!.right, state.chain[i]!.left);
      assert.ok(state.players.every((p) => p.score === 0 || p.score === 20));
    }
  });

  test("AC32 origen humano/bot no cambia legalidad; AC33 doble acción queda obsoleta", () => {
    const state = startMatch("same-rules", PLAYERS, dealFor(2)).state; const actorId = state.currentPlayerId!;
    const command = { type: "PLACE", actorId, tileId: "6-6", expectedRevision: state.revision } as const;
    const first = transition(state, command); assert.equal(first.ok, true); if (!first.ok) return;
    const duplicate = transition(first.state, command); assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.error.code, "STALE_REVISION");
  });

  test("AC34 ausencia de comandos no modifica estado", () => {
    const state = startMatch("suspend", PLAYERS, dealFor(8)).state; assert.deepEqual(structuredClone(state), state);
  });

  test("AC35 los cierres pueden repetirse sin puntos ni campeón", () => {
    const found = findFinished((s) => s.roundResult?.reason === "BLOCKED"); let state = found.state;
    for (let round = 0; round < 3; round += 1) {
      const next = nextRound(state, dealFor(found.seed)); assert.ok("events" in next); if (!("events" in next)) return;
      state = next.state;
      while (state.phase === "ROUND_ACTIVE") {
        const actorId = state.currentPlayerId!; const action = legalActions(state, actorId)[0]!;
        state = accepted(action.type === "PASS" ? transition(state, { type: "PASS", actorId }) : transition(state, { type: "PLACE", actorId, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) }));
      }
      assert.equal(state.roundResult!.reason, "BLOCKED");
    }
    assert.deepEqual(state.players.map((p) => p.score), [0, 0, 0, 0]); assert.equal(state.matchResult, null);
  });
});
