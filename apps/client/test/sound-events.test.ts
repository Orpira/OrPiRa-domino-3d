import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrientedTile, TileId } from "../../../packages/rules/src/index.ts";
import { isCapicua, soundCues, type SoundSnapshot } from "../src/sound-events.ts";

const tile = (left: number, right: number, playedBy = "A"): OrientedTile => ({ id: `${Math.min(left, right)}-${Math.max(left, right)}` as TileId, left, right, playedBy });
const base: SoundSnapshot = { roundNumber: 1, phase: "ROUND_ACTIVE", chain: [tile(6, 6)], leftEnd: 6, rightEnd: 6, consecutivePasses: 0, roundResult: null, matchResult: null };
const domino = (winnerId: string | null, reason: "DOMINO" | "BLOCKED" = "DOMINO") => ({ reason, winnerId, tiedPlayerIds: [], handPipTotals: {}, scoreDeltas: {} });

describe("sonidos de la partida", () => {
  it("no suena al abrir ni al resincronizar muchas fichas a la vez", () => {
    assert.deepEqual(soundCues(null, base, "A"), []);
    const many = { ...base, chain: [tile(1, 6), tile(2, 1), tile(3, 2), tile(6, 6), tile(6, 5)] };
    assert.deepEqual(soundCues(base, many, "A"), []);
  });

  it("cada ficha suena al caer; los dobles y los pases forzados tienen sonido propio", () => {
    assert.deepEqual(soundCues(base, { ...base, chain: [...base.chain, tile(6, 4)], rightEnd: 4 }, "A"), ["place"]);
    assert.deepEqual(soundCues(base, { ...base, chain: [...base.chain, tile(6, 5), tile(5, 5)] }, "A"), ["place", "double"]);
    assert.deepEqual(soundCues(base, { ...base, consecutivePasses: 1 }, "A"), ["pass"]);
  });

  it("detecta la capicúa: la última ficha encajaba en los dos extremos distintos", () => {
    assert.equal(isCapicua({ leftEnd: 3, rightEnd: 5 }, tile(5, 3)), true);
    assert.equal(isCapicua({ leftEnd: 3, rightEnd: 5 }, tile(3, 4)), false);
    assert.equal(isCapicua({ leftEnd: 4, rightEnd: 4 }, tile(4, 4)), false);
    const before = { ...base, leftEnd: 3, rightEnd: 5 };
    const after = { ...before, chain: [...before.chain, tile(5, 3)], phase: "ROUND_ENDED" as const, roundResult: domino("A") };
    assert.deepEqual(soundCues(before, after, "A"), ["place", "capicua", "roundWin"]);
  });

  it("la ronda suena como victoria solo para quien la gana; sin jugador local, siempre", () => {
    const ended = (winner: string | null, reason: "DOMINO" | "BLOCKED") => ({ ...base, phase: "ROUND_ENDED" as const, roundResult: domino(winner, reason) });
    assert.deepEqual(soundCues(base, ended("A", "BLOCKED"), "A"), ["roundWinBlocked"]);
    assert.deepEqual(soundCues(base, ended("B", "DOMINO"), "A"), ["roundEnd"]);
    assert.deepEqual(soundCues(base, ended(null, "BLOCKED"), "A"), ["roundEnd"]);
    assert.deepEqual(soundCues(base, ended("B", "DOMINO"), undefined), ["roundWin"]);
  });

  it("el final de la partida y la nueva ronda", () => {
    const final = (champion: string) => ({ ...base, phase: "MATCH_ENDED" as const, roundResult: domino(champion), matchResult: { championId: champion, finalScores: {} } });
    assert.deepEqual(soundCues(base, final("A"), "A"), ["matchWin"]);
    assert.deepEqual(soundCues(base, final("B"), "A"), ["matchEnd"]);
    assert.deepEqual(soundCues({ ...base, phase: "ROUND_ENDED" }, { ...base, roundNumber: 2, chain: [] }, "A"), ["shuffle"]);
  });
  it("en parejas, la mano y la partida que gana el compañero suenan como propias", () => {
    const ending = { ...base, chain: [tile(6, 6), tile(6, 3)] };
    const partnerWins = { ...ending, phase: "ROUND_ENDED" as const, roundResult: { ...domino("B"), winningTeam: ["A", "B"] } };
    assert.deepEqual(soundCues(base, partnerWins, "A").filter((cue) => cue.startsWith("round")), ["roundWin"]);
    assert.deepEqual(soundCues(base, partnerWins, "C").filter((cue) => cue.startsWith("round")), ["roundEnd"]);
    const match = { ...partnerWins, phase: "MATCH_ENDED" as const, matchResult: { championId: "B", finalScores: {}, championTeam: ["A", "B"] } };
    assert.ok(soundCues(base, match, "A").includes("matchWin")); assert.ok(soundCues(base, match, "C").includes("matchEnd"));
  });
});
