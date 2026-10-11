import type { Tile, TileId } from "./types.ts";

export function tileId(a: number, b: number): TileId {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return `${low}-${high}` as TileId;
}

export function createDoubleSixSet(): readonly Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) tiles.push({ a, b, id: tileId(a, b) });
  }
  return tiles;
}

export const DOUBLE_SIX_SET = createDoubleSixSet();
export const TILE_BY_ID = new Map(DOUBLE_SIX_SET.map((tile) => [tile.id, tile]));

export function pipTotal(ids: readonly TileId[]): number {
  return ids.reduce((sum, id) => {
    const tile = TILE_BY_ID.get(id);
    if (!tile) throw new Error(`Unknown tile ${id}`);
    return sum + tile.a + tile.b;
  }, 0);
}

export type RandomSource = () => number;
export function shuffledDeal(random: RandomSource = Math.random): readonly (readonly TileId[])[] {
  const ids = DOUBLE_SIX_SET.map((tile) => tile.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  }
  return [ids.slice(0, 7), ids.slice(7, 14), ids.slice(14, 21), ids.slice(21, 28)];
}
