import { useCallback, useEffect, useRef, useState } from "react";
import type { SimulatedConditions, TestAccountView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { CompetitionApiError, competitionApi } from "./competition-api.ts";
import { competitionErrorMessage } from "./competition-presentation.ts";
import { persistentStorage, readJson, removeKey, writeJson } from "./device-storage.ts";

export const IDENTITY_KEY = "orpira-domino-3d:test-identity:v1";
export type LoadStatus = "IDLE" | "LOADING" | "READY" | "ERROR" | "UNAVAILABLE";
export interface Loadable<T> { readonly status: LoadStatus; readonly data: T | null; readonly error: string | null }

function failure(error: unknown) {
  const code = error instanceof CompetitionApiError ? error.code : "NETWORK";
  return { status: (code === "NOT_AVAILABLE" ? "UNAVAILABLE" : "ERROR") as LoadStatus, code, error: competitionErrorMessage(code) };
}

export function useConditions() {
  const [state, setState] = useState<Loadable<SimulatedConditions>>({ status: "LOADING", data: null, error: null });
  const load = useCallback(async (signal?: AbortSignal) => {
    setState((current) => ({ ...current, status: "LOADING", error: null }));
    try { setState({ status: "READY", data: await competitionApi.conditions(signal), error: null }); }
    catch (error) { if ((error as Error).name === "AbortError") return; const result = failure(error); setState({ status: result.status, data: null, error: result.error }); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  return { ...state, reload: () => void load() };
}

export function useTestAccount() {
  const [identity, setIdentity] = useState<TestIdentityGrant | null>(() => readJson<TestIdentityGrant>(persistentStorage(), IDENTITY_KEY));
  const [account, setAccount] = useState<Loadable<TestAccountView>>({ status: "IDLE", data: null, error: null });
  const [creating, setCreating] = useState(false); const [createError, setCreateError] = useState("");
  const identityRef = useRef(identity); identityRef.current = identity;
  const refresh = useCallback(async () => {
    const active = identityRef.current; if (!active) return;
    setAccount((current) => ({ ...current, status: current.data ? current.status : "LOADING", error: null }));
    try { const data = await competitionApi.account(active.identityToken); if (identityRef.current === active) setAccount({ status: "READY", data, error: null }); }
    catch (error) { const result = failure(error); if (identityRef.current === active) setAccount((current) => ({ status: result.status, data: result.code === "UNAUTHENTICATED" ? null : current.data, error: result.error })); }
  }, []);
  useEffect(() => { if (identity) void refresh(); else setAccount({ status: "IDLE", data: null, error: null }); }, [identity, refresh]);
  const create = useCallback(async (displayName: string) => {
    if (creating) return; setCreating(true); setCreateError("");
    try { const grant = await competitionApi.createIdentity(displayName.trim()); writeJson(persistentStorage(), IDENTITY_KEY, grant); setIdentity(grant); }
    catch (error) { setCreateError(failure(error).error); }
    finally { setCreating(false); }
  }, [creating]);
  const recover = useCallback(async (code: string) => {
    if (creating) return; setCreating(true); setCreateError("");
    try { const data = await competitionApi.account(code.trim()); const grant: TestIdentityGrant = { identityId: data.identityId, identityToken: code.trim(), displayName: data.displayName };
      writeJson(persistentStorage(), IDENTITY_KEY, grant); setIdentity(grant); setAccount({ status: "READY", data, error: null }); }
    catch (error) { const result = failure(error); setCreateError(result.code === "UNAUTHENTICATED" ? "El código de recuperación no corresponde a ninguna cuenta de prueba de este servidor." : result.error); }
    finally { setCreating(false); }
  }, [creating]);
  const forget = useCallback(() => { removeKey(persistentStorage(), IDENTITY_KEY); setIdentity(null); }, []);
  const replace = useCallback((data: TestAccountView) => setAccount({ status: "READY", data, error: null }), []);
  return { identity, account, refresh, create, recover, creating, createError, forget, replace };
}
export type TestAccount = ReturnType<typeof useTestAccount>;
export type Conditions = ReturnType<typeof useConditions>;
