import type { LegalAction, PlayerView, TileId } from "../../rules/src/index.ts";
import { TILE_BY_ID } from "../../rules/src/index.ts";

export interface BotTurn {
  readonly view: PlayerView;
  readonly legalActions: readonly LegalAction[];
}

/** Estrategia simple: prioriza la ficha de mayor peso; nunca accede al estado completo. */
export function chooseBotAction(turn: BotTurn): LegalAction {
  if (turn.view.currentPlayerId === null || turn.legalActions.length === 0) {
    throw new Error("El bot no tiene un turno legal disponible");
  }
  const ownTiles = new Set<TileId>(turn.view.ownHand ?? []);
  const candidates = turn.legalActions.filter((action) => action.type === "PASS" || (action.tileId && ownTiles.has(action.tileId)));
  if (candidates.length === 0) throw new Error("La vista privada no contiene una acción legal");
  return [...candidates].sort((left, right) => {
    if (left.type === "PASS") return 1;
    if (right.type === "PASS") return -1;
    const a = TILE_BY_ID.get(left.tileId!)!;
    const b = TILE_BY_ID.get(right.tileId!)!;
    return (b.a + b.b) - (a.a + a.b) || left.tileId!.localeCompare(right.tileId!) || (left.side ?? "").localeCompare(right.side ?? "");
  })[0]!;
}
