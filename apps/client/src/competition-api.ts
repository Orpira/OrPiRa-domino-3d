import type { GameMode, RulesId } from "../../../packages/rules/src/index.ts";
import type { CompetitionView, LobbyPreview, SessionGrant, SocialSearchResult, SocialView, LeagueHistoryView, LeagueView, QuickPlayHistoryEntry, QuickPlayView, SimulatedConditions, TestAccountView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { apiUrl } from "./api.ts";

export class CompetitionApiError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}

async function request<T>(path: string, init: { method?: "GET" | "POST"; token?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method: init.method ?? "GET", headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}), ...(init.signal ? { signal: init.signal } : {}) });
  } catch (error) { if ((error as Error).name === "AbortError") throw error; throw new CompetitionApiError("NETWORK", 0); }
  const value = await response.json().catch(() => null) as (T & { code?: string }) | null;
  // Ninguna ruta de competición responde 404: un 404 indica un servidor sin estas capacidades.
  // Un 404 sin código propio (o el genérico de rutas desconocidas) indica un servidor sin esa función.
  if (response.status === 404 && (!value?.code || value.code === "MATCH_NOT_FOUND" || value.code === "NOT_FOUND")) throw new CompetitionApiError("NOT_AVAILABLE", 404);
  if (!response.ok || !value) throw new CompetitionApiError(value?.code ?? `HTTP_${response.status}`, response.status);
  return value;
}

export const competitionApi = {
  conditions: (signal?: AbortSignal) => request<SimulatedConditions>("/api/simulated-conditions", signal ? { signal } : {}),
  createIdentity: (displayName: string) => request<TestIdentityGrant>("/api/test-identities", { method: "POST", body: { displayName } }),
  account: (token: string, signal?: AbortSignal) => request<TestAccountView>("/api/test-account", { token, ...(signal ? { signal } : {}) }),
  create: (token: string) => request<CompetitionView>("/api/competitions", { method: "POST", token, body: {} }),
  view: (code: string, token: string, signal?: AbortSignal) => request<CompetitionView>(`/api/competitions/${encodeURIComponent(code)}`, { token, ...(signal ? { signal } : {}) }),
  join: (code: string, token: string) => request<CompetitionView>(`/api/competitions/${encodeURIComponent(code)}/join`, { method: "POST", token, body: {} }),
  accept: (code: string, token: string, conditionsVersion: number) => request<CompetitionView>(`/api/competitions/${encodeURIComponent(code)}/accept`, { method: "POST", token, body: { conditionsVersion } }),
  leave: (code: string, token: string) => request<TestAccountView>(`/api/competitions/${encodeURIComponent(code)}/leave`, { method: "POST", token, body: {} }),
  cancel: (code: string, token: string) => request<CompetitionView>(`/api/competitions/${encodeURIComponent(code)}/cancel`, { method: "POST", token, body: {} }),
  annul: (code: string, token: string) => request<CompetitionView>(`/api/competitions/${encodeURIComponent(code)}/annul`, { method: "POST", token, body: {} }),
};

export function competitionCommandUrl(code: string): string { return `/api/competitions/${encodeURIComponent(code)}/commands`; }

export const quickPlayApi = {
  view: (token: string, signal?: AbortSignal) => request<QuickPlayView>("/api/quick-play", { token, ...(signal ? { signal } : {}) }),
  join: (token: string, table: { readonly mode: GameMode; readonly rules: RulesId } = { mode: "INDIVIDUAL", rules: "LATINO" }) => request<QuickPlayView>("/api/quick-play/join", { method: "POST", token, body: table }),
  cancel: (token: string) => request<QuickPlayView>("/api/quick-play/cancel", { method: "POST", token, body: {} }),
  dismiss: (token: string) => request<QuickPlayView>("/api/quick-play/dismiss", { method: "POST", token, body: {} }),
  history: (token: string) => request<readonly QuickPlayHistoryEntry[]>("/api/quick-play/history", { token }),
};
export const QUICK_PLAY_COMMANDS = "/api/quick-play/commands";

export const leagueApi = {
  view: (token: string | null, signal?: AbortSignal) => request<LeagueView>("/api/league", { ...(token ? { token } : {}), ...(signal ? { signal } : {}) }),
  history: (token: string) => request<LeagueHistoryView>("/api/league/history", { token }),
};

export const socialApi = {
  view: (token: string, signal?: AbortSignal) => request<SocialView>("/api/social", { token, ...(signal ? { signal } : {}) }),
  claimUsername: (token: string, username: string) => request<SocialView>("/api/social/username", { method: "POST", token, body: { username } }),
  search: (token: string, query: string, signal?: AbortSignal) => request<readonly SocialSearchResult[]>(`/api/social/search?q=${encodeURIComponent(query)}`, { token, ...(signal ? { signal } : {}) }),
  request: (token: string, username: string) => request<SocialView>("/api/social/requests", { method: "POST", token, body: { username } }),
  block: (token: string, username: string) => request<SocialView>("/api/social/block", { method: "POST", token, body: { username } }),
  act: (token: string, friendshipId: string, action: "accept" | "decline" | "remove" | "block" | "unblock") =>
    request<SocialView>(`/api/social/friendships/${encodeURIComponent(friendshipId)}/${action}`, { method: "POST", token, body: {} }),
  invite: (token: string, friendshipId: string, code: string) => request<SocialView>("/api/social/invitations", { method: "POST", token, body: { friendshipId, code } }),
  dismissInvitation: (token: string, invitationId: string) => request<SocialView>(`/api/social/invitations/${encodeURIComponent(invitationId)}/dismiss`, { method: "POST", token, body: {} }),
};
export const lobbyApi = {
  preview: (code: string, inviter: string | null, signal?: AbortSignal) =>
    request<LobbyPreview>(`/api/lobbies/${encodeURIComponent(code)}/preview${inviter ? `?de=${encodeURIComponent(inviter)}` : ""}`, signal ? { signal } : {}),
  /** Entrar por invitación con la cuenta de prueba: la plaza queda enlazada a la cuenta y se crea la amistad con quien invitó. */
  joinByInvitation: (code: string, token: string, inviter: string | null) =>
    request<SessionGrant>(`/api/lobbies/${encodeURIComponent(code)}/join`, { method: "POST", token, body: { invitation: inviter ? { inviter } : {} } }),
};
