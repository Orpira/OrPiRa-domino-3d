import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { MatchResult, Phase } from "../../../packages/rules/src/index.ts";
import { claimMatchCelebration } from "./match-celebration.ts";
import type { StorageLike } from "./session-storage.ts";

// Caída lenta y escalonada: cada pieza tarda entre 4,6 y 7,1 s y se balancea de lado a lado mientras baja.
const pieces = Array.from({ length: 44 }, (_, index) => ({
  left: (index * 37 + 7) % 100,
  delay: (index % 11) * 160,
  duration: 4600 + (index % 6) * 500,
  drift: ((index * 29) % 90) - 45,
  sway: 16 + (index * 13) % 28,
  swayDuration: 1300 + (index % 5) * 220,
  ribbon: index % 4 === 0,
}));
/** La celebración se retira cuando ha caído la última pieza. */
export const CELEBRATION_MS = Math.max(...pieces.map((piece) => piece.delay + piece.duration)) + 300;

export function MatchCelebration({ matchId, phase, result, reducedMotion, storage }:
  { matchId: string; phase: Phase; result: MatchResult | null; reducedMotion: boolean; storage: StorageLike }) {
  const claimed = useRef(false); const [active, setActive] = useState(false);
  useEffect(() => {
    if (claimed.current) return; claimed.current = true;
    if (!claimMatchCelebration(storage, matchId, phase, result, reducedMotion)) return;
    setActive(true); const timer = window.setTimeout(() => setActive(false), CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [matchId, phase, reducedMotion, result, storage]);
  if (!active) return null;
  return <div className="match-celebration" aria-hidden="true">
    {pieces.map((piece, index) => <i key={index} className={piece.ribbon ? "ribbon" : "confetti"} style={{
      "--left": `${piece.left}%`, "--delay": `${piece.delay}ms`, "--duration": `${piece.duration}ms`, "--drift": `${piece.drift}px`,
      "--sway": `${piece.sway}px`, "--sway-duration": `${piece.swayDuration}ms`,
    } as CSSProperties}/>) }
  </div>;
}
