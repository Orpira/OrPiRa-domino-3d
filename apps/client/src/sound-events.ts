import type { MatchResult, OrientedTile, Phase, RoundResult } from "../../../packages/rules/src/index.ts";

/** Sonidos del juego. Las jugadas que dan ventaja tienen el suyo: doble, pase forzado del rival y capicúa. */
export type SoundCue = "shuffle" | "place" | "double" | "pass" | "capicua" | "roundWin" | "roundWinBlocked" | "roundEnd" | "matchWin" | "matchEnd";

/** Lo que el cliente sabe de la partida, igual en local (GameState) y online (PlayerView). */
export interface SoundSnapshot {
  readonly roundNumber: number; readonly phase: Phase; readonly chain: readonly OrientedTile[];
  readonly leftEnd: number | null; readonly rightEnd: number | null; readonly consecutivePasses: number;
  readonly roundResult: RoundResult | null; readonly matchResult: MatchResult | null;
}

/** Más fichas nuevas que esto entre dos estados es una resincronización (recarga, reconexión): no suena nada. */
const MAX_TILES_PER_UPDATE = 3;

/** Capicúa: la ficha que cierra la ronda encajaba en los dos extremos, que eran distintos. */
export function isCapicua(before: Pick<SoundSnapshot, "leftEnd" | "rightEnd">, tile: OrientedTile): boolean {
  const { leftEnd, rightEnd } = before;
  if (leftEnd === null || rightEnd === null || leftEnd === rightEnd) return false;
  return (tile.left === leftEnd && tile.right === rightEnd) || (tile.left === rightEnd && tile.right === leftEnd);
}

/**
 * Sonidos que corresponden al paso de un estado al siguiente.
 * `viewerId` es el jugador de este dispositivo; sin él (relevo entre personas) toda victoria suena como propia.
 */
export function soundCues(previous: SoundSnapshot | null, next: SoundSnapshot, viewerId?: string): SoundCue[] {
  if (!previous) return [];
  if (next.roundNumber !== previous.roundNumber) return next.chain.length === 0 ? ["shuffle"] : [];
  const known = new Set(previous.chain.map((tile) => tile.id)); const added = next.chain.filter((tile) => !known.has(tile.id));
  if (added.length > MAX_TILES_PER_UPDATE) return [];
  const cues: SoundCue[] = [];
  if (added.length) { cues.push("place"); if (added.some((tile) => tile.left === tile.right)) cues.push("double"); }
  if (next.consecutivePasses > previous.consecutivePasses) cues.push("pass");
  if (previous.phase === "ROUND_ACTIVE" && next.phase !== "ROUND_ACTIVE" && next.roundResult) {
    const result = next.roundResult;
    if (result.reason === "DOMINO" && added.length === 1 && isCapicua(previous, added[0]!)) cues.push("capicua");
    // En parejas, la victoria del compañero también suena como propia.
    const mine = (playerId: string | null, team?: readonly string[]) => playerId !== null &&
      (viewerId === undefined || (team ? team.includes(viewerId) : playerId === viewerId));
    if (next.phase === "MATCH_ENDED" && next.matchResult) cues.push(mine(next.matchResult.championId, next.matchResult.championTeam) ? "matchWin" : "matchEnd");
    else if (mine(result.winnerId, result.winningTeam)) cues.push(result.reason === "DOMINO" ? "roundWin" : "roundWinBlocked");
    else cues.push("roundEnd");
  }
  return cues;
}
