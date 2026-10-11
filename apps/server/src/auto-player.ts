import { createHash } from "node:crypto";
import { getPlayerView, legalActions, type GameState, type LegalAction } from "../../../packages/rules/src/index.ts";
import { chooseBotAction } from "../../../packages/bots/src/index.ts";

/**
 * Único jugador automático del servidor: turnos agotados, asientos en modo automático y bots.
 * Solo ve la vista privada del asiento y las acciones legales del motor; misma semilla y estado ⇒ misma jugada.
 */
export function chooseAutomaticAction(state: GameState, playerId: string, seed: string): LegalAction {
  if (state.phase !== "ROUND_ACTIVE" || state.currentPlayerId !== playerId) throw new Error("NOT_AUTOMATIC_TURN");
  const actions = legalActions(state, playerId);
  const digest = createHash("sha256").update(`${seed}:${state.revision}:${playerId}`).digest();
  return chooseBotAction({ view: getPlayerView(state, playerId), legalActions: actions }, (count) => digest.readUInt32BE(0) % count);
}
