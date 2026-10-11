import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { MatchResult, Phase } from "../../../packages/rules/src/index.ts";
import { claimMatchCelebration } from "./match-celebration.ts";
import type { StorageLike } from "./session-storage.ts";

const pieces = Array.from({ length: 28 }, (_, index) => ({
  left: (index * 37 + 7) % 100,
  delay: (index % 7) * 55,
  duration: 1250 + (index % 5) * 120,
  drift: ((index * 29) % 90) - 45,
  ribbon: index % 4 === 0,
}));

export function MatchCelebration({ matchId, phase, result, reducedMotion, storage }:
  { matchId: string; phase: Phase; result: MatchResult | null; reducedMotion: boolean; storage: StorageLike }) {
  const claimed = useRef(false); const [active, setActive] = useState(false);
  useEffect(() => {
    if (claimed.current) return; claimed.current = true;
    if (!claimMatchCelebration(storage, matchId, phase, result, reducedMotion)) return;
    setActive(true); const timer = window.setTimeout(() => setActive(false), 2_100);
    return () => window.clearTimeout(timer);
  }, [matchId, phase, reducedMotion, result, storage]);
  if (!active) return null;
  return <div className="match-celebration" aria-hidden="true">
    {pieces.map((piece, index) => <i key={index} className={piece.ribbon ? "ribbon" : "confetti"} style={{
      "--left": `${piece.left}%`, "--delay": `${piece.delay}ms`, "--duration": `${piece.duration}ms`, "--drift": `${piece.drift}px`,
    } as CSSProperties}/>) }
  </div>;
}
