import type { MatchResult, Phase } from "../../../packages/rules/src/index.ts";
import type { StorageLike } from "./session-storage.ts";

const CELEBRATION_PREFIX = "orpira-domino-3d:celebrated:v1:";

export function claimMatchCelebration(
  storage: StorageLike,
  matchId: string,
  phase: Phase,
  result: MatchResult | null,
  reducedMotion: boolean,
): boolean {
  if (phase !== "MATCH_ENDED" || !result) return false;
  const key = `${CELEBRATION_PREFIX}${matchId}`;
  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, result.championId);
  } catch {
    // El componente conserva además una guarda en memoria cuando Storage no está disponible.
  }
  return !reducedMotion;
}
