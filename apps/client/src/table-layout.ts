import type { OrientedTile, TileId } from "../../../packages/rules/src/index.ts";

export const MAX_CHAIN_TILES = 28;
export const TILE_LENGTH = 1.12;
export const TILE_WIDTH = .58;

export interface TablePoint { readonly x: number; readonly z: number }
export interface ChainPlacement extends TablePoint {
  readonly id: TileId;
  readonly rotation: number;
  readonly tangent: number;
  readonly scale: number;
  readonly distanceFromOpening: number;
}

function armSlots(width: number, height: number, side: "LEFT" | "RIGHT") {
  const scale = Math.max(.68, Math.min(.74, width / 1000, height / 600));
  const points: Array<TablePoint & { tangent: number }> = [];
  const inner = -.86; const outer = -5.42; const rows = [0, 1.45, 2.9, 4.35, 5.8];
  rows.forEach((z, row) => {
    const towardOuter = row % 2 === 0; const tangent = towardOuter ? Math.PI : 0;
    const xs = towardOuter ? [inner, -2, -3.14, -4.28, outer] : [outer, -4.28, -3.14, -2, inner];
    xs.forEach((x) => points.push({ x, z, tangent }));
    if (row < rows.length - 1) points.push({ x: towardOuter ? outer - .58 : inner + .58, z: (z + rows[row + 1]!) / 2, tangent: -Math.PI / 2 });
  });
  return points.map((point) => {
    if (side === "LEFT") return { x: point.x * scale, z: point.z * scale, tangent: point.tangent, scale };
    return { x: -point.x * scale, z: point.z * scale, tangent: Math.atan2(Math.sin(point.tangent), -Math.cos(point.tangent)), scale };
  });
}

export function layoutDominoChain(chain: readonly OrientedTile[], width: number, height: number): readonly ChainPlacement[] {
  if (chain.length > MAX_CHAIN_TILES) throw new Error(`La cadena excede ${MAX_CHAIN_TILES} fichas`);
  if (chain.length === 0) return [];
  const openingIndex = chain.findIndex((tile) => tile.id === "6-6");
  if (openingIndex < 0) throw new Error("La cadena no contiene el 6-6 de apertura");
  const leftSlots = armSlots(width, height, "LEFT"); const rightSlots = armSlots(width, height, "RIGHT");
  const scale = leftSlots[0]!.scale;
  return chain.map((tile, index) => {
    if (index === openingIndex) return { id: tile.id, x: 0, z: 0, tangent: 0, rotation: Math.PI / 2, scale, distanceFromOpening: 0 };
    const isLeft = index < openingIndex;
    const distanceFromOpening = isLeft ? openingIndex - index : index - openingIndex;
    const outward = (isLeft ? leftSlots : rightSlots)[distanceFromOpening - 1]!;
    const tangent = isLeft ? outward.tangent + Math.PI : outward.tangent;
    const rotation = tangent + (tile.left === tile.right ? Math.PI / 2 : 0);
    return { id: tile.id, x: outward.x, z: outward.z, tangent, rotation, scale, distanceFromOpening };
  });
}
