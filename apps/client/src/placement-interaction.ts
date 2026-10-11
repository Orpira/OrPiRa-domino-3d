import type { ClientCommand } from "../../../packages/protocol/src/index.ts";
import type { LegalAction, Side, TileId } from "../../../packages/rules/src/index.ts";

export type PlacementDecision =
  | { readonly kind: "NONE" }
  | { readonly kind: "SEND"; readonly command: ClientCommand }
  | { readonly kind: "CHOOSE"; readonly tileId: TileId; readonly sides: readonly Side[] };
export interface PlacementSelection { readonly tileId: TileId; readonly revision: number }

export function currentSelection(selection: PlacementSelection | null, revision: number): TileId | null {
  return selection?.revision === revision ? selection.tileId : null;
}

export function placementDecision(tileId: TileId, actions: readonly LegalAction[]): PlacementDecision {
  const placements = actions.filter((action) => action.type === "PLACE" && action.tileId === tileId);
  if (placements.length === 0) return { kind: "NONE" };
  const sides = [...new Set(placements.map((action) => action.side).filter((side): side is Side => side !== undefined))];
  if (sides.length > 1) return { kind: "CHOOSE", tileId, sides };
  const side = sides[0];
  return { kind: "SEND", command: { type: "PLACE", tileId, ...(side ? { side } : {}) } };
}

export class SubmissionGate {
  private busy = false;
  tryLock(): boolean { if (this.busy) return false; this.busy = true; return true; }
  release(): void { this.busy = false; }
}
