import type { MatchResult, Phase, Player, RoundResult } from "../../../packages/rules/src/index.ts";

export const TARGET_SCORE = 100;
export const DOMINO_POINTS = 20;

export function dominationsRemaining(score: number, target: number = TARGET_SCORE): number {
  return Math.max(0, Math.ceil((target - score) / DOMINO_POINTS));
}

export interface RankedPlayer { readonly playerId: string; readonly name: string; readonly score: number; readonly rank: number; readonly tied: boolean }
export function finalRanking(players: readonly Player[], names: Readonly<Record<string, string>>, result: MatchResult): readonly RankedPlayer[] {
  const sorted = players.map((player) => ({ playerId: player.playerId, name: names[player.playerId] ?? player.playerId, score: result.finalScores[player.playerId] ?? player.score }))
    .sort((left, right) => right.score - left.score);
  return sorted.map((player, index) => ({ ...player,
    rank: sorted.findIndex((candidate) => candidate.score === player.score) + 1,
    tied: sorted.some((candidate) => candidate.playerId !== player.playerId && candidate.score === player.score),
  }));
}

export function roundHeadline(result: RoundResult): string {
  if (result.reason === "DOMINO") return "Ganador de ronda por dominada · +20 puntos";
  return result.winnerId ? "Ganador de ronda por cierre · +0 puntos" : "Empate de ronda por cierre · +0 puntos";
}

export function shouldShowMatchFinale(phase: Phase, result: MatchResult | null): result is MatchResult {
  return phase === "MATCH_ENDED" && result !== null;
}
