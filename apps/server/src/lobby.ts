import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { legalActions, shuffledDeal, type Deal, type Seat } from "../../../packages/rules/src/index.ts";
import type { CommandEnvelope, CommandResponse, LobbyView, SessionGrant } from "../../../packages/protocol/src/index.ts";
import { AuthoritativeRoom, DEFAULT_TURN_CLOCK, type MatchStore, type SessionPlayer, type TurnClockConfig } from "./authoritative-room.ts";

interface Member extends SessionPlayer { readonly name: string; lastSeen: number }
interface LobbyRecord { readonly code: string; readonly matchId: string; readonly members: Member[]; started: boolean }
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
  async create(name: string): Promise<SessionGrant> {
    const code = this.uniqueCode(); const member = this.member(name, 0); const record = { code, matchId: `online-${randomUUID()}`, members: [member], started: false };
    this.lobbies.set(code, record); await this.persist(); return { code, sessionId: member.sessionId, playerId: member.playerId };
  }
  async join(codeInput: string, name: string): Promise<SessionGrant> {
    const code = codeInput.trim().toUpperCase(); const lobby = this.lobbies.get(code); if (!lobby) throw new Error("ROOM_NOT_FOUND");
    if (lobby.started || lobby.members.length >= 4) throw new Error("ROOM_FULL");
    const member = this.member(name, lobby.members.length as Seat); lobby.members.push(member);
    if (lobby.members.length === 4) { lobby.started = true; this.rooms.set(code, await AuthoritativeRoom.create(lobby.matchId, lobby.members, () => makeDeal(lobby.members), this.roomStore, this.roomOptions())); }
    await this.persist(); return { code, sessionId: member.sessionId, playerId: member.playerId };
  }
  async view(codeInput: string, sessionId: string): Promise<LobbyView | null> {
    const code = codeInput.toUpperCase(); const lobby = this.lobbies.get(code); const member = lobby?.members.find((candidate) => candidate.sessionId === sessionId);
    if (!lobby || !member) return null; member.lastSeen = this.now(); const room = this.rooms.get(code); const game = room?.connect(sessionId) ?? null;
    return { code, status: !room ? "WAITING" : room.state.phase === "MATCH_ENDED" ? "ENDED" : "PLAYING", viewerPlayerId: member.playerId,
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
  private member(nameInput: string, seat: Seat): Member {
    const name = nameInput.trim().slice(0, 24); if (!name) throw new Error("INVALID_NAME");
    return { playerId: `P${seat}`, seat, sessionId: randomUUID(), name, lastSeen: this.now() };
  }
  private uniqueCode() { let code = ""; do { const bytes = randomBytes(6); code = [...bytes].map((value) => alphabet[value % alphabet.length]).join(""); } while (this.lobbies.has(code)); return code; }
  private async persist() { await mkdir(dirname(this.metadataPath), { recursive: true }); const temporary = `${this.metadataPath}.tmp`;
    await writeFile(temporary, JSON.stringify({ lobbies: [...this.lobbies.values()] }), { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.metadataPath); }
}
