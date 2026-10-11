import {
  getPlayerView, nextRound, startMatch, transition,
  type Deal, type DomainEvent, type GameState, type PlayerInput, type RuleError,
} from "../../../packages/rules/src/index.ts";
import type { CommandEnvelope, CommandResponse } from "../../../packages/protocol/src/index.ts";

export interface SessionPlayer extends PlayerInput { readonly sessionId: string }
export interface RoomSnapshot { readonly state: GameState; readonly sessions: readonly SessionPlayer[]; readonly processed: readonly (readonly [string, Cached])[] }
export interface MatchStore { load(matchId: string): Promise<RoomSnapshot | null>; save(matchId: string, snapshot: RoomSnapshot): Promise<void> }
export class MemoryMatchStore implements MatchStore {
  private readonly values = new Map<string, RoomSnapshot>();
  async load(matchId: string) { return structuredClone(this.values.get(matchId) ?? null); }
  async save(matchId: string, snapshot: RoomSnapshot) { this.values.set(matchId, structuredClone(snapshot)); }
}

type DealFactory = () => Deal;
export interface Cached { readonly fingerprint: string; readonly response: CommandResponse }

export class AuthoritativeRoom {
  private queue: Promise<void> = Promise.resolve();
  private readonly cached: Map<string, Cached>;
  private _state: GameState;
  private readonly sessions: readonly SessionPlayer[];
  private readonly dealFactory: DealFactory;
  private readonly store: MatchStore;
  private constructor(
    state: GameState,
    sessions: readonly SessionPlayer[],
    dealFactory: DealFactory,
    store: MatchStore,
    processed: readonly (readonly [string, Cached])[] = [],
  ) { this._state = state; this.sessions = sessions; this.dealFactory = dealFactory; this.store = store; this.cached = new Map(processed); }

  static async create(matchId: string, sessions: readonly SessionPlayer[], dealFactory: DealFactory, store: MatchStore = new MemoryMatchStore()) {
    if (new Set(sessions.map((entry) => entry.sessionId)).size !== 4) throw new Error("Las cuatro sesiones deben ser únicas");
    const state = startMatch(matchId, sessions.map(({ playerId, seat }) => ({ playerId, seat })), dealFactory()).state;
    const room = new AuthoritativeRoom(state, sessions, dealFactory, store); await room.persist(); return room;
  }
  static async restore(matchId: string, dealFactory: DealFactory, store: MatchStore) {
    const snapshot = await store.load(matchId); if (!snapshot) return null;
    return new AuthoritativeRoom(snapshot.state, snapshot.sessions, dealFactory, store, snapshot.processed);
  }
  get state() { return this._state; }
  connect(sessionId: string) {
    const playerId = this.playerIdFor(sessionId); if (!playerId) return null;
    return getPlayerView(this._state, playerId);
  }
  spectatorView() { return getPlayerView(this._state, null); }
  disconnect(_sessionId: string): void { /* El contrato ordena esperar sin pase ni puntos. */ }

  submit(sessionId: string, envelope: CommandEnvelope): Promise<CommandResponse> {
    let resolve!: (value: CommandResponse) => void;
    const result = new Promise<CommandResponse>((done) => { resolve = done; });
    this.queue = this.queue.then(async () => resolve(await this.process(sessionId, envelope)), async () => resolve(await this.process(sessionId, envelope)));
    return result;
  }

  private async process(sessionId: string, envelope: CommandEnvelope): Promise<CommandResponse> {
    const actorId = this.playerIdFor(sessionId);
    if (!actorId) return { ok: false, commandId: envelope.commandId, code: "UNAUTHENTICATED", message: "Sesión no asociada a un asiento" };
    const fingerprint = JSON.stringify(envelope);
    const key = `${sessionId}:${envelope.commandId}`;
    const previous = this.cached.get(key);
    if (previous) return previous.fingerprint === fingerprint ? previous.response :
      { ok: false, commandId: envelope.commandId, code: "COMMAND_ID_CONFLICT", message: "commandId reutilizado con otro contenido", view: this.connect(sessionId)! };

    let events: readonly DomainEvent[] = [];
    let error: RuleError | null = null;
    if (envelope.expectedRevision !== this._state.revision) error = { code: "STALE_REVISION", message: "La revisión esperada no coincide" };
    else if (envelope.command.type === "NEXT_ROUND") {
      const result = nextRound(this._state, this.dealFactory());
      if ("error" in result) error = result.error; else { this._state = result.state; events = result.events; }
    } else {
      const command = envelope.command.type === "PASS"
        ? { type: "PASS" as const, actorId, expectedRevision: envelope.expectedRevision }
        : { type: "PLACE" as const, actorId, tileId: envelope.command.tileId, ...(envelope.command.side ? { side: envelope.command.side } : {}), expectedRevision: envelope.expectedRevision };
      const result = transition(this._state, command);
      if (!result.ok) error = result.error; else { this._state = result.state; events = result.events; }
    }
    const response: CommandResponse = error
      ? { ok: false, commandId: envelope.commandId, code: error.code, message: error.message, view: this.connect(sessionId)! }
      : { ok: true, commandId: envelope.commandId, view: this.connect(sessionId)!, events };
    this.cached.set(key, { fingerprint, response });
    if (response.ok) await this.persist();
    return response;
  }
  private playerIdFor(sessionId: string) { return this.sessions.find((entry) => entry.sessionId === sessionId)?.playerId ?? null; }
  private persist() { return this.store.save(this._state.matchId, { state: this._state, sessions: this.sessions, processed: [...this.cached.entries()] }); }
}
