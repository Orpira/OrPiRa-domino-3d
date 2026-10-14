import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FriendView, LobbyPreview, RoomInvitation, SocialPerson, SocialRelation, SocialSearchResult, SocialView } from "../../../packages/protocol/src/index.ts";

export interface Profile { readonly identityId: string; readonly username: string; readonly createdAt: number }
export type FriendshipStatus = "PENDING" | "ACCEPTED" | "BLOCKED";
export interface Friendship {
  readonly friendshipId: string; readonly requesterId: string; readonly addresseeId: string;
  readonly status: FriendshipStatus; readonly createdAt: number; readonly updatedAt: number;
}

/**
 * Almacenamiento de perfiles y amistades. La lógica (`SocialManager`) solo usa esta interfaz: cambiar JSON por PostgreSQL
 * es implementar otro repositorio. Un repositorio SQL debe garantizar lo mismo que este: nombre de usuario único sin
 * distinguir mayúsculas (índice único) y una sola amistad por pareja de identidades (índice único sobre el par ordenado).
 */
export interface SocialRepository {
  profileOf(identityId: string): Promise<Profile | null>;
  profileByUsername(username: string): Promise<Profile | null>;
  /** Falla con USERNAME_TAKEN si otra identidad ya usa ese nombre, o con USERNAME_ALREADY_SET si esta ya tiene uno. */
  insertProfile(profile: Profile): Promise<void>;
  friendshipBetween(left: string, right: string): Promise<Friendship | null>;
  /** Inserta o sustituye la amistad de esa pareja (como mucho una por pareja). */
  saveFriendship(friendship: Friendship): Promise<void>;
  /** Borra la relación de esa pareja, si existe. */
  deleteFriendship(left: string, right: string): Promise<void>;
  friendshipsOf(identityId: string): Promise<readonly Friendship[]>;
  /** Perfiles cuyo nombre de usuario empieza por `prefix` (ya normalizado), por orden alfabético. */
  searchProfiles(prefix: string, limit: number): Promise<readonly Profile[]>;
}

const usernameKey = (username: string) => username.toLowerCase();
const pairKey = (left: string, right: string) => [left, right].sort().join("|");
interface Snapshot { readonly profiles: readonly Profile[]; readonly friendships: readonly Friendship[] }

/** Repositorio en un archivo JSON: escrituras en serie, archivo temporal y `rename` atómico, modo 600. Una sola instancia. */
export class JsonSocialRepository implements SocialRepository {
  private readonly profiles = new Map<string, Profile>(); private readonly usernames = new Map<string, string>();
  private readonly friendships = new Map<string, Friendship>(); private chain: Promise<void> = Promise.resolve();
  private readonly path: string;
  private constructor(path: string) { this.path = path; }
  static async open(path: string) {
    const repository = new JsonSocialRepository(path);
    try {
      const saved = JSON.parse(await readFile(path, "utf8")) as Snapshot;
      for (const profile of saved.profiles) { repository.profiles.set(profile.identityId, profile); repository.usernames.set(usernameKey(profile.username), profile.identityId); }
      for (const friendship of saved.friendships) repository.friendships.set(pairKey(friendship.requesterId, friendship.addresseeId), friendship);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return repository;
  }
  async profileOf(identityId: string) { return this.profiles.get(identityId) ?? null; }
  async profileByUsername(username: string) { const id = this.usernames.get(usernameKey(username)); return id ? this.profiles.get(id) ?? null : null; }
  insertProfile(profile: Profile) { return this.serial(async () => {
    if (this.profiles.has(profile.identityId)) throw new Error("USERNAME_ALREADY_SET");
    if (this.usernames.has(usernameKey(profile.username))) throw new Error("USERNAME_TAKEN");
    this.profiles.set(profile.identityId, profile); this.usernames.set(usernameKey(profile.username), profile.identityId);
    try { await this.persist(); } catch (error) { this.profiles.delete(profile.identityId); this.usernames.delete(usernameKey(profile.username)); throw error; }
  }); }
  async friendshipBetween(left: string, right: string) { return this.friendships.get(pairKey(left, right)) ?? null; }
  saveFriendship(friendship: Friendship) { return this.serial(async () => {
    const key = pairKey(friendship.requesterId, friendship.addresseeId); const previous = this.friendships.get(key);
    this.friendships.set(key, friendship);
    try { await this.persist(); } catch (error) { if (previous) this.friendships.set(key, previous); else this.friendships.delete(key); throw error; }
  }); }
  deleteFriendship(left: string, right: string) { return this.serial(async () => {
    const key = pairKey(left, right); const previous = this.friendships.get(key); if (!previous) return;
    this.friendships.delete(key);
    try { await this.persist(); } catch (error) { this.friendships.set(key, previous); throw error; }
  }); }
  async friendshipsOf(identityId: string) { return [...this.friendships.values()].filter((entry) => entry.requesterId === identityId || entry.addresseeId === identityId); }
  async searchProfiles(prefix: string, limit: number) {
    return [...this.usernames.entries()].filter(([key]) => key.startsWith(prefix)).sort(([left], [right]) => left.localeCompare(right)).slice(0, limit).map(([, id]) => this.profiles.get(id)!);
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const result = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    const run = async () => { try { resolve(await operation()); } catch (error) { reject(error); } }; this.chain = this.chain.then(run, run); return result;
  }
  private async persist() {
    await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.${randomUUID()}.tmp`;
    const snapshot: Snapshot = { profiles: [...this.profiles.values()], friendships: [...this.friendships.values()] };
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.path);
  }
}

/** 3 a 20 caracteres: letras minúsculas sin tilde, números, punto o guion bajo; empieza por letra o número. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,19}$/;
export function normalizeUsername(input: string): string {
  const username = input.trim().replace(/^@/, "").toLowerCase(); if (!USERNAME_PATTERN.test(username)) throw new Error("INVALID_USERNAME"); return username;
}

type Identify = (token: string) => { readonly identityId: string; readonly displayName: string } | null;
type DisplayName = (identityId: string) => string | null;
/** Vista de una sala para invitar: solo si `identityId` está en ella (con su cuenta). */
type RoomOf = (code: string, identityId: string) => Promise<LobbyPreview | null>;

/** Visto hace menos de esto: «en línea». La app consulta cada 25 s mientras está abierta. */
export const ONLINE_WINDOW_MS = 60_000;
export const INVITATION_TTL_MS = 10 * 60_000;
const MAX_INVITATIONS_PER_PERSON = 20; const SEARCH_LIMIT = 10;
interface StoredInvitation extends RoomInvitation { readonly fromId: string; readonly toId: string }

/**
 * Perfiles (nombre de usuario sobre la cuenta anónima, cuyo token no cambia), amistades, bloqueos, presencia e invitaciones
 * a salas. La presencia y las invitaciones viven en memoria: un reinicio las vacía (una sola instancia).
 * Un bloqueo es una relación BLOCKED cuyo `requesterId` es quien bloquea: oculta a quien bloquea de las búsquedas del otro
 * e impide solicitudes, amistades e invitaciones en ambos sentidos.
 */
export class SocialManager {
  private readonly repository: SocialRepository; private readonly identify: Identify; private readonly displayName: DisplayName; private readonly now: () => number;
  private readonly lastSeen = new Map<string, number>(); private readonly invitations = new Map<string, StoredInvitation>();
  private roomOf: RoomOf | null = null;
  constructor(repository: SocialRepository, identify: Identify, displayName: DisplayName, now: () => number = Date.now) {
    this.repository = repository; this.identify = identify; this.displayName = displayName; this.now = now;
  }
  attachRooms(roomOf: RoomOf) { this.roomOf = roomOf; }

  /** Estado social de la cuenta; cada consulta cuenta como «visto ahora». */
  async view(token: string): Promise<SocialView> {
    const me = this.player(token); this.lastSeen.set(me.identityId, this.now()); this.prune();
    const profile = await this.repository.profileOf(me.identityId);
    const friends: FriendView[] = []; const incoming: SocialPerson[] = []; const outgoing: SocialPerson[] = []; const blocked: SocialPerson[] = [];
    for (const friendship of await this.repository.friendshipsOf(me.identityId)) {
      const otherId = friendship.requesterId === me.identityId ? friendship.addresseeId : friendship.requesterId; const person = await this.person(friendship, otherId);
      if (friendship.status === "ACCEPTED") friends.push({ ...person, since: friendship.updatedAt, online: this.online(otherId) });
      else if (friendship.status === "PENDING") (friendship.requesterId === me.identityId ? outgoing : incoming).push(person);
      else if (friendship.requesterId === me.identityId) blocked.push(person);
    }
    const byName = (left: SocialPerson, right: SocialPerson) => left.displayName.localeCompare(right.displayName, "es");
    friends.sort((left, right) => Number(right.online) - Number(left.online) || byName(left, right));
    const invitations = [...this.invitations.values()].filter((entry) => entry.toId === me.identityId).sort((left, right) => right.createdAt - left.createdAt)
      .map(({ fromId: _from, toId: _to, ...invitation }) => invitation);
    return { username: profile?.username ?? null, displayName: me.displayName, friends, incoming: incoming.sort(byName), outgoing: outgoing.sort(byName), blocked: blocked.sort(byName), invitations };
  }
  async claimUsername(token: string, input: string): Promise<SocialView> {
    const me = this.player(token); const username = normalizeUsername(input);
    await this.repository.insertProfile({ identityId: me.identityId, username, createdAt: this.now() });
    return this.view(token);
  }
  /** Busca por el principio del nombre de usuario (mínimo 2 caracteres). Quien me bloqueó no aparece. */
  async search(token: string, query: string): Promise<readonly SocialSearchResult[]> {
    const me = this.player(token); const prefix = query.trim().replace(/^@/, "").toLowerCase(); if (prefix.length < 2) return [];
    const results: SocialSearchResult[] = [];
    for (const profile of await this.repository.searchProfiles(prefix, SEARCH_LIMIT + 5)) {
      if (profile.identityId === me.identityId) continue;
      const friendship = await this.repository.friendshipBetween(me.identityId, profile.identityId);
      if (friendship?.status === "BLOCKED" && friendship.requesterId !== me.identityId) continue;
      results.push({ username: profile.username, displayName: this.displayName(profile.identityId) ?? "—", relation: relationOf(friendship, me.identityId), friendshipId: friendship?.friendshipId ?? null });
      if (results.length === SEARCH_LIMIT) break;
    }
    return results;
  }
  /** Envía una solicitud; si el otro ya me la había enviado, queda aceptada. */
  async request(token: string, username: string): Promise<SocialView> {
    const me = this.player(token); const otherId = await this.identityOfUsername(username);
    if (!otherId || otherId === me.identityId) throw new Error(otherId ? "CANNOT_FRIEND_SELF" : "USER_NOT_FOUND");
    const existing = await this.repository.friendshipBetween(me.identityId, otherId); const now = this.now();
    if (existing?.status === "BLOCKED") throw new Error(existing.requesterId === me.identityId ? "BLOCKED_BY_YOU" : "USER_NOT_FOUND");
    if (existing?.status === "PENDING" && existing.addresseeId === me.identityId) await this.repository.saveFriendship({ ...existing, status: "ACCEPTED", updatedAt: now });
    else if (!existing) await this.repository.saveFriendship({ friendshipId: randomUUID(), requesterId: me.identityId, addresseeId: otherId, status: "PENDING", createdAt: now, updatedAt: now });
    return this.view(token);
  }
  /** accept/decline: solo quien recibe la solicitud. remove: amigos o solicitud enviada. block: cualquier relación. unblock: solo quien bloqueó. */
  async act(token: string, friendshipId: string, action: "accept" | "decline" | "remove" | "block" | "unblock"): Promise<SocialView> {
    const me = this.player(token); const friendship = (await this.repository.friendshipsOf(me.identityId)).find((entry) => entry.friendshipId === friendshipId);
    if (!friendship) throw new Error("FRIENDSHIP_NOT_FOUND");
    const otherId = friendship.requesterId === me.identityId ? friendship.addresseeId : friendship.requesterId; const now = this.now();
    const incoming = friendship.status === "PENDING" && friendship.addresseeId === me.identityId;
    if (action === "accept") { if (!incoming) throw new Error("FRIENDSHIP_NOT_FOUND"); await this.repository.saveFriendship({ ...friendship, status: "ACCEPTED", updatedAt: now }); }
    else if (action === "decline") { if (!incoming) throw new Error("FRIENDSHIP_NOT_FOUND"); await this.repository.deleteFriendship(me.identityId, otherId); }
    else if (action === "remove") { if (friendship.status === "BLOCKED") throw new Error("FRIENDSHIP_NOT_FOUND"); await this.repository.deleteFriendship(me.identityId, otherId); }
    else if (action === "unblock") { if (friendship.status !== "BLOCKED" || friendship.requesterId !== me.identityId) throw new Error("FRIENDSHIP_NOT_FOUND"); await this.repository.deleteFriendship(me.identityId, otherId); }
    else await this.block(me.identityId, otherId, friendship);
    return this.view(token);
  }
  /** Bloquear a alguien encontrado por nombre de usuario (sin relación previa o con cualquiera). */
  async blockUsername(token: string, username: string): Promise<SocialView> {
    const me = this.player(token); const otherId = await this.identityOfUsername(username); if (!otherId || otherId === me.identityId) throw new Error("USER_NOT_FOUND");
    const existing = await this.repository.friendshipBetween(me.identityId, otherId);
    if (existing?.status === "BLOCKED" && existing.requesterId !== me.identityId) throw new Error("USER_NOT_FOUND");
    await this.block(me.identityId, otherId, existing); return this.view(token);
  }
  /** Invita a un amigo a una sala con código en la que estoy con mi cuenta y que aún tiene plazas libres. */
  async invite(token: string, friendshipId: string, code: string): Promise<SocialView> {
    const me = this.player(token); const friendship = (await this.repository.friendshipsOf(me.identityId)).find((entry) => entry.friendshipId === friendshipId);
    if (!friendship || friendship.status !== "ACCEPTED") throw new Error("FRIENDSHIP_NOT_FOUND");
    const room = await this.roomOf?.(code.trim().toUpperCase(), me.identityId); if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.status !== "WAITING" || room.freeSeats === 0) throw new Error("ROOM_FULL");
    const toId = friendship.requesterId === me.identityId ? friendship.addresseeId : friendship.requesterId; const now = this.now(); this.prune();
    for (const [id, entry] of this.invitations) if (entry.fromId === me.identityId && entry.toId === toId && entry.code === room.code) this.invitations.delete(id);
    const pending = [...this.invitations.values()].filter((entry) => entry.toId === toId).sort((left, right) => left.createdAt - right.createdAt);
    for (const old of pending.slice(0, Math.max(0, pending.length - MAX_INVITATIONS_PER_PERSON + 1))) this.invitations.delete(old.invitationId);
    const invitationId = randomUUID();
    this.invitations.set(invitationId, { invitationId, fromId: me.identityId, toId, fromName: me.displayName, fromUsername: await this.usernameOf(me.identityId), code: room.code,
      mode: room.mode, rules: room.rules, targetScore: room.targetScore, createdAt: now, expiresAt: now + INVITATION_TTL_MS });
    return this.view(token);
  }
  async dismissInvitation(token: string, invitationId: string): Promise<SocialView> {
    const me = this.player(token); const invitation = this.invitations.get(invitationId); if (invitation?.toId === me.identityId) this.invitations.delete(invitationId); return this.view(token);
  }
  async identityOfUsername(username: string): Promise<string | null> {
    try { return (await this.repository.profileByUsername(normalizeUsername(username)))?.identityId ?? null; } catch { return null; }
  }
  async usernameOf(identityId: string): Promise<string | null> { return (await this.repository.profileOf(identityId))?.username ?? null; }
  /**
   * Amistad aceptada al entrar por invitación. Nunca toca una relación bloqueada; una solicitud pendiente queda aceptada.
   * Devuelve si quedaron como amigos.
   */
  async befriendByInvitation(inviterId: string, guestId: string): Promise<boolean> {
    if (inviterId === guestId) return false;
    const existing = await this.repository.friendshipBetween(inviterId, guestId); const now = this.now();
    if (existing?.status === "BLOCKED") return false; if (existing?.status === "ACCEPTED") return true;
    await this.repository.saveFriendship(existing ? { ...existing, status: "ACCEPTED", updatedAt: now }
      : { friendshipId: randomUUID(), requesterId: inviterId, addresseeId: guestId, status: "ACCEPTED", createdAt: now, updatedAt: now });
    return true;
  }
  private async block(meId: string, otherId: string, existing: Friendship | null) {
    const now = this.now();
    await this.repository.saveFriendship({ friendshipId: existing?.friendshipId ?? randomUUID(), requesterId: meId, addresseeId: otherId, status: "BLOCKED", createdAt: existing?.createdAt ?? now, updatedAt: now });
    for (const [id, entry] of this.invitations) if ((entry.fromId === meId && entry.toId === otherId) || (entry.fromId === otherId && entry.toId === meId)) this.invitations.delete(id);
  }
  private async person(friendship: Friendship, otherId: string): Promise<SocialPerson> {
    return { friendshipId: friendship.friendshipId, username: await this.usernameOf(otherId), displayName: this.displayName(otherId) ?? "—" };
  }
  private online(identityId: string) { const seen = this.lastSeen.get(identityId); return seen !== undefined && this.now() - seen < ONLINE_WINDOW_MS; }
  private prune() { const now = this.now(); for (const [id, entry] of this.invitations) if (entry.expiresAt <= now) this.invitations.delete(id); }
  private player(token: string) { const player = this.identify(token); if (!player) throw new Error("UNAUTHENTICATED"); return player; }
}

function relationOf(friendship: Friendship | null, meId: string): SocialRelation {
  if (!friendship) return "NONE"; if (friendship.status === "ACCEPTED") return "FRIEND"; if (friendship.status === "BLOCKED") return "BLOCKED";
  return friendship.requesterId === meId ? "PENDING_OUT" : "PENDING_IN";
}
