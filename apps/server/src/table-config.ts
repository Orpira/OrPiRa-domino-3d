import { TARGET_OPTIONS, type GameMode, type RulesId, type TargetScore } from "../../../packages/rules/src/index.ts";

/** Configuración de una mesa: formato, reglas y objetivo (ausente = el de la modalidad: 100 individual, 200 parejas). */
export interface TableConfig { readonly mode: GameMode; readonly rules: RulesId; readonly targetScore?: TargetScore }

/** Valida lo que pide el cliente. Con robo solo existe en individual. Errores: INVALID_MODE, INVALID_RULES, INVALID_TARGET. */
export function tableConfig(input: { readonly mode?: unknown; readonly rules?: unknown; readonly targetScore?: unknown }): TableConfig {
  const mode = input.mode ?? "INDIVIDUAL"; const rules = input.rules ?? "LATINO";
  if (mode !== "INDIVIDUAL" && mode !== "PAIRS") throw new Error("INVALID_MODE");
  if (rules !== "LATINO" && rules !== "DRAW") throw new Error("INVALID_RULES");
  if (rules !== "LATINO" && mode !== "INDIVIDUAL") throw new Error("INVALID_MODE");
  if (input.targetScore !== undefined && !TARGET_OPTIONS.includes(input.targetScore as TargetScore)) throw new Error("INVALID_TARGET");
  return { mode, rules, ...(input.targetScore !== undefined ? { targetScore: input.targetScore as TargetScore } : {}) };
}
