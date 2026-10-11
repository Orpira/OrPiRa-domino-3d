import type { LeagueAwardView, LeagueRankId, LeagueRankView } from "../../../packages/protocol/src/index.ts";

export const RANK_NAMES: Readonly<Record<LeagueRankId, string>> = {
  DOUBLE_0: "Doble blanca", DOUBLE_1: "Doble uno", DOUBLE_2: "Doble dos", DOUBLE_3: "Doble tres", DOUBLE_4: "Doble cuatro", DOUBLE_5: "Doble cinco", DOUBLE_6: "Doble seis",
};
export const rankPips = (rank: LeagueRankId) => Number(rank.slice(-1));
const number = new Intl.NumberFormat("es-CO");
export const formatLeaguePoints = (points: number) => `${number.format(points)} ${points === 1 ? "punto" : "puntos"}`;

/** Progreso dentro del rango actual hacia el siguiente, entre 0 y 1; el rango máximo cuenta como completo. */
export function rankProgress(points: number, rank: LeagueRankId, ranks: readonly LeagueRankView[]): number {
  const index = ranks.findIndex((entry) => entry.id === rank); const current = ranks[index]; const next = ranks[index + 1];
  if (!current || !next) return 1; return Math.min(1, Math.max(0, (points - current.minPoints) / (next.minPoints - current.minPoints)));
}

export interface AwardLine { readonly label: string; readonly value: string }
/** Desglose legible de la concesión calculada por el servidor; no recalcula puntos. */
export function awardBreakdown(award: LeagueAwardView): readonly AwardLine[] {
  return [
    { label: `Posición final ${award.position}.º`, value: `${award.basePoints} base` },
    { label: `Humanos en la mesa ${award.humans} de 4`, value: `× ${award.humans}/4, redondeo hacia abajo` },
    ...(award.automatic ? [{ label: "Terminaste en modo automático", value: "0 puntos" }] : []),
    { label: "Puntos de liga ganados", value: `+${award.points}` },
  ];
}
export function daysLeftText(days: number): string { return days <= 0 ? "Cierra hoy" : days === 1 ? "Queda 1 día" : `Quedan ${days} días`; }
