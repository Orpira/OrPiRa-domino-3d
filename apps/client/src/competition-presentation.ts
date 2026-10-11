import type { CompetitionMemberView, CompetitionView, SimulatedConditions, SimulatedMovement, SimulatedMovementKind } from "../../../packages/protocol/src/index.ts";

export const SIMULATED_NOTICE = "COP simulados · sin valor monetario";
const number = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function formatCop(amount: number): string { return `${number.format(amount)} COP`; }
export function formatSignedCop(amount: number): string { return amount === 0 ? formatCop(0) : `${amount > 0 ? "+" : "−"}${formatCop(Math.abs(amount))}`; }

export interface ConditionsBreakdown {
  readonly entries: readonly number[]; readonly pool: number; readonly commissionAmount: number; readonly prize: number; readonly consistent: boolean;
}
// Solo reorganiza importes del servidor; si no cuadran, la interfaz bloquea la participación.
export function conditionsBreakdown(conditions: SimulatedConditions): ConditionsBreakdown {
  const entries = Array.from({ length: conditions.playerCount }, () => conditions.entry);
  const pool = entries.reduce((total, entry) => total + entry, 0); const commissionAmount = Math.round(pool * conditions.commissionPercent / 100);
  return { entries, pool, commissionAmount, prize: conditions.prize, consistent: pool - commissionAmount === conditions.prize && conditions.entry > 0 };
}

// Premio bruto y comisión son de la mesa; premio recibido y neto son individuales.
export interface EconomicOutcome {
  readonly isChampion: boolean; readonly entry: number; readonly grossPrize: number; readonly commission: number; readonly prizeReceived: number; readonly net: number;
}
export function economicOutcome(settlement: CompetitionView["settlement"], viewerId: string): EconomicOutcome | null {
  if (!settlement) return null; const isChampion = settlement.championIdentityId === viewerId;
  const prizeReceived = isChampion ? settlement.netPrize : 0;
  return { isChampion, entry: settlement.entry, grossPrize: settlement.grossPrize, commission: settlement.commission, prizeReceived, net: prizeReceived - settlement.entry };
}

export interface AcceptanceSummary { readonly accepted: number; readonly joined: number; readonly missingSeats: number; readonly pendingNames: readonly string[] }
export function acceptanceSummary(members: readonly CompetitionMemberView[], playerCount: number): AcceptanceSummary {
  return { accepted: members.filter((member) => member.accepted).length, joined: members.length, missingSeats: Math.max(0, playerCount - members.length),
    pendingNames: members.filter((member) => !member.accepted).map((member) => member.displayName) };
}

export const MOVEMENT_LABELS: Readonly<Record<SimulatedMovementKind, { readonly concept: string; readonly category: string }>> = {
  INITIAL_CREDIT: { concept: "Crédito inicial de prueba", category: "Disponible" },
  ENTRY_RESERVED: { concept: "Entrada reservada", category: "Reservado" },
  ENTRY_RELEASED: { concept: "Entrada devuelta", category: "Devolución" },
  ENTRY_CONSUMED: { concept: "Entrada aplicada a la bolsa", category: "Reservado" },
  PRIZE_AWARDED: { concept: "Premio al campeón", category: "Premio" },
};

export type CompetitionRecordState = "RESERVED" | "RETURNED" | "PLAYED" | "WON";
export interface CompetitionRecord { readonly competitionId: string; readonly startedAt: number; readonly updatedAt: number; readonly state: CompetitionRecordState; readonly net: number | null }
export const RECORD_LABELS: Readonly<Record<CompetitionRecordState, string>> = {
  RESERVED: "Entrada reservada · en curso", RETURNED: "Cancelada · entrada devuelta", PLAYED: "Jugada · sin premio", WON: "Campeón · premio recibido",
};
export function competitionRecords(movements: readonly SimulatedMovement[]): readonly CompetitionRecord[] {
  const groups = new Map<string, SimulatedMovement[]>();
  for (const movement of movements) if (movement.competitionId) groups.set(movement.competitionId, [...(groups.get(movement.competitionId) ?? []), movement]);
  return [...groups.entries()].map(([competitionId, entries]) => {
    const count = (kind: SimulatedMovementKind) => entries.filter((entry) => entry.kind === kind).length;
    const open = count("ENTRY_RESERVED") > count("ENTRY_RELEASED") + count("ENTRY_CONSUMED");
    const state: CompetitionRecordState = count("PRIZE_AWARDED") ? "WON" : count("ENTRY_CONSUMED") ? "PLAYED" : open ? "RESERVED" : "RETURNED";
    const net = state === "RESERVED" ? null : entries.reduce((total, entry) => total + entry.availableDelta + entry.reservedDelta, 0);
    const times = entries.map((entry) => entry.createdAt);
    return { competitionId, startedAt: Math.min(...times), updatedAt: Math.max(...times), state, net };
  }).sort((left, right) => right.updatedAt - left.updatedAt);
}

const ERRORS: Readonly<Record<string, string>> = {
  NETWORK: "Sin conexión con el servidor. Comprueba la red y vuelve a intentarlo.",
  NOT_AVAILABLE: "El servidor conectado todavía no ofrece la competición de prueba.",
  UNAUTHENTICATED: "Esta cuenta de prueba no existe en el servidor actual. Crea una nueva.",
  INVALID_NAME: "Escribe un nombre visible de 1 a 24 caracteres.",
  INSUFFICIENT_BALANCE: "Saldo simulado insuficiente para reservar la entrada.",
  COMPETITION_FULL: "La sala está completa: ya hay cuatro jugadores.",
  COMPETITION_NOT_FOUND: "No existe ninguna sala con ese código.",
  COMPETITION_NOT_JOINABLE: "La sala ya no admite jugadores: comenzó, terminó o fue cancelada.",
  COMPETITION_NOT_WAITING: "La sala ya no está en espera.",
  COMPETITION_ALREADY_STARTED: "La competición ya comenzó; solo puede anularse con el acuerdo de los cuatro.",
  COMPETITION_NOT_PLAYING: "La competición no está en juego.",
  CONDITIONS_CHANGED: "Las condiciones cambiaron. Revísalas de nuevo antes de aceptar.",
  NOT_A_PARTICIPANT: "Ya no formas parte de esta sala.",
  RATE_LIMITED: "Demasiadas peticiones desde esta conexión. Espera un momento y vuelve a intentarlo.",
  IDENTITY_LIMIT_REACHED: "Se alcanzó el máximo de cuentas de prueba creadas desde esta conexión. Recupera una existente con su código.",
};
export function competitionErrorMessage(code: string): string { return ERRORS[code] ?? `El servidor rechazó la operación (${code}).`; }

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}
