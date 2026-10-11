import { chooseBotAction } from "../../../packages/bots/src/index.ts";
import {
  getPlayerView, legalActions, nextRound, shuffledDeal, startMatch, transition,
  type Deal, type GameState, type LegalAction, type PlayerInput, type Side, type TileId,
} from "../../../packages/rules/src/index.ts";

export const HUMAN_ID = "jugador";
export const LOCAL_PLAYERS: readonly PlayerInput[] = [
  { playerId: HUMAN_ID, seat: 0 }, { playerId: "bot-izquierda", seat: 1 },
  { playerId: "bot-frente", seat: 2 }, { playerId: "bot-derecha", seat: 3 },
];
export const PLAYER_NAMES: Readonly<Record<string, string>> = {
  [HUMAN_ID]: "Tú", "bot-izquierda": "Luna", "bot-frente": "Bruno", "bot-derecha": "Vera",
};

export type DealFactory = () => Deal;
export function randomDeal(): Deal {
  const hands = shuffledDeal();
  return Object.fromEntries(LOCAL_PLAYERS.map((player, index) => [player.playerId, hands[index]!]));
}

export class LocalGame {
  private matchCounter = 0;
  private _state: GameState;
  private readonly dealFactory: DealFactory;
  constructor(dealFactory: DealFactory = randomDeal) {
    this.dealFactory = dealFactory;
    this._state = this.createMatch();
  }
  get state(): GameState { return this._state; }
  get humanActions(): readonly LegalAction[] { return legalActions(this._state, HUMAN_ID); }
  get isHumanTurn(): boolean { return this._state.phase === "ROUND_ACTIVE" && this._state.currentPlayerId === HUMAN_ID; }

  private createMatch(): GameState {
    this.matchCounter += 1;
    return startMatch(`local-${this.matchCounter}`, LOCAL_PLAYERS, this.dealFactory()).state;
  }
  restart(): GameState { this._state = this.createMatch(); return this._state; }
  startNextRound(): GameState {
    const result = nextRound(this._state, this.dealFactory());
    if (!("events" in result)) throw new Error(result.error.message);
    this._state = result.state;
    return this._state;
  }
  placeHuman(tileId: TileId, side?: Side): GameState {
    if (!this.isHumanTurn) throw new Error("No es tu turno");
    const command = { type: "PLACE" as const, actorId: HUMAN_ID, tileId, ...(side ? { side } : {}), expectedRevision: this._state.revision };
    const result = transition(this._state, command);
    if (!result.ok) throw new Error(result.error.message);
    this._state = result.state;
    return this._state;
  }
  passHuman(): GameState {
    if (!this.isHumanTurn) throw new Error("No es tu turno");
    const result = transition(this._state, { type: "PASS", actorId: HUMAN_ID, expectedRevision: this._state.revision });
    if (!result.ok) throw new Error(result.error.message);
    this._state = result.state;
    return this._state;
  }
  playOneBotTurn(): GameState {
    if (this._state.phase !== "ROUND_ACTIVE" || this._state.currentPlayerId === HUMAN_ID) return this._state;
    const actorId = this._state.currentPlayerId!;
    const action = chooseBotAction({ view: getPlayerView(this._state, actorId), legalActions: legalActions(this._state, actorId) });
    const result = action.type === "PASS"
      ? transition(this._state, { type: "PASS", actorId, expectedRevision: this._state.revision })
      : transition(this._state, { type: "PLACE", actorId, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}), expectedRevision: this._state.revision });
    if (!result.ok) throw new Error(`El bot produjo ${result.error.code}`);
    this._state = result.state;
    return this._state;
  }
}
