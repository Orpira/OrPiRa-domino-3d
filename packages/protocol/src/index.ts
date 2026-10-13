import type { DomainEvent, ErrorCode, GameMode, LegalAction, RulesId, PlayerView, Seat, Side, TileId } from "../../rules/src/index.ts";

export type ClientCommand =
  | { readonly type: "PLACE"; readonly tileId: TileId; readonly side?: Side }
  | { readonly type: "PASS" }
  // Con robo: roba una ficha del pozo (solo sin jugada posible y con fichas en el pozo).
  | { readonly type: "DRAW" }
  | { readonly type: "NEXT_ROUND" }
  // Pide recuperar el control de un asiento en modo automático; se aplica desde su siguiente turno.
  | { readonly type: "RESUME_CONTROL" };

export interface CommandEnvelope {
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly command: ClientCommand;
}

export type ServerErrorCode = ErrorCode | "UNAUTHENTICATED" | "MATCH_NOT_FOUND" | "COMMAND_ID_CONFLICT" | "NOT_AUTOMATIC";
export type CommandResponse =
  | { readonly ok: true; readonly commandId: string; readonly view: PlayerView; readonly events: readonly DomainEvent[] }
  | { readonly ok: false; readonly commandId: string; readonly code: ServerErrorCode; readonly message: string; readonly view?: PlayerView };

export type AutomaticReason = "TIMEOUT" | "AUTO_MODE" | "BOT";
export interface AutomaticMove {
  readonly revision: number; readonly playerId: string; readonly reason: AutomaticReason;
  readonly action: "PLACE" | "PASS" | "DRAW"; readonly tileId?: TileId; readonly side?: Side; readonly at: number;
}
export interface SeatControlView {
  readonly playerId: string; readonly bot: boolean; readonly automatic: boolean;
  readonly consecutiveTimeouts: number; readonly resumeRequested: boolean; readonly connected: boolean;
}
// El servidor es la única autoridad del reloj; el cliente solo dibuja la cuenta atrás hasta `turnDeadline`.
export interface TurnClockView {
  readonly turnDeadline: number | null; readonly deadlineKind: "TURN" | "ROUND_BREAK" | null; readonly serverNow: number;
  readonly turnSeconds: number; readonly seats: readonly SeatControlView[]; readonly automaticMoves: readonly AutomaticMove[];
}

export interface LobbyPlayer { readonly playerId: string; readonly name: string; readonly seat: Seat; readonly connected: boolean }
export interface LobbyView {
  readonly code: string;
  readonly mode: GameMode;
  readonly rules: RulesId;
  /** Objetivo efectivo de la partida (el elegido o el de la modalidad). */
  readonly targetScore: number;
  readonly status: "WAITING" | "PLAYING" | "ENDED";
  readonly players: readonly LobbyPlayer[];
  readonly viewerPlayerId: string;
  readonly game: PlayerView | null;
  readonly legalActions: readonly LegalAction[];
  readonly clock: TurnClockView | null;
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
  readonly results: readonly CompetitionResultSummary[];
}
export interface CompetitionMemberView { readonly identityId: string; readonly displayName: string; readonly seat: Seat; readonly accepted: boolean; readonly annulmentAccepted: boolean; readonly connected: boolean }
export interface CompetitionView {
  readonly competitionId: string; readonly code: string; readonly status: "WAITING" | "PLAYING" | "ENDED" | "CANCELLED" | "EXPIRED";
  readonly conditions: SimulatedConditions; readonly createdAt: number; readonly expiresAt: number; readonly cancellationReason: string | null;
  readonly viewerIdentityId: string; readonly members: readonly CompetitionMemberView[]; readonly game: PlayerView | null;
  readonly legalActions: readonly LegalAction[]; readonly clock: TurnClockView | null; readonly ranks?: Readonly<Record<string, LeagueRankId>>;
  readonly settlement: null | { readonly championIdentityId: string; readonly matchId: string; readonly settledAt: number; readonly automaticIdentityIds: readonly string[]; readonly entry: number; readonly grossPrize: number; readonly commission: number; readonly netPrize: number };
}

export interface CompetitionResultSummary {
  readonly competitionId: string; readonly endedAt: number; readonly status: "ENDED" | "CANCELLED" | "EXPIRED";
  readonly championName: string | null; readonly automaticNames: readonly string[]; readonly viewerAutomatic: boolean;
}

// Jugar ahora: práctica gratuita, sin entrada, saldo ni premio.
export interface QuickPlaySeat { readonly playerId: string; readonly displayName: string; readonly seat: Seat; readonly bot: boolean }
export interface QuickPlayTicket { readonly mode: GameMode; readonly rules: RulesId; readonly ticketId: string; readonly joinedAt: number; readonly position: number; readonly waiting: readonly string[]; readonly botsFillAt: number; readonly serverNow: number }
export interface QuickPlayMatchView {
  readonly matchId: string; readonly mode: GameMode; readonly rules: RulesId; readonly status: "PLAYING" | "ENDED"; readonly viewerPlayerId: string; readonly seats: readonly QuickPlaySeat[];
  readonly game: PlayerView; readonly legalActions: readonly LegalAction[]; readonly clock: TurnClockView;
  // Rango de liga de cada asiento humano (los bots no tienen) y puntos concedidos al espectador al terminar.
  readonly ranks: Readonly<Record<string, LeagueRankId>>; readonly league: LeagueAwardView | null;
}
export interface QuickPlayView { readonly ticket: QuickPlayTicket | null; readonly match: QuickPlayMatchView | null }
export interface QuickPlayHistoryEntry {
  readonly matchId: string; readonly startedAt: number; readonly endedAt: number; readonly championPlayerId: string;
  // Ausente en partidas anteriores a las parejas: individuales. En parejas, los compañeros comparten marcador.
  readonly mode?: GameMode;
  // Ausente en partidas anteriores a las modalidades: Latino. Solo Latino puntúa en la liga.
  readonly rules?: RulesId;
  readonly participants: readonly { readonly playerId: string; readonly displayName: string; readonly seat: Seat; readonly bot: boolean; readonly score: number; readonly endedAutomatic: boolean }[];
}

// Liga: puntos de temporada sin valor monetario, alimentados solo por partidas de «Jugar ahora».
export type LeagueRankId = "DOUBLE_0" | "DOUBLE_1" | "DOUBLE_2" | "DOUBLE_3" | "DOUBLE_4" | "DOUBLE_5" | "DOUBLE_6";
export interface LeagueRankView { readonly id: LeagueRankId; readonly name: string; readonly pips: number; readonly minPoints: number }
export interface LeagueAwardView {
  readonly matchId: string; readonly seasonId: string; readonly position: number; readonly basePoints: number; readonly humans: number;
  readonly automatic: boolean; readonly points: number; readonly previousRank: LeagueRankId; readonly newRank: LeagueRankId; readonly promoted: boolean; readonly awardedAt: number;
}
export interface LeagueStandingRow { readonly position: number; readonly alias: string; readonly rank: LeagueRankId; readonly points: number; readonly viewer: boolean }
export interface LeagueViewerStanding {
  readonly alias: string; readonly points: number; readonly rank: LeagueRankId; readonly nextRank: LeagueRankId | null; readonly pointsToNext: number | null;
  readonly position: number | null; readonly matches: number;
}
export interface LeagueSeasonView { readonly id: string; readonly label: string; readonly startsAt: number; readonly endsAt: number; readonly timeZone: string }
export interface LeagueView {
  readonly season: LeagueSeasonView; readonly serverNow: number; readonly daysLeft: number; readonly ranks: readonly LeagueRankView[];
  readonly positionPoints: readonly number[]; readonly top: readonly LeagueStandingRow[]; readonly totalPlayers: number; readonly viewer: LeagueViewerStanding | null;
}
export interface LeagueArchivedSeason { readonly seasonId: string; readonly label: string; readonly points: number; readonly position: number; readonly rank: LeagueRankId; readonly totalPlayers: number }
export interface LeagueHistoryView { readonly awards: readonly LeagueAwardView[]; readonly seasons: readonly LeagueArchivedSeason[] }
