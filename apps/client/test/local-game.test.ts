import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { legalActions, shuffledDeal, type Deal, type GameState } from "../../../packages/rules/src/index.ts";
import { randomFor } from "../../../packages/rules/test/helpers.ts";
import { HUMAN_ID, LOCAL_PLAYERS, LocalGame } from "../src/local-game.ts";

function seededDeal(seed: number): () => Deal {
  return () => {
    const hands = shuffledDeal(randomFor(seed));
    return Object.fromEntries(LOCAL_PLAYERS.map((player, index) => [player.playerId, hands[index]!]));
  };
}

function playHuman(game: LocalGame): GameState {
  const action = game.humanActions[0]!;
  return action.type === "PASS" ? game.passHuman() : game.placeHuman(action.tileId!, action.side);
}

describe("partida local humano contra tres bots", () => {
  test("bots y humano completan una partida reproducible hasta 100", () => {
    const game = new LocalGame(seededDeal(1));
    let guard = 2_000;
    while (game.state.phase !== "MATCH_ENDED" && guard-- > 0) {
      if (game.state.phase === "ROUND_ENDED") { game.startNextRound(); continue; }
      if (game.state.currentPlayerId === HUMAN_ID) playHuman(game); else game.playOneBotTurn();
    }
    assert.ok(guard > 0);
    assert.equal(game.state.phase, "MATCH_ENDED");
    assert.equal(game.state.players.find((p) => p.playerId === game.state.matchResult!.championId)!.score, 100);
    assert.ok(game.state.players.every((p) => p.score % 20 === 0));
  });

  test("cada turno del bot consume una sola revisión y una sola ficha o pase", () => {
    const game = new LocalGame(seededDeal(7));
    while (game.state.phase === "ROUND_ACTIVE" && game.state.currentPlayerId === HUMAN_ID) playHuman(game);
    assert.equal(game.state.phase, "ROUND_ACTIVE");
    const beforeRevision = game.state.revision;
    const beforeCount = Object.values(game.state.hands).flat().length;
    const actorId = game.state.currentPlayerId!;
    const wasPass = legalActions(game.state, actorId)[0]!.type === "PASS";
    game.playOneBotTurn();
    assert.equal(game.state.revision, beforeRevision + 1);
    assert.equal(Object.values(game.state.hands).flat().length, beforeCount - (wasPass ? 0 : 1));
  });

  test("una ronda nueva mantiene marcador y reinicia la mesa", () => {
    const game = new LocalGame(seededDeal(4));
    while (game.state.phase === "ROUND_ACTIVE") game.state.currentPlayerId === HUMAN_ID ? playHuman(game) : game.playOneBotTurn();
    const scores = game.state.players.map((p) => p.score);
    game.startNextRound();
    assert.deepEqual(game.state.players.map((p) => p.score), scores);
    assert.equal(game.state.chain.length, 0);
    assert.equal(game.state.consecutivePasses, 0);
  });

  test("reiniciar una partida terminada crea identidad y marcador nuevos", () => {
    const game = new LocalGame(seededDeal(1));
    const firstId = game.state.matchId;
    let guard = 2_000;
    while (game.state.phase !== "MATCH_ENDED" && guard-- > 0) {
      if (game.state.phase === "ROUND_ENDED") game.startNextRound();
      else if (game.state.currentPlayerId === HUMAN_ID) playHuman(game);
      else game.playOneBotTurn();
    }
    game.restart();
    assert.notEqual(game.state.matchId, firstId);
    assert.deepEqual(game.state.players.map((p) => p.score), [0, 0, 0, 0]);
    assert.equal(game.state.phase, "ROUND_ACTIVE");
  });
});
