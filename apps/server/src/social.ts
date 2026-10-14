import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FriendView, SocialView } from "../../../packages/protocol/src/index.ts";

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
  friendshipsOf(identityId: string): Promise<readonly Friendship[]>;
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
  async friendshipsOf(identityId: string) { return [...this.friendships.values()].filter((entry) => entry.requesterId === identityId || entry.addresseeId === identityId); }

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

/** Perfiles (nombre de usuario sobre la cuenta anónima, cuyo token no cambia) y amistades. */
export class SocialManager {
  private readonly repository: SocialRepository; private readonly identify: Identify; private readonly displayName: DisplayName; private readonly now: () => number;
  constructor(repository: SocialRepository, identify: Identify, displayName: DisplayName, now: () => number = Date.now) {
    this.repository = repository; this.identify = identify; this.displayName = displayName; this.now = now;
  }
  async view(token: string): Promise<SocialView> {
    const me = this.player(token); const profile = await this.repository.profileOf(me.identityId);
    const friends: FriendView[] = [];
    for (const friendship of await this.repository.friendshipsOf(me.identityId)) {
      if (friendship.status !== "ACCEPTED") continue;
      const otherId = friendship.requesterId === me.identityId ? friendship.addresseeId : friendship.requesterId;
      friends.push({ username: (await this.repository.profileOf(otherId))?.username ?? null, displayName: this.displayName(otherId) ?? "—", since: friendship.updatedAt });
    }
    friends.sort((left, right) => left.displayName.localeCompare(right.displayName, "es"));
    return { username: profile?.username ?? null, displayName: me.displayName, friends };
  }
  async claimUsername(token: string, input: string): Promise<SocialView> {
    const me = this.player(token); const username = normalizeUsername(input);
    await this.repository.insertProfile({ identityId: me.identityId, username, createdAt: this.now() });
    return this.view(token);
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
  private player(token: string) { const player = this.identify(token); if (!player) throw new Error("UNAUTHENTICATED"); return player; }
}
