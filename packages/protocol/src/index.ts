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
