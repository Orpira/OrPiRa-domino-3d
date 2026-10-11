import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { shuffledDeal, type Deal, type GameState } from "../../../packages/rules/src/index.ts";
import { randomFor } from "../../../packages/rules/test/helpers.ts";
import { LOCAL_PLAYERS, LocalGame } from "../src/local-game.ts";
import { clearSession, loadSession, saveSession, type StorageLike } from "../src/session-storage.ts";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function deal(): Deal {
  const hands = shuffledDeal(randomFor(22));
  return Object.fromEntries(LOCAL_PLAYERS.map((player, index) => [player.playerId, hands[index]!]));
}

describe("checkpoint local y modalidad de relevo", () => {
  test("guarda y restaura exactamente estado, modalidad y pantalla privada", () => {
    const storage = new MemoryStorage(); const game = new LocalGame(deal, "PASS_AND_PLAY");
    saveSession(storage, { version: 1, mode: game.mode, state: game.state, handoffRequired: true });
    const saved = loadSession(storage)!;
    const restored = new LocalGame(deal, saved.mode, saved.state);
    assert.deepEqual(restored.state, game.state); assert.equal(saved.handoffRequired, true); assert.equal(restored.mode, "PASS_AND_PLAY");
  });

  test("rechaza checkpoints corruptos sin inventar fichas", () => {
    const storage = new MemoryStorage(); const game = new LocalGame(deal);
    const corrupt = structuredClone(game.state) as GameState;
    (corrupt.hands[corrupt.players[0]!.playerId] as unknown as string[])[0] = "6-7";
    storage.setItem("orpira-domino-3d:local-session:v1", JSON.stringify({ version: 1, mode: "BOTS", state: corrupt, handoffRequired: false }));
    assert.equal(loadSession(storage), null);
  });

  test("cuatro humanos pueden completar una partida hasta 100 sin activar bots", () => {
    const game = new LocalGame(deal, "PASS_AND_PLAY");
    const initial = game.state; game.playOneBotTurn(); assert.equal(game.state, initial);
    let guard = 2_000;
    while (game.state.phase !== "MATCH_ENDED" && guard-- > 0) {
      if (game.state.phase === "ROUND_ENDED") { game.startNextRound(); continue; }
      const action = game.currentActions[0]!;
      if (action.type === "PASS") game.passCurrent(); else game.placeCurrent(action.tileId!, action.side);
    }
    assert.ok(guard > 0); assert.equal(game.state.phase, "MATCH_ENDED");
    assert.equal(game.state.players.find((player) => player.playerId === game.state.matchResult!.championId)!.score, 100);
  });

  test("permite eliminar el checkpoint", () => {
    const storage = new MemoryStorage(); const game = new LocalGame(deal);
    saveSession(storage, { version: 1, mode: game.mode, state: game.state, handoffRequired: false }); clearSession(storage);
    assert.equal(loadSession(storage), null);
  });
});
