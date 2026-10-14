import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SocialView } from "../../../packages/protocol/src/index.ts";
import { CompetitionApiError, socialApi } from "./competition-api.ts";
import { competitionErrorMessage } from "./competition-presentation.ts";

/** Cada cuánto consulta la app el estado social (presencia, solicitudes e invitaciones) mientras está abierta y visible. */
export const SOCIAL_POLL_MS = 25_000;
export interface SocialState {
  readonly token: string | null; readonly social: SocialView | null; readonly error: string;
  readonly refresh: () => Promise<void>;
  /** Aplica la vista que devuelve una acción (así la pantalla no espera a la siguiente consulta). */
  readonly apply: (view: SocialView) => void;
}
const SocialContext = createContext<SocialState>({ token: null, social: null, error: "", refresh: async () => {}, apply: () => {} });

export function SocialProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [social, setSocial] = useState<SocialView | null>(null); const [error, setError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!token) { setSocial(null); setError(""); return; }
    try { setSocial(await socialApi.view(token, signal)); setError(""); }
    catch (failure) { if ((failure as Error).name === "AbortError") return; setError(competitionErrorMessage(failure instanceof CompetitionApiError ? failure.code : "NETWORK")); if (failure instanceof CompetitionApiError && failure.code !== "NETWORK") setSocial(null); }
  }, [token]);
  useEffect(() => {
    setSocial(null); const controller = new AbortController(); void refresh(controller.signal);
    const tick = () => { if (document.visibilityState === "visible") void refresh(controller.signal); };
    const timer = window.setInterval(tick, SOCIAL_POLL_MS); document.addEventListener("visibilitychange", tick);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);
  const value = useMemo<SocialState>(() => ({ token, social, error, refresh: () => refresh(), apply: setSocial }), [token, social, error, refresh]);
  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}
export function useSocialState(): SocialState { return useContext(SocialContext); }
