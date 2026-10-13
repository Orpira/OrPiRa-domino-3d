import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  freeOpening, legalActions, nextRound, partnerOf, PAIRS_TARGET, startMatch, targetScore, teamOf, transition, type GameState,
} from "../src/index.ts";
import { dealFor, PLAYERS } from "./helpers.ts";

/** Juega la mano en curso hasta que termine, siempre con la primera acción legal. */
function playRound(start: GameState): GameState {
  let state = start; let guard = 200;
  while (state.phase === "ROUND_ACTIVE" && guard-- > 0) {
    const actorId = state.currentPlayerId!; const action = legalActions(state, actorId)[0]!;
    const result = action.type === "PASS" ? transition(state, { type: "PASS", actorId })
      : transition(state, { type: "PLACE", actorId, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) });
    assert.equal(result.ok, true, result.ok ? undefined : result.error.code); state = result.state;
  }
  return state;
}
const pairsMatch = (seed: number) => startMatch(`pairs-${seed}`, PLAYERS, dealFor(seed), { mode: "PAIRS" }).state;
function findRound(predicate: (state: GameState) => boolean): GameState {
  for (let seed = 1; seed < 5000; seed += 1) { const state = playRound(pairsMatch(seed)); if (predicate(state)) return state; }
  throw new Error("Sin mano que cumpla la condición");
}
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe("Modo parejas", () => {
  test("los compañeros se sientan enfrente (0–2 y 1–3) y la partida es a 200", () => {
    const state = pairsMatch(1);
    assert.deepEqual(teamOf(state, "P0"), ["P0", "P2"]); assert.deepEqual(teamOf(state, "P3"), ["P1", "P3"]);
    assert.equal(partnerOf(state, "P1"), "P3"); assert.equal(targetScore(state), PAIRS_TARGET); assert.equal(state.mode, "PAIRS");
    const individual = startMatch("solo", PLAYERS, dealFor(1)).state;
    assert.equal("mode" in individual, false, "las partidas individuales no cambian de forma"); assert.equal(targetScore(individual), 100);
    assert.deepEqual(teamOf(individual, "P0"), ["P0"]); assert.equal(partnerOf(individual, "P0"), null);
  });

  test("la primera mano la abre el 6–6, como siempre", () => {
    const state = pairsMatch(4);
    assert.equal(freeOpening(state), false);
    assert.deepEqual(legalActions(state, state.currentPlayerId!), [{ type: "PLACE", tileId: "6-6" }]);
  });

  test("al dominar, la pareja ganadora se lleva los puntos de las cuatro manos", () => {
    const state = findRound((candidate) => candidate.roundResult?.reason === "DOMINO");
    const result = state.roundResult!; const pot = sum(Object.values(result.handPipTotals));
    assert.equal(result.handPipTotals[result.winnerId!], 0);
    assert.deepEqual(result.winningTeam, teamOf(state, result.winnerId!));
    for (const player of state.players) {
      const expected: number = result.winningTeam!.includes(player.playerId) ? pot : 0;
      assert.equal(result.scoreDeltas[player.playerId], expected); assert.equal(player.score, expected);
    }
    assert.equal(result.nextOpenerId, result.winnerId);
  });

  test("en tranque gana la pareja con menos puntos y se lleva todos; quien cerró sale después", () => {
    const state = findRound((candidate) => candidate.roundResult?.reason === "BLOCKED" && candidate.roundResult.winningTeam !== undefined);
    const result = state.roundResult!; const totals = result.handPipTotals; const pot = sum(Object.values(totals));
    const team = result.winningTeam!; const rivals = state.players.map((p) => p.playerId).filter((id) => !team.includes(id));
    assert.ok(sum(team.map((id) => totals[id]!)) < sum(rivals.map((id) => totals[id]!)));
    for (const id of team) assert.equal(result.scoreDeltas[id], pot);
    for (const id of rivals) assert.equal(result.scoreDeltas[id], 0);
    assert.ok(result.winnerId && team.includes(result.winnerId));
    assert.ok(state.players.some((p) => p.playerId === result.nextOpenerId), "queda anotado quién cerró para salir en la siguiente");
  });

  test("si en tranque las dos parejas empatan, nadie suma", () => {
    const state = findRound((candidate) => candidate.roundResult?.reason === "BLOCKED" && candidate.roundResult.winningTeam === undefined);
    assert.equal(state.roundResult!.winnerId, null); assert.equal(state.roundResult!.tiedPlayerIds.length, 4);
    assert.ok(state.players.every((p) => p.score === 0));
  });

  test("desde la segunda mano sale quien ganó, con la ficha que quiera y sin lado", () => {
    const ended = findRound((candidate) => candidate.phase === "ROUND_ENDED");
    const next = nextRound(ended, dealFor(99)); assert.ok("events" in next); const state = next.state;
    assert.equal(freeOpening(state), true); assert.equal(state.currentPlayerId, ended.roundResult!.nextOpenerId);
    const opener = state.currentPlayerId!; const hand = state.hands[opener]!;
    assert.deepEqual(legalActions(state, opener), hand.map((tileId) => ({ type: "PLACE", tileId })));
    const tile = hand.find((id) => id !== "6-6")!;
    const withSide = transition(state, { type: "PLACE", actorId: opener, tileId: tile, side: "LEFT" });
    assert.equal(withSide.ok, false); assert.equal(!withSide.ok && withSide.error.code, "INVALID_SIDE");
    const placed = transition(state, { type: "PLACE", actorId: opener, tileId: tile }); assert.equal(placed.ok, true);
    assert.equal(placed.state.chain[0]!.id, tile); assert.equal(placed.state.openingTileId, tile, "la mesa sabe con qué ficha se salió");
  });

  test("la partida termina cuando una pareja llega a 200; ambos compañeros con el mismo marcador", () => {
    let state = pairsMatch(7); let rounds = 0;
    while (state.phase !== "MATCH_ENDED" && rounds++ < 60) {
      state = playRound(state);
      const [a, b, c, d] = [0, 1, 2, 3].map((seat) => state.players.find((p) => p.seat === seat)!.score);
      assert.equal(a, c); assert.equal(b, d);
      if (state.phase === "ROUND_ENDED") { const next = nextRound(state, dealFor(1000 + rounds)); assert.ok("events" in next); state = next.state; }
    }
    assert.equal(state.phase, "MATCH_ENDED");
    const match = state.matchResult!; assert.equal(match.championTeam!.length, 2);
    for (const id of match.championTeam!) assert.ok(match.finalScores[id]! >= PAIRS_TARGET);
    assert.ok(match.championTeam!.includes(match.championId));
  });
});
