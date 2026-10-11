import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MatchResult, Player, RoundResult } from "../../../packages/rules/src/index.ts";
import { dominationsRemaining, finalRanking, roundHeadline, shouldShowMatchFinale } from "../src/online-presentation.ts";

const players: readonly Player[] = [
  { playerId: "P0", seat: 0, score: 100 }, { playerId: "P1", seat: 1, score: 40 },
  { playerId: "P2", seat: 2, score: 40 }, { playerId: "P3", seat: 3, score: 20 },
];
const names = { P0: "Ana", P1: "Beto", P2: "Cora", P3: "Dani" };

describe("presentación online de objetivo y resultados", () => {
  test("calcula el progreso hacia 100 en dominadas de 20", () => {
    assert.equal(dominationsRemaining(0), 5); assert.equal(dominationsRemaining(20), 4);
    assert.equal(dominationsRemaining(80), 1); assert.equal(dominationsRemaining(100), 0);
  });

  test("explica dominada y cierre sin convertir +0 en final de partida", () => {
    const base = { tiedPlayerIds: [], handPipTotals: {}, scoreDeltas: { P0: 0, P1: 0, P2: 0, P3: 0 } };
    const closed: RoundResult = { ...base, reason: "BLOCKED", winnerId: "P1" };
    const domino: RoundResult = { ...base, reason: "DOMINO", winnerId: "P0", scoreDeltas: { ...base.scoreDeltas, P0: 20 } };
    assert.equal(roundHeadline(closed), "Ganador de ronda por cierre · +0 puntos");
    assert.equal(roundHeadline(domino), "Ganador de ronda por dominada · +20 puntos");
    assert.equal(shouldShowMatchFinale("ROUND_ENDED", null), false);
  });

  test("clasifica por puntuación y conserva empates", () => {
    const result: MatchResult = { championId: "P0", finalScores: { P0: 100, P1: 40, P2: 40, P3: 20 } };
    assert.deepEqual(finalRanking(players, names, result).map(({ name, score, rank, tied }) => ({ name, score, rank, tied })), [
      { name: "Ana", score: 100, rank: 1, tied: false }, { name: "Beto", score: 40, rank: 2, tied: true },
      { name: "Cora", score: 40, rank: 2, tied: true }, { name: "Dani", score: 20, rank: 4, tied: false },
    ]);
    assert.equal(shouldShowMatchFinale("MATCH_ENDED", result), true);
  });
});
