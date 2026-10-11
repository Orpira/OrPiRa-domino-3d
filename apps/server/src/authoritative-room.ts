import {
  getPlayerView, nextRound, startMatch, transition,
  type Deal, type DomainEvent, type GameState, type PlayerInput, type RuleError,
} from "../../../packages/rules/src/index.ts";
import type { AutomaticMove, AutomaticReason, CommandEnvelope, CommandResponse, ServerErrorCode, TurnClockView } from "../../../packages/protocol/src/index.ts";
import { chooseAutomaticAction } from "./auto-player.ts";

export interface SessionPlayer extends PlayerInput { readonly sessionId: string }
export interface TurnClockConfig {
  readonly turnMs: number; readonly automaticDelayMs: number; readonly roundBreakMs: number;
  readonly disconnectAutoMs: number; readonly timeoutsForAuto: number;
}
// Valores provisionales del prototipo; el servidor los fija y el cliente solo los muestra.
export const DEFAULT_TURN_CLOCK: TurnClockConfig = Object.freeze({ turnMs: 30_000, automaticDelayMs: 1_200, roundBreakMs: 10_000, disconnectAutoMs: 60_000, timeoutsForAuto: 2 });
interface SeatControl { readonly playerId: string; readonly bot: boolean; automatic: boolean; consecutiveTimeouts: number; resumeRequested: boolean; lastSeen: number }
interface RoomControl { readonly seats: SeatControl[]; clockRevision: number; deadline: number | null; deadlineKind: TurnClockView["deadlineKind"]; readonly automaticMoves: AutomaticMove[] }
export interface RoomSnapshot { readonly state: GameState; readonly sessions: readonly SessionPlayer[]; readonly processed: readonly (readonly [string, Cached])[]; readonly control?: RoomControl }
export interface MatchStore { load(matchId: string): Promise<RoomSnapshot | null>; save(matchId: string, snapshot: RoomSnapshot): Promise<void> }
export class MemoryMatchStore implements MatchStore {
  private readonly values = new Map<string, RoomSnapshot>();
  async load(matchId: string) { return structuredClone(this.values.get(matchId) ?? null); }
  async save(matchId: string, snapshot: RoomSnapshot) { this.values.set(matchId, structuredClone(snapshot)); }
}
export interface RoomOptions { readonly clock?: TurnClockConfig; readonly now?: () => number; readonly botPlayerIds?: readonly string[] }

type DealFactory = () => Deal;
export interface Cached { readonly fingerprint: string; readonly response: CommandResponse }
const CONNECTED_MS = 5_000; const KEPT_AUTOMATIC_MOVES = 12;

export class AuthoritativeRoom {
  private queue: Promise<void> = Promise.resolve();
  private readonly cached: Map<string, Cached>;
  private _state: GameState;
  private readonly sessions: readonly SessionPlayer[];
  private readonly dealFactory: DealFactory;
  private readonly store: MatchStore;
  private readonly control: RoomControl; private readonly clock: TurnClockConfig; private readonly now: () => number;
  private constructor(state: GameState, sessions: readonly SessionPlayer[], dealFactory: DealFactory, store: MatchStore, control: RoomControl, options: RoomOptions,
    processed: readonly (readonly [string, Cached])[] = []) {
    this._state = state; this.sessions = sessions; this.dealFactory = dealFactory; this.store = store; this.cached = new Map(processed);
    this.control = control; this.clock = options.clock ?? DEFAULT_TURN_CLOCK; this.now = options.now ?? Date.now;
  }

  static async create(matchId: string, sessions: readonly SessionPlayer[], dealFactory: DealFactory, store: MatchStore = new MemoryMatchStore(), options: RoomOptions = {}) {
    if (new Set(sessions.map((entry) => entry.sessionId)).size !== 4) throw new Error("Las cuatro sesiones deben ser únicas");
    const state = startMatch(matchId, sessions.map(({ playerId, seat }) => ({ playerId, seat })), dealFactory()).state;
    const now = (options.now ?? Date.now)(); const bots = new Set(options.botPlayerIds ?? []);
    const control: RoomControl = { seats: sessions.map(({ playerId }) => ({ playerId, bot: bots.has(playerId), automatic: false, consecutiveTimeouts: 0, resumeRequested: false, lastSeen: now })),
      clockRevision: -1, deadline: null, deadlineKind: null, automaticMoves: [] };
    const room = new AuthoritativeRoom(state, sessions, dealFactory, store, control, options); room.refreshClock(); await room.persist(); return room;
  }
  // La hora límite guardada se respeta: si venció durante la caída, la siguiente pasada del reloj juega por ese asiento.
  static async restore(matchId: string, dealFactory: DealFactory, store: MatchStore, options: RoomOptions = {}) {
    const snapshot = await store.load(matchId); if (!snapshot) return null;
    const now = (options.now ?? Date.now)();
    const control: RoomControl = snapshot.control ?? { seats: snapshot.sessions.map(({ playerId }) => ({ playerId, bot: false, automatic: false, consecutiveTimeouts: 0, resumeRequested: false, lastSeen: now })),
      clockRevision: -1, deadline: null, deadlineKind: null, automaticMoves: [] };
    // Tras un reinicio nadie pierde el control por la propia caída del servidor.
    for (const seat of control.seats) seat.lastSeen = now;
    const room = new AuthoritativeRoom(snapshot.state, snapshot.sessions, dealFactory, store, control, options, snapshot.processed); room.refreshClock(); return room;
  }
  get state() { return this._state; }
  connect(sessionId: string) {
    const playerId = this.playerIdFor(sessionId); if (!playerId) return null;
    this.seat(playerId).lastSeen = this.now(); return getPlayerView(this._state, playerId);
  }
  spectatorView() { return getPlayerView(this._state, null); }
  disconnect(_sessionId: string): void { /* La ausencia se mide por la última conexión; no cambia el estado. */ }
  clockView(): TurnClockView {
    const now = this.now();
    return { turnDeadline: this.control.deadline, deadlineKind: this.control.deadlineKind, serverNow: now, turnSeconds: this.clock.turnMs / 1000,
      seats: this.control.seats.map(({ playerId, bot, automatic, consecutiveTimeouts, resumeRequested, lastSeen }) => ({ playerId, bot, automatic, consecutiveTimeouts, resumeRequested, connected: bot || now - lastSeen < CONNECTED_MS })),
      automaticMoves: this.control.automaticMoves.slice(-8) };
  }
  automaticPlayerIds(): readonly string[] { return this.control.seats.filter((seat) => seat.automatic && !seat.bot).map((seat) => seat.playerId); }

  submit(sessionId: string, envelope: CommandEnvelope): Promise<CommandResponse> { return this.enqueue(() => this.process(sessionId, envelope)); }
  /** Ejecuta lo que el reloj haya vencido; los gestores lo invocan periódicamente. Devuelve si cambió el estado. */
  advance(): Promise<boolean> { return this.enqueue(() => this.runDue()); }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const result = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    const run = async () => { try { resolve(await operation()); } catch (error) { reject(error); } };
    this.queue = this.queue.then(run, run); return result;
  }

  private async process(sessionId: string, envelope: CommandEnvelope): Promise<CommandResponse> {
    const actorId = this.playerIdFor(sessionId);
    if (!actorId) return { ok: false, commandId: envelope.commandId, code: "UNAUTHENTICATED", message: "Sesión no asociada a un asiento" };
    // Un comando que llega después de la hora límite no puede alargar el turno: primero se resuelve lo vencido.
    await this.runDue(); this.seat(actorId).lastSeen = this.now();
    const fingerprint = JSON.stringify(envelope);
    const key = `${sessionId}:${envelope.commandId}`;
    const previous = this.cached.get(key);
    if (previous) return previous.fingerprint === fingerprint ? previous.response :
      { ok: false, commandId: envelope.commandId, code: "COMMAND_ID_CONFLICT", message: "commandId reutilizado con otro contenido", view: this.connect(sessionId)! };

    let events: readonly DomainEvent[] = [];
    let error: { readonly code: ServerErrorCode; readonly message: string } | RuleError | null = null;
    if (envelope.command.type === "RESUME_CONTROL") {
      const seat = this.seat(actorId);
      if (!seat.automatic) error = { code: "NOT_AUTOMATIC", message: "El asiento no está en modo automático" }; else seat.resumeRequested = true;
    } else if (envelope.expectedRevision !== this._state.revision) error = { code: "STALE_REVISION", message: "La revisión esperada no coincide" };
    else if (envelope.command.type === "NEXT_ROUND") {
      const result = nextRound(this._state, this.dealFactory());
      if ("error" in result) error = result.error; else { this._state = result.state; events = result.events; }
    } else {
      const command = envelope.command.type === "PASS"
        ? { type: "PASS" as const, actorId, expectedRevision: envelope.expectedRevision }
        : { type: "PLACE" as const, actorId, tileId: envelope.command.tileId, ...(envelope.command.side ? { side: envelope.command.side } : {}), expectedRevision: envelope.expectedRevision };
      const result = transition(this._state, command);
      if (!result.ok) error = result.error; else { this._state = result.state; events = result.events; this.seat(actorId).consecutiveTimeouts = 0; }
    }
    this.refreshClock();
    const response: CommandResponse = error
      ? { ok: false, commandId: envelope.commandId, code: error.code, message: error.message, view: this.connect(sessionId)! }
      : { ok: true, commandId: envelope.commandId, view: this.connect(sessionId)!, events };
    this.cached.set(key, { fingerprint, response });
    if (response.ok) await this.persist();
    return response;
  }

  private async runDue(): Promise<boolean> {
    let changed = false;
    for (let guard = 0; guard < 64; guard++) {
      const now = this.now();
      for (const seat of this.control.seats) if (!seat.bot && !seat.automatic && now - seat.lastSeen >= this.clock.disconnectAutoMs && this._state.phase !== "MATCH_ENDED") { seat.automatic = true; seat.resumeRequested = false; changed = true; }
      if (this.control.deadline === null || now < this.control.deadline) break;
      if (this._state.phase === "ROUND_ENDED") {
        const result = nextRound(this._state, this.dealFactory()); if ("error" in result) break; this._state = result.state;
      } else if (this._state.phase === "ROUND_ACTIVE" && this._state.currentPlayerId) {
        const seat = this.seat(this._state.currentPlayerId);
        const reason: AutomaticReason = seat.bot ? "BOT" : seat.automatic ? "AUTO_MODE" : "TIMEOUT";
        if (reason === "TIMEOUT") { seat.consecutiveTimeouts += 1; if (seat.consecutiveTimeouts >= this.clock.timeoutsForAuto) { seat.automatic = true; seat.resumeRequested = false; } }
        const action = chooseAutomaticAction(this._state, seat.playerId, this._state.matchId);
        const result = transition(this._state, action.type === "PASS" ? { type: "PASS", actorId: seat.playerId, expectedRevision: this._state.revision }
          : { type: "PLACE", actorId: seat.playerId, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}), expectedRevision: this._state.revision });
        if (!result.ok) throw new Error(`Jugada automática rechazada: ${result.error.code}`);
        this.control.automaticMoves.push({ revision: this._state.revision, playerId: seat.playerId, reason, action: action.type, ...(action.tileId ? { tileId: action.tileId } : {}), ...(action.side ? { side: action.side } : {}), at: now });
        if (this.control.automaticMoves.length > KEPT_AUTOMATIC_MOVES) this.control.automaticMoves.splice(0, this.control.automaticMoves.length - KEPT_AUTOMATIC_MOVES);
        this._state = result.state;
      } else break;
      changed = true; this.refreshClock();
    }
    if (changed) await this.persist();
    return changed;
  }

  private refreshClock() {
    if (this.control.clockRevision === this._state.revision && this.control.deadline !== null) return;
    this.control.clockRevision = this._state.revision; const now = this.now();
    if (this._state.phase === "ROUND_ACTIVE" && this._state.currentPlayerId) {
      const seat = this.seat(this._state.currentPlayerId);
      if (seat.resumeRequested) { seat.automatic = false; seat.resumeRequested = false; seat.consecutiveTimeouts = 0; }
      this.control.deadline = now + (seat.bot || seat.automatic ? this.clock.automaticDelayMs : this.clock.turnMs); this.control.deadlineKind = "TURN";
    } else if (this._state.phase === "ROUND_ENDED") { this.control.deadline = now + this.clock.roundBreakMs; this.control.deadlineKind = "ROUND_BREAK"; }
    else { this.control.deadline = null; this.control.deadlineKind = null; }
  }
  private seat(playerId: string) { const seat = this.control.seats.find((entry) => entry.playerId === playerId); if (!seat) throw new Error("SEAT_NOT_FOUND"); return seat; }
  private playerIdFor(sessionId: string) { return this.sessions.find((entry) => entry.sessionId === sessionId)?.playerId ?? null; }
  private persist() { return this.store.save(this._state.matchId, { state: this._state, sessions: this.sessions, processed: [...this.cached.entries()], control: this.control }); }
}
