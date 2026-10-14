import { useEffect, useRef, useState } from "react";
import type { Player } from "../../../packages/rules/src/index.ts";
import { scoreGains } from "./modes-presentation.ts";

export interface ScorePop { readonly key: number; readonly playerId: string; readonly points: number }
/** Tiempo que se ve el «+15» antes de desaparecer. */
export const SCORE_POP_MS = 1800;

/** «+15» flotante cada vez que alguien suma puntos (solo si `enabled`); el primer estado no cuenta. */
export function useScorePops(players: readonly Player[], matchId: string, enabled: boolean): readonly ScorePop[] {
  const previous = useRef<{ matchId: string; players: readonly Player[] } | null>(null); const counter = useRef(0);
  const [pops, setPops] = useState<readonly ScorePop[]>([]);
  useEffect(() => {
    const before = previous.current?.matchId === matchId ? previous.current.players : null; previous.current = { matchId, players };
    if (!enabled) return;
    const gains = scoreGains(before, players); if (!gains.length) return;
    const fresh = gains.map((gain) => ({ ...gain, key: ++counter.current }));
    setPops((current) => [...current, ...fresh]);
    const timer = window.setTimeout(() => setPops((current) => current.filter((pop) => !fresh.includes(pop))), SCORE_POP_MS);
    return () => window.clearTimeout(timer);
  }, [players, matchId, enabled]);
  return pops;
}

export function ScorePops({ pops, names }: { pops: readonly ScorePop[]; names: Readonly<Record<string, string>> }) {
  return <div className="score-pops" aria-live="polite">{pops.map((pop) => <span key={pop.key} className="score-pop">+{pop.points}<small>{names[pop.playerId] ?? ""}</small></span>)}</div>;
}
