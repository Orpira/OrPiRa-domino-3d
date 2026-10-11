import type { AutomaticMove, SeatControlView, TurnClockView } from "../../../packages/protocol/src/index.ts";

/** Tiempo restante según la hora límite del servidor; el desfase de reloj del dispositivo no influye. */
export function remainingMs(clock: TurnClockView, receivedAt: number, now: number): number | null {
  if (clock.turnDeadline === null) return null;
  return Math.max(0, clock.turnDeadline - (clock.serverNow + Math.max(0, now - receivedAt)));
}
export function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const REASONS: Readonly<Record<AutomaticMove["reason"], string>> = { TIMEOUT: "tiempo agotado", AUTO_MODE: "modo automático", BOT: "bot" };
export function automaticMoveText(move: AutomaticMove, names: Readonly<Record<string, string>>, viewerId: string): string {
  const who = move.playerId === viewerId ? "ti" : names[move.playerId] ?? "un jugador";
  const what = move.action === "PASS" ? "pasó" : `colocó ${move.tileId?.replace("-", "–")}`;
  return `Jugada automática por ${who} (${REASONS[move.reason]}): ${what}.`;
}
/** Último aviso relevante: los bots siempre juegan solos, así que solo se avisa de turnos agotados y modo automático. */
export function latestAutomaticNotice(clock: TurnClockView | null, revision: number): AutomaticMove | null {
  const move = clock?.automaticMoves.filter((entry) => entry.reason !== "BOT").at(-1) ?? null;
  return move && revision - move.revision <= 4 ? move : null;
}
export function seatBadges(seat: SeatControlView | undefined): readonly string[] {
  if (!seat) return []; if (seat.bot) return ["Bot"];
  return [...(seat.automatic ? ["Automático"] : []), ...(!seat.connected ? ["Sin conexión"] : [])];
}
