import { legalActions, nextRound, startMatch, transition, type DomainEvent, type GameState } from "../src/index.ts";
import { dealFor, PLAYERS } from "../test/helpers.ts";

const DEAL_SEED = 1;
let state = startMatch("replay-to-100", PLAYERS, dealFor(DEAL_SEED)).state;
const transcript: Array<{ round: number; revision: number; eventTypes: string[] }> = [];

while (state.phase !== "MATCH_ENDED") {
  while (state.phase === "ROUND_ACTIVE") {
    const actorId = state.currentPlayerId!;
    const action = legalActions(state, actorId)[0]!;
    const result = action.type === "PASS"
      ? transition(state, { type: "PASS", actorId, expectedRevision: state.revision })
      : transition(state, { type: "PLACE", actorId, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}), expectedRevision: state.revision });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    state = result.state;
    transcript.push({ round: state.roundNumber, revision: state.revision, eventTypes: result.events.map((event: DomainEvent) => event.type) });
  }
  if (state.phase === "ROUND_ENDED") {
    const next = nextRound(state, dealFor(DEAL_SEED));
    if (!("events" in next)) throw new Error(next.error.message);
    state = next.state;
  }
}

const output = {
  matchId: state.matchId,
  deterministicDealSeed: DEAL_SEED,
  rounds: state.roundNumber,
  championId: state.matchResult!.championId,
  finalScores: state.matchResult!.finalScores,
  acceptedTransitions: transcript.length,
  lastTransitionEvents: transcript.at(-1)!.eventTypes,
};
console.log(JSON.stringify(output, null, 2));
