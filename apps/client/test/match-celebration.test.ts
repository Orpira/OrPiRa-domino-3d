import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MatchResult } from "../../../packages/rules/src/index.ts";
import { claimMatchCelebration } from "../src/match-celebration.ts";
import type { StorageLike } from "../src/session-storage.ts";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const result: MatchResult = { championId: "P0", finalScores: { P0: 100, P1: 60, P2: 40, P3: 20 } };

describe("celebración de final de partida", () => {
  test("solo se activa con MATCH_ENDED confirmado y una vez por partida", () => {
    const storage = new MemoryStorage();
    assert.equal(claimMatchCelebration(storage, "m-1", "ROUND_ENDED", null, false), false);
    assert.equal(claimMatchCelebration(storage, "m-1", "MATCH_ENDED", result, false), true);
    assert.equal(claimMatchCelebration(storage, "m-1", "MATCH_ENDED", result, false), false);
    assert.equal(claimMatchCelebration(storage, "m-2", "MATCH_ENDED", result, false), true);
  });

  test("recarga o reconexión conserva el final sin repetir y movimiento reducido queda estático", () => {
    const storage = new MemoryStorage();
    assert.equal(claimMatchCelebration(storage, "reducida", "MATCH_ENDED", result, true), false);
    assert.equal(claimMatchCelebration(storage, "reducida", "MATCH_ENDED", result, false), false);
    assert.equal(claimMatchCelebration(storage, "normal", "MATCH_ENDED", result, false), true);
    assert.equal(claimMatchCelebration(storage, "normal", "MATCH_ENDED", result, false), false);
  });
});
