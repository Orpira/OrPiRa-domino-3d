import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { legalActions, shuffledDeal, targetScore, type Deal, type Seat } from "../../../packages/rules/src/index.ts";
import type { CommandEnvelope, CommandResponse, LobbyPreview, LobbyView, SessionGrant } from "../../../packages/protocol/src/index.ts";
import type { SocialManager } from "./social.ts";
import { tableConfig, type TableConfig } from "./table-config.ts";
import { AuthoritativeRoom, DEFAULT_TURN_CLOCK, type MatchStore, type SessionPlayer, type TurnClockConfig } from "./authoritative-room.ts";
import type { TableChatContext } from "./chat.ts";

// `identityId`: cuenta de prueba de quien entró con ella (necesaria para las amistades por invitación).
interface Member extends SessionPlayer { readonly name: string; lastSeen: number; readonly identityId?: string; mutedIdentityIds?: readonly string[] }
// Las salas guardadas antes de las parejas no tienen `mode` (individual); las anteriores a las modalidades, ni `rules` (Latino) ni `targetScore`.
interface LobbyRecord { readonly code: string; readonly matchId: string; readonly members: Member[]; started: boolean; readonly mode?: TableConfig["mode"]; readonly rules?: TableConfig["rules"]; readonly targetScore?: TableConfig["targetScore"] }
interface SavedLobbies { readonly lobbies: readonly LobbyRecord[] }
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeDeal = (players: readonly SessionPlayer[]): Deal => {
  const hands = shuffledDeal(); return Object.fromEntries(players.map((player, index) => [player.playerId, hands[index]!]));
};

export class LobbyManager {
  private readonly lobbies = new Map<string, LobbyRecord>();
  private readonly rooms = new Map<string, AuthoritativeRoom>();
  private readonly metadataPath: string; private readonly roomStore: MatchStore; private readonly now: () => number; private readonly clock: TurnClockConfig;
  private constructor(metadataPath: string, roomStore: MatchStore, now: () => number, clock: TurnClockConfig) { this.metadataPath = metadataPath; this.roomStore = roomStore; this.now = now; this.clock = clock; }
  static async open(metadataPath: string, roomStore: MatchStore, now: () => number = Date.now, clock: TurnClockConfig = DEFAULT_TURN_CLOCK) {
    const manager = new LobbyManager(metadataPath, roomStore, now, clock);
    try {
      const saved = JSON.parse(await readFile(metadataPath, "utf8")) as SavedLobbies;
      for (const lobby of saved.lobbies) {
        manager.lobbies.set(lobby.code, lobby);
        if (lobby.started) { const room = await AuthoritativeRoom.restore(lobby.matchId, () => makeDeal(lobby.members), roomStore, manager.roomOptions()); if (room) manager.rooms.set(lobby.code, room); }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return manager;
  }
  attachSocial(social: SocialManager) { this.social = social; }
  private social: SocialManager | null = null;
  tableChat(codeInput: string, sessionId: string): TableChatContext {
    const lobby = this.lobbies.get(codeInput.toUpperCase()); const member = lobby?.members.find((entry) => entry.sessionId === sessionId);
    if (!lobby || !member) throw new Error("UNAUTHENTICATED");
    return { matchId: lobby.matchId, identityId: member.identityId ?? `guest-${lobby.matchId}-${member.playerId}`, playerId: member.playerId, displayName: member.name,
      phase: () => this.rooms.get(lobby.code)?.state.phase ?? "WAITING", closed: () => false };
  }
  chatMuted(code: string, sessionId: string): readonly string[] {
    this.tableChat(code, sessionId); return this.lobbies.get(code.toUpperCase())!.members.find((entry) => entry.sessionId === sessionId)!.mutedIdentityIds ?? [];
  }
  private chatQueue: Promise<void> = Promise.resolve();
  setChatMuted(code: string, sessionId: string, ids: readonly string[]): Promise<void> {
    const result = this.chatQueue.then(async () => {
      this.tableChat(code, sessionId); const member = this.lobbies.get(code.toUpperCase())!.members.find((entry) => entry.sessionId === sessionId)!;
      const previous = member.mutedIdentityIds; member.mutedIdentityIds = ids;
      try { await this.persist(); } catch (error) { if (previous) member.mutedIdentityIds = previous; else delete member.mutedIdentityIds; throw error; }
    });
    this.chatQueue = result.then(() => {}, () => {}); return result;
  }
  hasFinishedMatch(identityId: string): boolean {
    return [...this.lobbies.values()].some((entry) => this.rooms.get(entry.code)?.state.phase === "MATCH_ENDED" && entry.members.some((member) => member.identityId === identityId));
  }
  chatHandActive(identityId: string): boolean {
    return [...this.lobbies.values()].some((entry) => this.rooms.get(entry.code)?.state.phase === "ROUND_ACTIVE" && entry.members.some((member) => member.identityId === identityId));
  }
  async create(name: string, options: { readonly mode?: unknown; readonly rules?: unknown; readonly targetScore?: unknown } = {}, identityId?: string): Promise<SessionGrant> {
    const config = tableConfig(options);
    const code = this.uniqueCode(); const member = this.member(name, 0, identityId); const record: LobbyRecord = { code, matchId: `online-${randomUUID()}`, members: [member], started: false, ...config };
    this.lobbies.set(code, record); await this.persist(); return { code, sessionId: member.sessionId, playerId: member.playerId };
  }
  /**
   * Entra en la sala. Con cuenta (`identityId`) y por invitación, queda amistad aceptada con quien invitó: el miembro con ese
   * nombre de usuario si está en la sala, o si no, quien la creó con cuenta.
   */
  async join(codeInput: string, name: string, identityId?: string, invitation?: { readonly inviter?: string | undefined }): Promise<SessionGrant> {
    const code = codeInput.trim().toUpperCase(); const lobby = this.lobbies.get(code); if (!lobby) throw new Error("ROOM_NOT_FOUND");
    if (lobby.started || lobby.members.length >= 4) throw new Error("ROOM_FULL");
    if (identityId && lobby.members.some((existing) => existing.identityId === identityId)) throw new Error("ALREADY_IN_ROOM");
    const member = this.member(name, lobby.members.length as Seat, identityId); lobby.members.push(member);
    if (lobby.members.length === 4) { lobby.started = true; this.rooms.set(code, await AuthoritativeRoom.create(lobby.matchId, lobby.members, () => makeDeal(lobby.members), this.roomStore, { ...this.roomOptions(), mode: lobby.mode ?? "INDIVIDUAL", rules: lobby.rules ?? "LATINO", ...(lobby.targetScore ? { targetScore: lobby.targetScore } : {}) })); }
    await this.persist();
    const friend = identityId && invitation ? await this.befriendInviter(lobby, identityId, invitation.inviter ?? "") : null;
    return { code, sessionId: member.sessionId, playerId: member.playerId, ...(friend ? { friendWith: friend } : {}) };
  }
  /** Vista pública para la página de invitación. `null` si el código no existe. */
  async preview(codeInput: string, inviterUsername?: string): Promise<LobbyPreview | null> {
    const lobby = this.lobbies.get(codeInput.trim().toUpperCase()); if (!lobby) return null; const room = this.rooms.get(lobby.code);
    const inviter = inviterUsername ? await this.inviterIn(lobby, inviterUsername) : null;
    return { code: lobby.code, mode: lobby.mode ?? "INDIVIDUAL", rules: lobby.rules ?? "LATINO", targetScore: targetScore({ mode: lobby.mode ?? "INDIVIDUAL", ...(lobby.targetScore ? { targetScore: lobby.targetScore } : {}) }),
      status: !room ? "WAITING" : room.state.phase === "MATCH_ENDED" ? "ENDED" : "PLAYING", players: lobby.members.map((member) => member.name), freeSeats: 4 - lobby.members.length, inviter: inviter?.name ?? null };
  }
  /** Vista de la sala para invitar a un amigo: solo si esa cuenta ocupa una plaza en ella. */
  async memberPreview(codeInput: string, identityId: string): Promise<LobbyPreview | null> {
    const lobby = this.lobbies.get(codeInput.trim().toUpperCase()); if (!lobby?.members.some((member) => member.identityId === identityId)) return null;
    return this.preview(lobby.code);
  }
  private async inviterIn(lobby: LobbyRecord, username: string): Promise<Member | null> {
    const id = await this.social?.identityOfUsername(username); return id ? lobby.members.find((member) => member.identityId === id) ?? null : null;
  }
  private async befriendInviter(lobby: LobbyRecord, guestId: string, inviterUsername: string): Promise<string | null> {
    if (!this.social) return null;
    const inviter = (inviterUsername ? await this.inviterIn(lobby, inviterUsername) : null) ?? (lobby.members[0]?.identityId ? lobby.members[0] : null);
    if (!inviter?.identityId || inviter.identityId === guestId) return null;
    return await this.social.befriendByInvitation(inviter.identityId, guestId) ? inviter.name : null;
  }
  async view(codeInput: string, sessionId: string): Promise<LobbyView | null> {
    const code = codeInput.toUpperCase(); const lobby = this.lobbies.get(code); const member = lobby?.members.find((candidate) => candidate.sessionId === sessionId);
    if (!lobby || !member) return null; member.lastSeen = this.now(); const room = this.rooms.get(code); const game = room?.connect(sessionId) ?? null;
    return { code, mode: lobby.mode ?? "INDIVIDUAL", rules: lobby.rules ?? "LATINO", targetScore: targetScore({ mode: lobby.mode ?? "INDIVIDUAL", ...(lobby.targetScore ? { targetScore: lobby.targetScore } : {}) }), status: !room ? "WAITING" : room.state.phase === "MATCH_ENDED" ? "ENDED" : "PLAYING", viewerPlayerId: member.playerId,
      players: lobby.members.map((entry) => ({ playerId: entry.playerId, name: entry.name, seat: entry.seat, connected: this.now() - entry.lastSeen < 5_000 })),
      game, legalActions: game && game.currentPlayerId === member.playerId ? legalActions(room!.state, member.playerId) : [], clock: room?.clockView() ?? null };
  }
  /** Pasada del reloj: juega turnos vencidos y asientos automáticos en todas las salas en curso. */
  async tick(): Promise<void> { await Promise.all([...this.rooms.values()].filter((room) => room.state.phase !== "MATCH_ENDED").map((room) => room.advance())); }
  async command(code: string, sessionId: string, envelope: CommandEnvelope): Promise<CommandResponse | null> {
    const lobby = this.lobbies.get(code.toUpperCase()); if (!lobby?.members.some((member) => member.sessionId === sessionId)) return null;
    const room = this.rooms.get(lobby.code); if (!room) return { ok: false, commandId: envelope.commandId, code: "WRONG_PHASE", message: "La sala aún espera jugadores" };
    return room.submit(sessionId, envelope);
  }
  private roomOptions() { return { clock: this.clock, now: this.now }; }
  private member(nameInput: string, seat: Seat, identityId?: string): Member {
    const name = nameInput.trim().slice(0, 24); if (!name) throw new Error("INVALID_NAME");
    return { playerId: `P${seat}`, seat, sessionId: randomUUID(), name, lastSeen: this.now(), ...(identityId ? { identityId } : {}) };
  }
  private uniqueCode() { let code = ""; do { const bytes = randomBytes(6); code = [...bytes].map((value) => alphabet[value % alphabet.length]).join(""); } while (this.lobbies.has(code)); return code; }
  private async persist() { await mkdir(dirname(this.metadataPath), { recursive: true }); const temporary = `${this.metadataPath}.tmp`;
    await writeFile(temporary, JSON.stringify({ lobbies: [...this.lobbies.values()] }), { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.metadataPath); }
}
