import type { LegalAction, PlayerView, TileId } from "../../rules/src/index.ts";
import { fivesPoints, placeOnBoard, TILE_BY_ID } from "../../rules/src/index.ts";

export interface BotTurn {
  readonly view: PlayerView;
  readonly legalActions: readonly LegalAction[];
}

/**
 * Estrategia simple: prioriza la ficha de mayor peso (en All Fives, antes la jugada que más puntos da); nunca accede al estado completo.
 * `tieBreak` elige entre las jugadas de igual peso máximo (p. ej. con una semilla); sin él se usa la primera.
 */
export function chooseBotAction(turn: BotTurn, tieBreak?: (count: number) => number): LegalAction {
  if (turn.view.currentPlayerId === null || turn.legalActions.length === 0) {
    throw new Error("El bot no tiene un turno legal disponible");
  }
  const ownTiles = new Set<TileId>(turn.view.ownHand ?? []);
  const candidates = turn.legalActions.filter((action) => action.type !== "PLACE" || (action.tileId && ownTiles.has(action.tileId)));
  if (candidates.length === 0) throw new Error("La vista privada no contiene una acción legal");
  const fives = turn.view.rules === "ALL_FIVES";
  const weight = (action: LegalAction) => {
    if (action.type !== "PLACE") return -1; const tile = TILE_BY_ID.get(action.tileId!)!;
    const scored = fives ? fivesPoints({ ...turn.view, ...placeOnBoard(turn.view, action.tileId!, action.side, turn.view.currentPlayerId!, true).board }) : 0;
    return scored * 100 + tile.a + tile.b;
  };
  const sorted = [...candidates].sort((left, right) =>
    weight(right) - weight(left) || (left.tileId ?? "").localeCompare(right.tileId ?? "") || (left.side ?? "").localeCompare(right.side ?? ""));
  const best = sorted.filter((action) => weight(action) === weight(sorted[0]!));
  if (!tieBreak || best.length === 1) return best[0]!;
  return best[Math.abs(Math.trunc(tieBreak(best.length))) % best.length]!;
}
