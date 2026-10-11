import type { DomainEvent, ErrorCode, LegalAction, PlayerView, Seat, Side, TileId } from "../../rules/src/index.ts";

export type ClientCommand =
  | { readonly type: "PLACE"; readonly tileId: TileId; readonly side?: Side }
  | { readonly type: "PASS" }
  | { readonly type: "NEXT_ROUND" };

export interface CommandEnvelope {
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly command: ClientCommand;
}

export type ServerErrorCode = ErrorCode | "UNAUTHENTICATED" | "MATCH_NOT_FOUND" | "COMMAND_ID_CONFLICT";
export type CommandResponse =
  | { readonly ok: true; readonly commandId: string; readonly view: PlayerView; readonly events: readonly DomainEvent[] }
  | { readonly ok: false; readonly commandId: string; readonly code: ServerErrorCode; readonly message: string; readonly view?: PlayerView };

export interface LobbyPlayer { readonly playerId: string; readonly name: string; readonly seat: Seat; readonly connected: boolean }
export interface LobbyView {
  readonly code: string;
  readonly status: "WAITING" | "PLAYING" | "ENDED";
  readonly players: readonly LobbyPlayer[];
  readonly viewerPlayerId: string;
  readonly game: PlayerView | null;
  readonly legalActions: readonly LegalAction[];
}
export interface SessionGrant { readonly code: string; readonly sessionId: string; readonly playerId: string }

// Valores provisionales del prototipo, fijados por el servidor; el cliente nunca los decide.
export interface SimulatedConditions {
  readonly currencyLabel: "COP simulados · sin valor monetario";
  readonly initialCredit: number;
  readonly entry: number;
  readonly playerCount: 4;
  readonly commissionPercent: number;
  readonly prize: number;
  readonly targetScore: 100;
  readonly expiresAfterMinutes: number;
  readonly version: number;
}
export type SimulatedMovementKind = "INITIAL_CREDIT" | "ENTRY_RESERVED" | "ENTRY_RELEASED" | "ENTRY_CONSUMED" | "PRIZE_AWARDED";
export interface SimulatedMovement {
  readonly movementId: string; readonly identityId: string; readonly competitionId: string | null;
  readonly kind: SimulatedMovementKind; readonly availableDelta: number; readonly reservedDelta: number; readonly createdAt: number;
}
export interface TestIdentityGrant { readonly identityId: string; readonly identityToken: string; readonly displayName: string }
export interface TestAccountView {
  readonly identityId: string; readonly displayName: string; readonly available: number; readonly reserved: number;
  readonly currencyLabel: SimulatedConditions["currencyLabel"]; readonly movements: readonly SimulatedMovement[];
}
export interface CompetitionMemberView { readonly identityId: string; readonly displayName: string; readonly seat: Seat; readonly accepted: boolean; readonly annulmentAccepted: boolean; readonly connected: boolean }
export interface CompetitionView {
  readonly competitionId: string; readonly code: string; readonly status: "WAITING" | "PLAYING" | "ENDED" | "CANCELLED" | "EXPIRED";
  readonly conditions: SimulatedConditions; readonly createdAt: number; readonly expiresAt: number; readonly cancellationReason: string | null;
  readonly viewerIdentityId: string; readonly members: readonly CompetitionMemberView[]; readonly game: PlayerView | null;
  readonly legalActions: readonly LegalAction[]; readonly settlement: null | { readonly championIdentityId: string; readonly matchId: string; readonly settledAt: number; readonly entry: number; readonly grossPrize: number; readonly commission: number; readonly netPrize: number };
}
