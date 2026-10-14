import { chooseBotAction } from "../../../packages/bots/src/index.ts";
import {
  DOUBLE_SIX_SET, getPlayerView, legalActions, nextRound, RULES_VERSION, rulesId, shuffledDeal, startMatch, TARGET_OPTIONS, targetScore, transition,
  type Deal, type GameMode, type GameState, type LegalAction, type PlayerInput, type RulesId, type Side, type TargetScore, type TileId,
} from "../../../packages/rules/src/index.ts";

export const HUMAN_ID = "jugador";
export type LocalMode = "BOTS" | "PASS_AND_PLAY";
export const LOCAL_PLAYERS: readonly PlayerInput[] = [
  { playerId: HUMAN_ID, seat: 0 }, { playerId: "bot-izquierda", seat: 1 },
  { playerId: "bot-frente", seat: 2 }, { playerId: "bot-derecha", seat: 3 },
];
export const PLAYER_NAMES: Readonly<Record<string, string>> = {
  [HUMAN_ID]: "Tú", "bot-izquierda": "Luna", "bot-frente": "Bruno", "bot-derecha": "Vera",
};
export const LOCAL_HUMAN_NAMES: Readonly<Record<string, string>> = {
  [HUMAN_ID]: "Jugador 1", "bot-izquierda": "Jugador 2", "bot-frente": "Jugador 3", "bot-derecha": "Jugador 4",
};
export function playerName(playerId: string, mode: LocalMode): string {
  return (mode === "BOTS" ? PLAYER_NAMES : LOCAL_HUMAN_NAMES)[playerId] ?? playerId;
}

export type DealFactory = () => Deal;
export function randomDeal(): Deal {
  const hands = shuffledDeal();
  return Object.fromEntries(LOCAL_PLAYERS.map((player, index) => [player.playerId, hands[index]!]));
}

export class LocalGame {
  private matchCounter = 0;
  private _state: GameState;
  private readonly dealFactory: DealFactory;
  readonly mode: LocalMode;
  /** Individual o parejas, reglas y objetivo; una partida restaurada conserva los suyos. */
  readonly variant: GameMode; readonly rules: RulesId; readonly targetScore: TargetScore | undefined;
  constructor(dealFactory: DealFactory = randomDeal, mode: LocalMode = "BOTS", restoredState?: GameState, variant: GameMode = "INDIVIDUAL", options: { readonly rules?: RulesId; readonly targetScore?: TargetScore } = {}) {
    this.dealFactory = dealFactory;
    this.mode = mode;
    this.variant = restoredState ? restoredState.mode ?? "INDIVIDUAL" : variant;
    this.rules = restoredState ? rulesId(restoredState) : options.rules ?? "LATINO";
    this.targetScore = restoredState ? restoredState.targetScore : options.targetScore;
    if (restoredState && !isRestorableState(restoredState)) throw new Error("Checkpoint local inválido");
    this._state = restoredState ?? this.createMatch();
  }
  get state(): GameState { return this._state; }
  get currentActions(): readonly LegalAction[] { return this._state.currentPlayerId ? legalActions(this._state, this._state.currentPlayerId) : []; }
  get humanActions(): readonly LegalAction[] { return legalActions(this._state, HUMAN_ID); }
  get isHumanTurn(): boolean { return this.mode === "PASS_AND_PLAY" ? this._state.phase === "ROUND_ACTIVE" : this._state.phase === "ROUND_ACTIVE" && this._state.currentPlayerId === HUMAN_ID; }
  get isBotTurn(): boolean { return this.mode === "BOTS" && this._state.phase === "ROUND_ACTIVE" && this._state.currentPlayerId !== HUMAN_ID; }

  private createMatch(): GameState {
    this.matchCounter += 1;
    return startMatch(`local-${this.matchCounter}`, LOCAL_PLAYERS, this.dealFactory(), { mode: this.variant, rules: this.rules, ...(this.targetScore ? { targetScore: this.targetScore } : {}) }).state;
  }
  restart(): GameState { this._state = this.createMatch(); return this._state; }
  startNextRound(): GameState {
    const result = nextRound(this._state, this.dealFactory());
    if (!("events" in result)) throw new Error(result.error.message);
    this._state = result.state;
    return this._state;
  }
  placeCurrent(tileId: TileId, side?: Side): GameState {
    if (!this.isHumanTurn) throw new Error("No es tu turno");
    const actorId = this._state.currentPlayerId!;
    const command = { type: "PLACE" as const, actorId, tileId, ...(side ? { side } : {}), expectedRevision: this._state.revision };
    const result = transition(this._state, command);
    if (!result.ok) throw new Error(result.error.message);
    this._state = result.state;
    return this._state;
  }
  passCurrent(): GameState {
    if (!this.isHumanTurn) throw new Error("No es tu turno");
    const result = transition(this._state, { type: "PASS", actorId: this._state.currentPlayerId!, expectedRevision: this._state.revision });
    if (!result.ok) throw new Error(result.error.message);
    this._state = result.state;
    return this._state;
  }
  /** Con robo: roba una ficha del pozo; el turno sigue siendo suyo. */
  drawCurrent(): GameState {
    if (!this.isHumanTurn) throw new Error("No es tu turno");
    const result = transition(this._state, { type: "DRAW", actorId: this._state.currentPlayerId!, expectedRevision: this._state.revision });
    if (!result.ok) throw new Error(result.error.message);
    this._state = result.state;
    return this._state;
  }
  placeHuman(tileId: TileId, side?: Side): GameState { return this.placeCurrent(tileId, side); }
  passHuman(): GameState { return this.passCurrent(); }
  playOneBotTurn(): GameState {
    if (!this.isBotTurn) return this._state;
    const actorId = this._state.currentPlayerId!;
    const action = chooseBotAction({ view: getPlayerView(this._state, actorId), legalActions: legalActions(this._state, actorId) });
    const result = action.type !== "PLACE"
      ? transition(this._state, { type: action.type, actorId, expectedRevision: this._state.revision })
      : transition(this._state, { type: "PLACE", actorId, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}), expectedRevision: this._state.revision });
    if (!result.ok) throw new Error(`El bot produjo ${result.error.code}`);
    this._state = result.state;
    return this._state;
  }
}

export function isRestorableState(state: GameState): boolean {
  if (!state || state.rulesVersion !== RULES_VERSION || state.players.length !== 4 || state.revision < 1) return false;
  if (new Set(state.players.map((p) => p.playerId)).size !== 4 ||
      !LOCAL_PLAYERS.every((p) => state.players.some((candidate) => candidate.playerId === p.playerId && candidate.seat === p.seat))) return false;
  if (state.mode !== undefined && state.mode !== "PAIRS") return false;
  if (state.rules !== undefined && ((state.rules !== "DRAW" && state.rules !== "ALL_FIVES") || state.mode !== undefined)) return false;
  if (state.targetScore !== undefined && !TARGET_OPTIONS.includes(state.targetScore)) return false;
  // Con robo y en All Fives hay pozo; en Latino, nunca.
  if ((state.rules !== undefined) !== Array.isArray(state.boneyard)) return false;
  const target = targetScore(state); const badScore = (score: number) => !Number.isSafeInteger(score) || score < 0;
  if (state.mode === "PAIRS") {
    // En parejas los compañeros (asientos 0–2 y 1–3) comparten marcador; una mano reparte como mucho los 168 puntos del juego.
    const scoreOf = (seat: number) => state.players.find((p) => p.seat === seat)?.score ?? -1;
    if (state.players.some((p) => badScore(p.score) || p.score > target + 168) || scoreOf(0) !== scoreOf(2) || scoreOf(1) !== scoreOf(3)) return false;
  } else if (state.rules !== undefined) { if (state.players.some((p) => badScore(p.score) || p.score > target + 168)) return false; }
  else if (state.players.some((p) => badScore(p.score) || p.score > target + 19 || p.score % 20 !== 0)) return false;
  if (!["ROUND_ACTIVE", "ROUND_ENDED", "MATCH_ENDED"].includes(state.phase) || state.consecutivePasses < 0 || state.consecutivePasses > 4) return false;
  const playerIds = new Set(state.players.map((player) => player.playerId));
  if (Object.keys(state.hands).length !== 4 || Object.keys(state.hands).some((id) => !playerIds.has(id))) return false;
  if (state.phase === "ROUND_ACTIVE" ? !state.currentPlayerId || !playerIds.has(state.currentPlayerId) : state.currentPlayerId !== null) return false;
  if (state.chain.length === 0 ? state.leftEnd !== null || state.rightEnd !== null :
      state.leftEnd !== state.chain[0]!.left || state.rightEnd !== state.chain.at(-1)!.right) return false;
  for (let index = 0; index < state.chain.length; index += 1) {
    const oriented = state.chain[index]!; const canonical = DOUBLE_SIX_SET.find((tile) => tile.id === oriented.id);
    if (!canonical || !playerIds.has(oriented.playedBy) ||
        !((oriented.left === canonical.a && oriented.right === canonical.b) || (oriented.left === canonical.b && oriented.right === canonical.a))) return false;
    if (index > 0 && state.chain[index - 1]!.right !== oriented.left) return false;
  }
  const known = new Set(DOUBLE_SIX_SET.map((tile) => tile.id));
  const ids = [...Object.values(state.hands).flat(), ...state.chain.map((tile) => tile.id), ...(state.up ?? []).map((tile) => tile.id), ...(state.down ?? []).map((tile) => tile.id), ...(state.boneyard ?? [])];
  return ids.length === 28 && new Set(ids).size === 28 && ids.every((id) => known.has(id));
}
