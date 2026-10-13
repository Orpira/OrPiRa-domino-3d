import { teamOf, type GameState, type MatchResult, type RoundResult } from "../../../packages/rules/src/index.ts";

export interface TeamStanding { readonly ids: readonly string[]; readonly label: string; readonly score: number; readonly active: boolean }

/** El jugador local se llama «Tú» en la práctica: los verbos concuerdan con él. */
const isYou = (name: string) => name === "Tú";
/** «Sale Bruno» / «Sales tú». */
export function openerText(name: string): string { return isYou(name) ? "Sales tú" : `Sale ${name}`; }

/** «Tú y Bruno»: los dos compañeros por orden de asiento. */
export function teamLabel(ids: readonly string[], names: Readonly<Record<string, string>>): string {
  return ids.map((id) => names[id] ?? id).join(" y ");
}

/** Las dos parejas de la mesa con su marcador compartido: primero la de `firstId` (por defecto, el asiento 0: el jugador local). */
export function teamStandings(state: Pick<GameState, "mode" | "players" | "currentPlayerId">, names: Readonly<Record<string, string>>, firstId?: string): readonly TeamStanding[] {
  const first = state.players.find((p) => firstId ? p.playerId === firstId : p.seat === 0) ?? state.players.find((p) => p.seat === 0)!;
  const second = state.players.find((p) => p.seat === (first.seat + 1) % 4)!;
  return [first, second].map((anchor) => {
    const ids = teamOf(state, anchor.playerId);
    return { ids, label: teamLabel(ids, names), score: anchor.score, active: state.currentPlayerId !== null && ids.includes(state.currentPlayerId) };
  });
}

/** Titular y detalle del resultado de una mano en parejas. */
export function pairsRoundText(result: RoundResult, names: Readonly<Record<string, string>>): { readonly headline: string; readonly detail: string } {
  const points = result.winningTeam ? result.scoreDeltas[result.winningTeam[0]!] ?? 0 : 0;
  if (result.reason === "DOMINO") {
    return { headline: `${teamLabel(result.winningTeam ?? [], names)} ganan la mano`,
      detail: `${isYou(names[result.winnerId!] ?? "") ? "Dominaste tú" : `Dominó ${names[result.winnerId!] ?? result.winnerId}`}: +${points} puntos, la suma de las cuatro manos.` };
  }
  if (!result.winningTeam) return { headline: "Tranque empatado", detail: "Las dos parejas suman lo mismo: nadie se lleva puntos." };
  return { headline: `${teamLabel(result.winningTeam, names)} ganan el tranque`, detail: `Su pareja tiene menos puntos en mano: +${points} puntos, la suma de las cuatro manos.` };
}

/** Pareja campeona y su marcador. */
export function championTeamText(result: MatchResult, names: Readonly<Record<string, string>>): { readonly label: string; readonly score: number } {
  const team = result.championTeam ?? [result.championId];
  return { label: teamLabel(team, names), score: result.finalScores[team[0]!] ?? 0 };
}
