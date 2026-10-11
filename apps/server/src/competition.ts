import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { legalActions, shuffledDeal, type Deal, type Seat } from "../../../packages/rules/src/index.ts";
import type { CommandEnvelope, CommandResponse, CompetitionView, SimulatedConditions, SimulatedMovement, SimulatedMovementKind, TestAccountView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { AuthoritativeRoom, type MatchStore, type SessionPlayer } from "./authoritative-room.ts";

export const SIMULATED_CONDITIONS: SimulatedConditions = Object.freeze({
  currencyLabel: "COP simulados · sin valor monetario", initialCredit: 100000, entry: 5000,
  playerCount: 4, commissionPercent: 0, prize: 20000, targetScore: 100, expiresAfterMinutes: 15, version: 1,
});

// Comisión en pesos enteros, redondeada al más cercano (medios hacia arriba); el premio debe ser exactamente bolsa − comisión.
export function settlementAmounts(terms: SimulatedConditions) {
  const pool = terms.entry * terms.playerCount; const commission = Math.round(pool * terms.commissionPercent / 100);
  if (![terms.entry, terms.prize, terms.initialCredit].every(Number.isSafeInteger) || terms.entry <= 0 || commission < 0 || pool - commission !== terms.prize) throw new Error("INCONSISTENT_CONDITIONS");
  return { pool, commission, prize: terms.prize };
}

interface Identity { readonly identityId: string; readonly token: string; readonly displayName: string; available: number; reserved: number }
interface Member { readonly identityId: string; readonly seat: Seat; accepted: boolean; annulmentAccepted: boolean; lastSeen: number }
interface Settlement { readonly championIdentityId: string; readonly matchId: string; readonly settledAt: number; readonly entry: number; readonly grossPrize: number; readonly commission: number; readonly netPrize: number }
interface Competition {
  readonly competitionId: string; readonly code: string; readonly matchId: string; readonly createdAt: number; readonly expiresAt: number;
  status: CompetitionView["status"]; cancellationReason: string | null; readonly members: Member[]; settlement: Settlement | null;
  // Copia de las condiciones vigentes al crear la sala; reservas y liquidación usan siempre estos importes.
  conditions?: SimulatedConditions;
}
interface Snapshot { readonly identities: readonly Identity[]; readonly competitions: readonly Competition[]; readonly movements: readonly SimulatedMovement[] }
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class CompetitionManager {
  private readonly identities = new Map<string, Identity>(); private readonly tokens = new Map<string, string>();
  private readonly competitions = new Map<string, Competition>(); private readonly rooms = new Map<string, AuthoritativeRoom>();
  private readonly movements: SimulatedMovement[] = []; private queue: Promise<void> = Promise.resolve();
  private readonly path: string; private readonly roomStore: MatchStore; private readonly now: () => number; private readonly terms: SimulatedConditions;
  private constructor(path: string, roomStore: MatchStore, now: () => number, terms: SimulatedConditions) { this.path = path; this.roomStore = roomStore; this.now = now; this.terms = terms; }

  static async open(path: string, roomStore: MatchStore, now: () => number = Date.now, terms: SimulatedConditions = SIMULATED_CONDITIONS) {
    settlementAmounts(terms); const manager = new CompetitionManager(path, roomStore, now, terms); let recovered = false;
    try {
      const saved = JSON.parse(await readFile(path, "utf8")) as Snapshot;
      for (const identity of saved.identities) { manager.identities.set(identity.identityId, identity); manager.tokens.set(identity.token, identity.identityId); }
      manager.movements.push(...saved.movements);
      for (const competition of saved.competitions) {
        manager.competitions.set(competition.code, competition);
        if (competition.status === "PLAYING" || competition.status === "ENDED") {
          const room = await AuthoritativeRoom.restore(competition.matchId, () => manager.deal(competition), roomStore); if (room) manager.rooms.set(competition.code, room);
          // Recupera una liquidación interrumpida entre el guardado de la partida y el del registro económico.
          if (room && room.state.phase === "MATCH_ENDED" && !competition.settlement) { manager.settle(competition, room.state.matchResult!.championId); recovered = true; }
        }
      }
      if (manager.expireDue() || recovered) await manager.persist();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return manager;
  }

  createIdentity(nameInput: string): Promise<TestIdentityGrant> { return this.serial(async () => {
    const displayName = nameInput.trim().slice(0, 24); if (!displayName) throw new Error("INVALID_NAME");
    const identity: Identity = { identityId: `test-${randomUUID()}`, token: randomUUID(), displayName, available: this.terms.initialCredit, reserved: 0 };
    this.identities.set(identity.identityId, identity); this.tokens.set(identity.token, identity.identityId);
    this.movement(identity, null, "INITIAL_CREDIT", this.terms.initialCredit, 0); await this.persist();
    return { identityId: identity.identityId, identityToken: identity.token, displayName };
  }); }
  conditions(): SimulatedConditions { return this.terms; }
  account(token: string): Promise<TestAccountView> { return this.serial(async () => { this.expireDue(); await this.persist(); const identity = this.identity(token); return this.accountView(identity); }); }
  create(token: string): Promise<CompetitionView> { return this.serial(async () => {
    this.expireDue(); const identity = this.identity(token); const createdAt = this.now(); const code = this.uniqueCode();
    const competition: Competition = { competitionId: `competition-${randomUUID()}`, code, matchId: `competition-match-${randomUUID()}`, createdAt,
      expiresAt: createdAt + this.terms.expiresAfterMinutes * 60_000, status: "WAITING", cancellationReason: null, conditions: this.terms,
      members: [{ identityId: identity.identityId, seat: 0, accepted: false, annulmentAccepted: false, lastSeen: createdAt }], settlement: null };
    this.competitions.set(code, competition); await this.persist(); return this.viewFor(competition, identity);
  }); }
  join(codeInput: string, token: string): Promise<CompetitionView> { return this.serial(async () => {
    this.expireDue(); const identity = this.identity(token); const competition = this.competition(codeInput);
    if (competition.status !== "WAITING") throw new Error("COMPETITION_NOT_JOINABLE");
    if (competition.members.some((member) => member.identityId === identity.identityId)) return this.viewFor(competition, identity);
    if (competition.members.length >= this.termsOf(competition).playerCount) throw new Error("COMPETITION_FULL");
    competition.members.push({ identityId: identity.identityId, seat: competition.members.length as Seat, accepted: false, annulmentAccepted: false, lastSeen: this.now() });
    await this.persist(); return this.viewFor(competition, identity);
  }); }
  accept(codeInput: string, token: string, conditionsVersion: number): Promise<CompetitionView> { return this.serial(async () => {
    this.expireDue(); const identity = this.identity(token); const competition = this.competition(codeInput); const member = this.member(competition, identity);
    if (competition.status !== "WAITING") throw new Error("COMPETITION_NOT_WAITING");
    const terms = this.termsOf(competition); if (conditionsVersion !== terms.version || terms.version !== this.terms.version) throw new Error("CONDITIONS_CHANGED");
    if (!member.accepted) {
      if (identity.available < terms.entry) throw new Error("INSUFFICIENT_BALANCE");
      identity.available -= terms.entry; identity.reserved += terms.entry; member.accepted = true;
      this.movement(identity, competition, "ENTRY_RESERVED", -terms.entry, terms.entry);
    }
    if (competition.members.length === terms.playerCount && new Set(competition.members.map((entry) => entry.identityId)).size === terms.playerCount && competition.members.every((entry) => entry.accepted)) {
      const room = await AuthoritativeRoom.create(competition.matchId, this.sessions(competition), () => this.deal(competition), this.roomStore);
      this.rooms.set(competition.code, room); competition.status = "PLAYING";
    }
    await this.persist(); return this.viewFor(competition, identity);
  }); }
  leave(codeInput: string, token: string): Promise<TestAccountView> { return this.serial(async () => {
    this.expireDue(); const identity = this.identity(token); const competition = this.competition(codeInput); const member = this.member(competition, identity);
    if (competition.status !== "WAITING") throw new Error("COMPETITION_ALREADY_STARTED");
    if (member.accepted) this.release(identity, competition, "Salida antes del inicio");
    competition.members.splice(competition.members.indexOf(member), 1); competition.members.forEach((entry, index) => Object.assign(entry, { seat: index as Seat }));
    await this.persist(); return this.accountView(identity);
  }); }
  cancel(codeInput: string, token: string): Promise<CompetitionView> { return this.serial(async () => {
    this.expireDue(); const identity = this.identity(token); const competition = this.competition(codeInput); this.member(competition, identity);
    if (competition.status !== "WAITING") throw new Error("COMPETITION_ALREADY_STARTED");
    this.cancelCompetition(competition, "Cancelada antes del inicio"); await this.persist(); return this.viewFor(competition, identity);
  }); }
  requestAnnulment(codeInput: string, token: string): Promise<CompetitionView> { return this.serial(async () => {
    const identity = this.identity(token); const competition = this.competition(codeInput); const member = this.member(competition, identity);
    if (competition.status !== "PLAYING") throw new Error("COMPETITION_NOT_PLAYING"); member.annulmentAccepted = true;
    if (competition.members.every((entry) => entry.annulmentAccepted)) this.cancelCompetition(competition, "Anulada por aceptación de los cuatro participantes");
    await this.persist(); return this.viewFor(competition, identity);
  }); }
  view(codeInput: string, token: string): Promise<CompetitionView> { return this.serial(async () => {
    const changed = this.expireDue(); const identity = this.identity(token); const competition = this.competition(codeInput); this.member(competition, identity);
    if (changed) await this.persist(); return this.viewFor(competition, identity);
  }); }
  command(codeInput: string, token: string, envelope: CommandEnvelope): Promise<CommandResponse> { return this.serial(async () => {
    const identity = this.identity(token); const competition = this.competition(codeInput); this.member(competition, identity);
    if (competition.status !== "PLAYING" && competition.status !== "ENDED") throw new Error("COMPETITION_NOT_PLAYING"); const room = this.rooms.get(competition.code); if (!room) throw new Error("MATCH_NOT_FOUND");
    const response = await room.submit(token, envelope);
    if (response.ok && room.state.phase === "MATCH_ENDED" && !competition.settlement) this.settle(competition, room.state.matchResult!.championId);
    await this.persist(); return response;
  }); }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const result = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    this.queue = this.queue.then(async () => { try { resolve(await operation()); } catch (error) { reject(error); } }, async () => { try { resolve(await operation()); } catch (error) { reject(error); } }); return result;
  }
  private identity(token: string) { const id = this.tokens.get(token); const identity = id ? this.identities.get(id) : null; if (!identity) throw new Error("UNAUTHENTICATED"); return identity; }
  private competition(code: string) { const value = this.competitions.get(code.trim().toUpperCase()); if (!value) throw new Error("COMPETITION_NOT_FOUND"); return value; }
  private member(competition: Competition, identity: Identity) { const value = competition.members.find((entry) => entry.identityId === identity.identityId); if (!value) throw new Error("NOT_A_PARTICIPANT"); value.lastSeen = this.now(); return value; }
  private sessions(competition: Competition): SessionPlayer[] { return competition.members.map((member) => ({ playerId: member.identityId, seat: member.seat, sessionId: this.identities.get(member.identityId)!.token })); }
  private deal(competition: Competition): Deal { const hands = shuffledDeal(); return Object.fromEntries(competition.members.map((member, index) => [member.identityId, hands[index]!])); }
  private movement(identity: Identity, competition: Competition | null, kind: SimulatedMovementKind, availableDelta: number, reservedDelta: number) { this.movements.push({ movementId: randomUUID(), identityId: identity.identityId, competitionId: competition?.competitionId ?? null, kind, availableDelta, reservedDelta, createdAt: this.now() }); }
  private release(identity: Identity, competition: Competition, _reason: string) { const entry = this.termsOf(competition).entry; identity.reserved -= entry; identity.available += entry; this.movement(identity, competition, "ENTRY_RELEASED", entry, -entry); }
  private cancelCompetition(competition: Competition, reason: string) { if (competition.status === "CANCELLED" || competition.status === "EXPIRED") return; for (const member of competition.members) { const identity = this.identities.get(member.identityId)!; if (member.accepted) { this.release(identity, competition, reason); member.accepted = false; } } competition.status = reason.startsWith("Caducada") ? "EXPIRED" : "CANCELLED"; competition.cancellationReason = reason; }
  private expireDue() {
    let changed = false;
    for (const competition of this.competitions.values()) {
      if (competition.status !== "WAITING") continue;
      if (competition.expiresAt <= this.now()) { this.cancelCompetition(competition, `Caducada tras ${this.termsOf(competition).expiresAfterMinutes} minutos incompleta`); changed = true; }
      else if (this.termsOf(competition).version !== this.terms.version) { this.cancelCompetition(competition, "Cancelada porque cambiaron las condiciones; las aceptaciones anteriores quedan invalidadas"); changed = true; }
    }
    return changed;
  }
  private termsOf(competition: Competition): SimulatedConditions { return competition.conditions ?? SIMULATED_CONDITIONS; }
  private settle(competition: Competition, championIdentityId: string) {
    if (competition.settlement) return; const terms = this.termsOf(competition); const { pool, commission } = settlementAmounts(terms);
    for (const member of competition.members) { const identity = this.identities.get(member.identityId)!; identity.reserved -= terms.entry; member.accepted = false; this.movement(identity, competition, "ENTRY_CONSUMED", 0, -terms.entry); }
    const champion = this.identities.get(championIdentityId)!; champion.available += terms.prize; this.movement(champion, competition, "PRIZE_AWARDED", terms.prize, 0);
    competition.settlement = { championIdentityId, matchId: competition.matchId, settledAt: this.now(), entry: terms.entry, grossPrize: pool, commission, netPrize: terms.prize }; competition.status = "ENDED";
  }
  private accountView(identity: Identity): TestAccountView { return { identityId: identity.identityId, displayName: identity.displayName, available: identity.available, reserved: identity.reserved, currencyLabel: this.terms.currencyLabel, movements: this.movements.filter((entry) => entry.identityId === identity.identityId).slice().reverse() }; }
  private viewFor(competition: Competition, identity: Identity): CompetitionView {
    const room = this.rooms.get(competition.code); const game = room?.connect(identity.token) ?? null;
    return { competitionId: competition.competitionId, code: competition.code, status: competition.status, conditions: this.termsOf(competition),
      createdAt: competition.createdAt, expiresAt: competition.expiresAt, cancellationReason: competition.cancellationReason, viewerIdentityId: identity.identityId,
      members: competition.members.map((member) => ({ identityId: member.identityId, displayName: this.identities.get(member.identityId)!.displayName, seat: member.seat,
        accepted: member.accepted, annulmentAccepted: member.annulmentAccepted, connected: this.now() - member.lastSeen < 5_000 })), game,
      legalActions: game && game.currentPlayerId === identity.identityId && competition.status === "PLAYING" ? legalActions(room!.state, identity.identityId) : [], settlement: competition.settlement };
  }
  private uniqueCode() { let code = ""; do { const bytes = randomBytes(6); code = [...bytes].map((value) => alphabet[value % alphabet.length]).join(""); } while (this.competitions.has(code)); return code; }
  private async persist() { await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.tmp`; const snapshot: Snapshot = { identities: [...this.identities.values()], competitions: [...this.competitions.values()], movements: this.movements }; await writeFile(temporary, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.path); }
}
