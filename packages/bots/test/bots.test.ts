import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chooseBotAction } from "../src/index.ts";
import { getPlayerView, legalActions, startMatch } from "../../rules/src/index.ts";
import { dealFor, PLAYERS } from "../../rules/test/helpers.ts";

describe("bots con información limitada", () => {
  test("elige exclusivamente entre acciones legales usando PlayerView", () => {
    const state = startMatch("bot-view", PLAYERS, dealFor(7)).state;
    const actorId = state.currentPlayerId!;
    const view = getPlayerView(state, actorId);
    assert.equal("hands" in (view as unknown as Record<string, unknown>), false);
    assert.deepEqual(view.ownHand, state.hands[actorId]);
    const actions = legalActions(state, actorId);
    assert.ok(actions.includes(chooseBotAction({ view, legalActions: actions })));
  });

  test("prioriza mayor peso sin conocer identidades rivales", () => {
    const state = startMatch("bot-weight", PLAYERS, dealFor(1)).state;
    const actorId = state.currentPlayerId!;
    const view = getPlayerView(state, actorId);
    const action = chooseBotAction({ view, legalActions: [{ type: "PLACE", tileId: "0-1", side: "LEFT" }, { type: "PLACE", tileId: "6-6", side: "RIGHT" }] });
    assert.equal(action.tileId, "6-6");
  });
});
