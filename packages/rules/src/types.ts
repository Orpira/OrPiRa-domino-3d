export const RULE_SET_ID = "latin-individual-double6-v1" as const;
export const RULES_VERSION = "1.0" as const;

export type Seat = 0 | 1 | 2 | 3;
export type Side = "LEFT" | "RIGHT";
export type Phase = "ROUND_ACTIVE" | "ROUND_ENDED" | "MATCH_ENDED";
export type TileId = `${number}-${number}`;

export interface Tile { readonly a: number; readonly b: number; readonly id: TileId }
export interface OrientedTile { readonly id: TileId; readonly left: number; readonly right: number; readonly playedBy: string }
export interface Player { readonly playerId: string; readonly seat: Seat; readonly score: number }
export interface RoundResult {
  readonly reason: "DOMINO" | "BLOCKED";
  readonly winnerId: string | null;
  readonly tiedPlayerIds: readonly string[];
  readonly handPipTotals: Readonly<Record<string, number>>;
  readonly scoreDeltas: Readonly<Record<string, number>>;
}
export interface MatchResult { readonly championId: string; readonly finalScores: Readonly<Record<string, number>> }
export interface GameState {
  readonly rulesVersion: typeof RULES_VERSION;
  readonly matchId: string;
  readonly roundId: string;
  readonly roundNumber: number;
  readonly revision: number;
  readonly phase: Phase;
  readonly players: readonly Player[];
  readonly hands: Readonly<Record<string, readonly TileId[]>>;
  readonly chain: readonly OrientedTile[];
  readonly leftEnd: number | null;
  readonly rightEnd: number | null;
  readonly openingPlayerId: string;
  readonly currentPlayerId: string | null;
  readonly consecutivePasses: number;
  readonly roundResult: RoundResult | null;
  readonly matchResult: MatchResult | null;
}

export type ErrorCode =
  | "INVALID_CONFIGURATION" | "INVALID_DEAL" | "WRONG_PHASE" | "NOT_YOUR_TURN"
  | "TILE_NOT_OWNED" | "INVALID_OPENING" | "INVALID_SIDE" | "TILE_DOES_NOT_MATCH"
  | "PASS_FORBIDDEN" | "STALE_REVISION";
export interface RuleError { readonly code: ErrorCode; readonly message: string }
export interface DomainEvent { readonly type: string; readonly [key: string]: unknown }
export type Transition =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly DomainEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly error: RuleError; readonly events: readonly [] };

export type Command =
  | { readonly type: "PLACE"; readonly actorId: string; readonly tileId: TileId; readonly side?: Side; readonly expectedRevision?: number }
  | { readonly type: "PASS"; readonly actorId: string; readonly expectedRevision?: number };

export interface LegalAction { readonly type: "PLACE" | "PASS"; readonly tileId?: TileId; readonly side?: Side }
export interface PlayerView extends Omit<GameState, "hands"> {
  readonly ownHand: readonly TileId[] | null;
  readonly handCounts: Readonly<Record<string, number>>;
}
