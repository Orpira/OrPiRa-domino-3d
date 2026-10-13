import { INDIVIDUAL_TARGET, PAIRS_TARGET, type GameMode, type RoundResult, type RulesId, type TargetScore } from "../../../packages/rules/src/index.ts";
import { roundHeadline } from "./online-presentation.ts";

/** Lo que el jugador elige al preparar una mesa. `targetScore` ausente: el de la modalidad (100 individual, 200 parejas). */
export interface TableChoice { readonly rules: RulesId; readonly mode: GameMode; readonly targetScore?: TargetScore }
export const RULES_LABELS: Readonly<Record<RulesId, string>> = { LATINO: "Latino", DRAW: "Con robo" };

export function defaultTarget(mode: GameMode): TargetScore { return mode === "PAIRS" ? PAIRS_TARGET : INDIVIDUAL_TARGET; }
export function effectiveTarget(choice: TableChoice): TargetScore { return choice.targetScore ?? defaultTarget(choice.mode); }
/** Con robo solo existe en individual; el objetivo por defecto no se envía (la partida queda igual que antes de poder elegirlo). */
export function normalizeChoice(choice: TableChoice): TableChoice {
  const mode = choice.rules === "LATINO" ? choice.mode : "INDIVIDUAL";
  return { rules: choice.rules, mode, ...(choice.targetScore !== undefined && choice.targetScore !== defaultTarget(mode) ? { targetScore: choice.targetScore } : {}) };
}
/** «Latino · parejas a 200», «Con robo · a 150». */
export function choiceLabel(choice: TableChoice): string {
  const target = effectiveTarget(choice);
  return choice.rules === "LATINO" ? `Latino · ${choice.mode === "PAIRS" ? "parejas" : "individual"} a ${target}` : `${RULES_LABELS[choice.rules]} · a ${target}`;
}
/** Resumen de reglas para el pie de la mesa y los contratos de partida. */
export function rulesSummary(choice: TableChoice): string {
  if (choice.rules === "DRAW") return "4 jugadores · 5 fichas y 8 al pozo · roba hasta poder jugar · el ganador suma las fichas de los rivales";
  return choice.mode === "PAIRS" ? "2 parejas (compañero enfrente) · se cuentan las 4 manos · sin pozo" : "4 jugadores · doble seis · sin pozo · dominada +20, cierre +0";
}

/** Titular y detalle del resultado de una mano individual según las reglas. */
export function individualRoundText(result: RoundResult, names: Readonly<Record<string, string>>, rules: RulesId): { readonly headline: string; readonly detail: string } {
  const winner = result.winnerId ? names[result.winnerId] ?? result.winnerId : null;
  const tied = result.tiedPlayerIds.map((id) => names[id] ?? id).join(" y ");
  if (rules === "LATINO") return { headline: roundHeadline(result), detail: winner ? `${winner} gana la ronda` : `Empate entre ${tied}` };
  if (!winner) return { headline: "Tranque empatado · +0 puntos", detail: `Empate en el mínimo entre ${tied}: nadie suma.` };
  const points = result.scoreDeltas[result.winnerId!] ?? 0;
  return { headline: `${result.reason === "DOMINO" ? "Dominada" : "Tranque"} · +${points} puntos`,
    detail: `${winner} ${result.reason === "DOMINO" ? "dominó" : "tiene menos puntos en mano"} y suma las fichas de sus rivales.` };
}
