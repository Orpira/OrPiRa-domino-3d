import type { GameState } from "../../../packages/rules/src/index.ts";
import { isRestorableState, type LocalMode } from "./local-game.ts";

export const SESSION_KEY = "orpira-domino-3d:local-session:v1";
export interface LocalSession { readonly version: 1; readonly mode: LocalMode; readonly state: GameState; readonly handoffRequired: boolean }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export function saveSession(storage: StorageLike, session: LocalSession): void {
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}
export function loadSession(storage: StorageLike): LocalSession | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LocalSession>;
    if (value.version !== 1 || (value.mode !== "BOTS" && value.mode !== "PASS_AND_PLAY") ||
        typeof value.handoffRequired !== "boolean" || !value.state || !isRestorableState(value.state)) return null;
    return value as LocalSession;
  } catch { return null; }
}
export function clearSession(storage: StorageLike): void { storage.removeItem(SESSION_KEY); }
