import type { LegalAction, Side, TileId } from "../../../packages/rules/src/index.ts";

/** Dónde puede soltarse una ficha: un extremo de la cadena o, en la apertura, el centro de la mesa. */
export type DropSide = Side | "CENTER";
export interface ScreenXY { readonly x: number; readonly y: number }

/** Destinos legales de una ficha según las acciones del turno (vacío si la ficha no se puede jugar). */
export function dropSides(actions: readonly LegalAction[], tileId: TileId): readonly DropSide[] {
  const sides: DropSide[] = [];
  for (const action of actions) {
    if (action.type !== "PLACE" || action.tileId !== tileId) continue;
    const side: DropSide = action.side ?? "CENTER"; if (!sides.includes(side)) sides.push(side);
  }
  return sides;
}

/** Píxeles que debe recorrer el dedo antes de que un toque se convierta en arrastre. */
export const DRAG_THRESHOLD_PX = 8;

/**
 * Decide si un movimiento ya es un arrastre. Con el dedo, un gesto sobre todo horizontal se deja al navegador
 * para desplazar la mano; el ratón puede arrastrar en cualquier dirección.
 */
export function dragIntent(dx: number, dy: number, pointerType: string): "WAIT" | "DRAG" | "SCROLL" {
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return "WAIT";
  if (pointerType === "mouse") return "DRAG";
  return Math.abs(dy) >= Math.abs(dx) * .75 ? "DRAG" : "SCROLL";
}

/**
 * Extremo en el que cae la ficha soltada: si solo hay uno legal, ese; si hay dos, el más cercano al punto.
 * Devuelve null cuando no hay destino legal.
 */
export function nearestDrop(sides: readonly DropSide[], point: ScreenXY, anchors: Partial<Record<DropSide, ScreenXY>>): DropSide | null {
  if (sides.length <= 1) return sides[0] ?? null;
  let best: DropSide | null = null; let bestDistance = Infinity;
  for (const side of sides) {
    const anchor = anchors[side]; if (!anchor) continue;
    const distance = Math.hypot(anchor.x - point.x, anchor.y - point.y);
    if (distance < bestDistance) { best = side; bestDistance = distance; }
  }
  return best ?? sides[0]!;
}
