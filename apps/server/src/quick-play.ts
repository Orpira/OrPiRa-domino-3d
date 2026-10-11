import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { legalActions, shuffledDeal, type Deal, type Seat } from "../../../packages/rules/src/index.ts";
import type { CommandEnvelope, CommandResponse, LeagueAwardView, LeagueRankId, QuickPlayHistoryEntry, QuickPlayMatchView, QuickPlayView } from "../../../packages/protocol/src/index.ts";
import { AuthoritativeRoom, DEFAULT_TURN_CLOCK, type MatchStore, type TurnClockConfig } from "./authoritative-room.ts";

export interface QuickPlayConfig { readonly fillAfterMs: number }
// Espera provisional antes de completar la mesa con bots del servidor.
export const DEFAULT_QUICK_PLAY: QuickPlayConfig = Object.freeze({ fillAfterMs: 45_000 });
export interface PlayerIdentity { readonly identityId: string; readonly displayName: string }
type Identify = (token: string) => PlayerIdentity | null;
/** Puente hacia la liga: concede puntos de partidas terminadas y aporta rangos y desgloses a las vistas. */
export interface LeagueBridge {
  sync(entries: readonly QuickPlayHistoryEntry[]): Promise<unknown>;
  rankOf(identityId: string): LeagueRankId; awardFor(matchId: string, identityId: string): LeagueAwardView | null;
}

interface Ticket { readonly ticketId: string; readonly identityId: string; readonly displayName: string; readonly token: string; readonly joinedAt: number }
interface MatchSeat { readonly playerId: string; readonly displayName: string; readonly seat: Seat; readonly bot: boolean; readonly sessionId: string }
interface PublicMatch { readonly matchId: string; readonly startedAt: number; endedAt: number | null; readonly seats: MatchSeat[]; readonly dismissed: string[] }
interface Snapshot { readonly matches: readonly PublicMatch[]; readonly history: readonly QuickPlayHistoryEntry[] }

/** Práctica gratuita con emparejamiento público: sin entrada, saldo ni premio. La cola vive en memoria. */
export class QuickPlayManager {
  private readonly queue: Ticket[] = []; private readonly matches = new Map<string, PublicMatch>(); private readonly rooms = new Map<string, AuthoritativeRoom>();
  // Las partidas terminadas siguen visibles hasta que cada jugador sale del resultado (solo en memoria).
  private readonly endedRooms = new Map<string, AuthoritativeRoom>();
  private readonly history: QuickPlayHistoryEntry[] = []; private chain: Promise<void> = Promise.resolve();
  private readonly path: string; private readonly roomStore: MatchStore; private readonly identify: Identify; private readonly now: () => number;
  private readonly clock: TurnClockConfig; private readonly config: QuickPlayConfig;
  private constructor(path: string, roomStore: MatchStore, identify: Identify, now: () => number, clock: TurnClockConfig, config: QuickPlayConfig) {
    this.path = path; this.roomStore = roomStore; this.identify = identify; this.now = now; this.clock = clock; this.config = config;
  }

  static async open(path: string, roomStore: MatchStore, identify: Identify, now: () => number = Date.now, clock: TurnClockConfig = DEFAULT_TURN_CLOCK, config: QuickPlayConfig = DEFAULT_QUICK_PLAY) {
    const manager = new QuickPlayManager(path, roomStore, identify, now, clock, config);
    try {
      const saved = JSON.parse(await readFile(path, "utf8")) as Snapshot; manager.history.push(...saved.history);
      for (const match of saved.matches) {
        manager.matches.set(match.matchId, match); if (match.endedAt !== null) continue;
        const room = await AuthoritativeRoom.restore(match.matchId, () => manager.deal(match), roomStore, { clock, now }); if (room) manager.rooms.set(match.matchId, room);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return manager;
  }

  /** Entra en la cola. Repetir con la misma identidad no duplica; quien ya juega una partida pública la recupera. */
  join(token: string): Promise<QuickPlayView> { return this.serial(async () => {
    const player = this.player(token);
    if (!this.queue.some((ticket) => ticket.identityId === player.identityId) && !this.activeMatch(player.identityId)) {
      for (const match of this.matches.values()) if (match.endedAt !== null && match.seats.some((seat) => seat.playerId === player.identityId) && !match.dismissed.includes(player.identityId)) match.dismissed.push(player.identityId);
      this.queue.push({ ticketId: randomUUID(), identityId: player.identityId, displayName: player.displayName, token, joinedAt: this.now() });
      await this.formFullTables();
    }
    return this.viewFor(player);
  }); }
  cancel(token: string): Promise<QuickPlayView> { return this.serial(async () => {
    const player = this.player(token); const index = this.queue.findIndex((ticket) => ticket.identityId === player.identityId); if (index >= 0) this.queue.splice(index, 1); return this.viewFor(player);
  }); }
  /** Oculta el resultado de una partida pública terminada. */
  dismiss(token: string): Promise<QuickPlayView> { return this.serial(async () => {
    const player = this.player(token);
    for (const match of this.matches.values()) if (match.endedAt !== null && match.seats.some((seat) => seat.playerId === player.identityId) && !match.dismissed.includes(player.identityId)) match.dismissed.push(player.identityId);
    await this.persist(); return this.viewFor(player);
  }); }
  view(token: string): Promise<QuickPlayView> { return this.serial(async () => this.viewFor(this.player(token))); }
  historyFor(token: string): Promise<readonly QuickPlayHistoryEntry[]> { return this.serial(async () => {
    const player = this.player(token); return this.history.filter((entry) => entry.participants.some((participant) => participant.playerId === player.identityId)).slice().reverse();
  }); }
  command(token: string, envelope: CommandEnvelope): Promise<CommandResponse> { return this.serial(async () => {
    const player = this.player(token); const match = this.activeMatch(player.identityId); const room = match ? this.rooms.get(match.matchId) : null;
    if (!match || !room) return { ok: false, commandId: envelope.commandId, code: "MATCH_NOT_FOUND", message: "No tienes una partida pública en curso" };
    const response = await room.submit(token, envelope); await this.recordIfEnded(match, room); return response;
  }); }
  /** Pasada periódica: forma mesas, completa con bots tras la espera y avanza el reloj de las partidas. */
  tick(): Promise<void> { return this.serial(async () => {
    await this.formFullTables();
    const head = this.queue[0];
    if (head && this.now() - head.joinedAt >= this.config.fillAfterMs) await this.startMatch(this.queue.splice(0, Math.min(4, this.queue.length)));
    for (const match of this.matches.values()) {
      if (match.endedAt !== null) continue; const room = this.rooms.get(match.matchId); if (!room) continue;
      await room.advance(); await this.recordIfEnded(match, room);
    }
  }); }
  queueSize() { return this.queue.length; }
  historyEntries(): readonly QuickPlayHistoryEntry[] { return this.history; }
  attachLeague(league: LeagueBridge) { this.league = league; }
  private league: LeagueBridge | null = null;

  private async formFullTables() { while (this.queue.length >= 4) await this.startMatch(this.queue.splice(0, 4)); }
  private async startMatch(tickets: readonly Ticket[]) {
    const matchId = `quick-${randomUUID()}`; const seats: MatchSeat[] = tickets.map((ticket, index) => ({ playerId: ticket.identityId, displayName: ticket.displayName, seat: index as Seat, bot: false, sessionId: ticket.token }));
    for (let index = seats.length, number = 1; index < 4; index++, number++) seats.push({ playerId: `bot-${matchId.slice(-8)}-${number}`, displayName: `Bot ${number}`, seat: index as Seat, bot: true, sessionId: `bot-session-${randomUUID()}` });
    const match: PublicMatch = { matchId, startedAt: this.now(), endedAt: null, seats, dismissed: [] }; this.matches.set(matchId, match);
    this.rooms.set(matchId, await AuthoritativeRoom.create(matchId, seats.map(({ playerId, seat, sessionId }) => ({ playerId, seat, sessionId })), () => this.deal(match), this.roomStore,
      { clock: this.clock, now: this.now, botPlayerIds: seats.filter((seat) => seat.bot).map((seat) => seat.playerId) }));
    await this.persist();
  }
  private async recordIfEnded(match: PublicMatch, room: AuthoritativeRoom) {
    if (match.endedAt !== null || room.state.phase !== "MATCH_ENDED" || !room.state.matchResult) return;
    const automatic = new Set(room.automaticPlayerIds()); match.endedAt = this.now(); const result = room.state.matchResult;
    this.history.push({ matchId: match.matchId, startedAt: match.startedAt, endedAt: match.endedAt, championPlayerId: result.championId,
      participants: match.seats.map(({ playerId, displayName, seat, bot }) => ({ playerId, displayName, seat, bot, score: result.finalScores[playerId] ?? 0, endedAutomatic: automatic.has(playerId) })) });
    this.rooms.delete(match.matchId); this.endedRooms.set(match.matchId, room); await this.persist();
    // Si el proceso cae aquí, la reconciliación al arrancar concede los puntos pendientes desde este historial.
    await this.league?.sync([this.history.at(-1)!]);
  }
  private activeMatch(identityId: string) { for (const match of this.matches.values()) if (match.endedAt === null && match.seats.some((seat) => seat.playerId === identityId)) return match; return null; }
  private viewFor(player: PlayerIdentity): QuickPlayView {
    const position = this.queue.findIndex((ticket) => ticket.identityId === player.identityId);
    const group = position >= 0 ? this.queue.slice(position - (position % 4), position - (position % 4) + 4) : [];
    const ticket = position >= 0 ? { ticketId: this.queue[position]!.ticketId, joinedAt: this.queue[position]!.joinedAt, position: position + 1, waiting: group.map((entry) => entry.displayName),
      botsFillAt: group[0]!.joinedAt + this.config.fillAfterMs, serverNow: this.now() } : null;
    let match: PublicMatch | null = this.activeMatch(player.identityId);
    if (!match) match = [...this.matches.values()].filter((entry) => entry.endedAt !== null && entry.seats.some((seat) => seat.playerId === player.identityId) && !entry.dismissed.includes(player.identityId))
      .sort((left, right) => right.startedAt - left.startedAt)[0] ?? null;
    return { ticket, match: match ? this.matchView(match, player) : null };
  }
  private matchView(match: PublicMatch, player: PlayerIdentity): QuickPlayMatchView | null {
    const room = this.rooms.get(match.matchId) ?? this.endedRooms.get(match.matchId); const seat = match.seats.find((entry) => entry.playerId === player.identityId)!;
    if (!room) return null; const game = room.connect(seat.sessionId)!;
    return { matchId: match.matchId, status: match.endedAt === null ? "PLAYING" : "ENDED", viewerPlayerId: seat.playerId, seats: match.seats.map(({ playerId, displayName, seat: index, bot }) => ({ playerId, displayName, seat: index, bot })),
      game, legalActions: game.currentPlayerId === seat.playerId && game.phase === "ROUND_ACTIVE" ? legalActions(room.state, seat.playerId) : [], clock: room.clockView(),
      ranks: Object.fromEntries(match.seats.filter((entry) => !entry.bot).map((entry) => [entry.playerId, this.league?.rankOf(entry.playerId) ?? "DOUBLE_0"])),
      league: match.endedAt !== null ? this.league?.awardFor(match.matchId, seat.playerId) ?? null : null };
  }
  private player(token: string) { const player = this.identify(token); if (!player) throw new Error("UNAUTHENTICATED"); return player; }
  private deal(match: PublicMatch): Deal { const hands = shuffledDeal(); return Object.fromEntries(match.seats.map((seat, index) => [seat.playerId, hands[index]!])); }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const result = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    const run = async () => { try { resolve(await operation()); } catch (error) { reject(error); } }; this.chain = this.chain.then(run, run); return result;
  }
  private async persist() {
    await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.tmp`; const snapshot: Snapshot = { matches: [...this.matches.values()], history: this.history };
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.path);
  }
}
