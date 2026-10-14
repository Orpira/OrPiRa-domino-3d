import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrientedTile, TileId } from "../../../packages/rules/src/index.ts";
import { boardFrameBounds, chainBounds, layoutBoard, layoutDominoChain, TABLE_SAFE_RADIUS, TILE_LENGTH, TILE_WIDTH, type ChainPlacement } from "../src/table-layout.ts";
import { scoreGains } from "../src/modes-presentation.ts";

const t = (id: TileId, left: number, right: number): OrientedTile => ({ id, left, right, playedBy: "P0" });
/** Dos fichas se solapan si sus rectángulos (con su giro) se cortan; se comprueba con los ejes de ambas (SAT). */
function overlap(a: ChainPlacement, b: ChainPlacement): boolean {
  const corners = (p: ChainPlacement) => { const hl = TILE_LENGTH / 2 * p.scale * .98; const hw = TILE_WIDTH / 2 * p.scale * .98; const c = Math.cos(p.rotation); const s = Math.sin(p.rotation);
    return [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]].map(([u, v]) => ({ x: p.x + u! * c + v! * s, z: p.z - u! * s + v! * c })); };
  const ca = corners(a); const cb = corners(b);
  for (const p of [a, b]) for (const axis of [{ x: Math.cos(p.rotation), z: -Math.sin(p.rotation) }, { x: Math.sin(p.rotation), z: Math.cos(p.rotation) }]) {
    const proj = (points: { x: number; z: number }[]) => points.map((point) => point.x * axis.x + point.z * axis.z);
    const pa = proj(ca); const pb = proj(cb); if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}

describe("mesa con spinner (All Fives)", () => {
  const chain = [t("1-3", 1, 3), t("3-4", 3, 4), t("4-4", 4, 4), t("4-6", 4, 6), t("6-2", 6, 2), t("2-5", 2, 5)];
  const up = [t("4-0", 4, 0), t("0-0", 0, 0), t("0-5", 0, 5)]; const down = [t("4-1", 4, 1), t("1-1", 1, 1), t("1-6", 1, 6), t("6-6", 6, 6)];
  for (const [label, width, height] of [["móvil", 384, 380], ["escritorio", 1200, 600]] as const) {
    it(`${label}: el spinner va al centro, los brazos en vertical y nada se solapa`, () => {
      const layout = layoutBoard({ chain, spinnerId: "4-4", up, down }, width, height, "1-3", true);
      const spinner = layout.placements.find((placement) => placement.id === "4-4")!; assert.deepEqual([spinner.x, spinner.z], [0, 0]);
      const ups = layout.placements.filter((placement) => up.some((tile) => tile.id === placement.id)); const downs = layout.placements.filter((placement) => down.some((tile) => tile.id === placement.id));
      assert.ok(ups.every((placement, index) => placement.x === 0 && placement.z < 0 && (index === 0 || placement.z < ups[index - 1]!.z)));
      assert.ok(downs.every((placement, index) => placement.x === 0 && placement.z > 0 && (index === 0 || placement.z > downs[index - 1]!.z)));
      for (let i = 0; i < layout.placements.length; i++) for (let j = i + 1; j < layout.placements.length; j++) assert.equal(overlap(layout.placements[i]!, layout.placements[j]!), false, `${layout.placements[i]!.id} / ${layout.placements[j]!.id}`);
      assert.ok(layout.armGlows.UP!.z < ups.at(-1)!.z && layout.armGlows.DOWN!.z > downs.at(-1)!.z);
      const frame = boardFrameBounds(layout)!; const tiles = chainBounds(layout.placements)!;
      assert.ok(frame.minZ <= tiles.minZ && frame.maxZ >= tiles.maxZ && frame.minX <= tiles.minX && frame.maxX >= tiles.maxX);
    });
  }
  it("brazos muy largos: todo se encoge por igual y queda dentro del tablero sin solaparse", () => {
    const ids = ["0-1", "0-2", "0-3", "0-4", "0-5", "0-6", "1-2", "1-3", "1-4", "1-5", "1-6", "2-3"] as TileId[];
    const long = ids.map((id, index) => t(id, index, index + 1));
    for (const [width, height] of [[384, 380], [1200, 600]] as const) {
      const layout = layoutBoard({ chain: [t("3-4", 3, 4), t("4-4", 4, 4), t("4-6", 4, 6)], spinnerId: "4-4", up: long.slice(0, 6), down: long.slice(6) }, width, height, "3-4", true);
      for (const placement of layout.placements) assert.ok(Math.hypot(placement.x, placement.z) + Math.hypot(TILE_LENGTH, TILE_WIDTH) / 2 * placement.scale <= TABLE_SAFE_RADIUS + 1e-9, placement.id);
      for (let i = 0; i < layout.placements.length; i++) for (let j = i + 1; j < layout.placements.length; j++) assert.equal(overlap(layout.placements[i]!, layout.placements[j]!), false);
    }
  });
  it("brazos cerrados: sin brillos; sin spinner, igual que la cadena de siempre", () => {
    const closed = layoutBoard({ chain: [t("4-4", 4, 4), t("4-6", 4, 6)], spinnerId: "4-4", up: [], down: [] }, 384, 380, "4-4", false); assert.deepEqual(closed.armGlows, {});
    const empty = layoutBoard({ chain: [t("4-4", 4, 4), t("4-6", 4, 6), t("6-1", 6, 1)], spinnerId: "4-4", up: [], down: [] }, 384, 380, "4-4", true);
    assert.ok(empty.armGlows.UP!.z < 0 && empty.armGlows.DOWN!.z > 0);
    const latino = [t("6-6", 6, 6), t("6-3", 6, 3)]; assert.deepEqual(layoutBoard({ chain: latino }, 384, 380).placements, layoutDominoChain(latino, 384, 380));
  });
  it("detecta quién sumó puntos", () => {
    const before = [{ playerId: "A", seat: 0 as const, score: 10 }, { playerId: "B", seat: 1 as const, score: 0 }];
    assert.deepEqual(scoreGains(null, before), []); assert.deepEqual(scoreGains(before, [{ ...before[0]!, score: 25 }, before[1]!]), [{ playerId: "A", points: 15 }]);
  });
});
