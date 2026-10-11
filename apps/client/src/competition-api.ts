import type { CompetitionView, SimulatedConditions, TestAccountView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
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
  if (response.status === 404) throw new CompetitionApiError("NOT_AVAILABLE", 404);
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
