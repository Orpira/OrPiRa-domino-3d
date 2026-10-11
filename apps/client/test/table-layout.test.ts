import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrientedTile, TileId } from "../../../packages/rules/src/index.ts";
import { layoutDominoChain, MAX_CHAIN_TILES } from "../src/table-layout.ts";

function tile(id: TileId, left: number, right: number): OrientedTile { return { id, left, right, playedBy: "P0" }; }
function angleDistance(a: number, b: number) { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }

describe("distribución serpenteante anclada en 6-6", () => {
  it("mantiene 6-6 vertical y exactamente en el centro", () => {
    for (const [width, height] of [[320, 300], [1100, 420]] as const) {
      const placement = layoutDominoChain([tile("6-6", 6, 6)], width, height)[0]!;
      assert.equal(placement.x, 0); assert.equal(placement.z, 0); assert.equal(placement.rotation, Math.PI / 2);
    }
  });

  it("crece hacia la izquierda y derecha sin mover fichas existentes", () => {
    const center = [tile("6-6", 6, 6), tile("5-6", 6, 5)];
    const before = layoutDominoChain(center, 900, 400);
    const right = layoutDominoChain([...center, tile("4-5", 5, 4)], 900, 400);
    const left = layoutDominoChain([tile("3-6", 3, 6), ...center], 900, 400);
    for (const placement of before) {
      assert.deepEqual(right.find((candidate) => candidate.id === placement.id), placement);
      assert.deepEqual(left.find((candidate) => candidate.id === placement.id), placement);
    }
    assert.ok(left[0]!.x < 0); assert.ok(right.at(-1)!.x > 0);
  });

  it("admite las 28 fichas en cualquiera de los brazos y conserva el ancla", () => {
    const ids = Array.from({ length: MAX_CHAIN_TILES - 1 }, (_, index) => `${Math.floor(index / 7)}-${index % 7}` as TileId);
    const allRight = [tile("6-6", 6, 6), ...ids.map((id) => tile(id, 6, 6))];
    const allLeft = [...ids.map((id) => tile(id, 6, 6)), tile("6-6", 6, 6)];
    for (const chain of [allRight, allLeft]) {
      const layout = layoutDominoChain(chain, 1100, 420);
      assert.equal(layout.length, MAX_CHAIN_TILES);
      const opening = layout.find((item) => item.id === "6-6")!;
      assert.equal(opening.x, 0); assert.equal(opening.z, 0);
      assert.equal(new Set(layout.map((item) => `${item.x.toFixed(4)}:${item.z.toFixed(4)}`)).size, MAX_CHAIN_TILES);
      for (let index = 1; index < layout.length; index += 1) {
        const distance = Math.hypot(layout[index]!.x - layout[index - 1]!.x, layout[index]!.z - layout[index - 1]!.z);
        assert.ok(distance > .72 * layout[index]!.scale, `Separación insuficiente en ${index}: ${distance}`);
        assert.ok(distance < 1.35 * layout[index]!.scale, `Cadena dispersa en ${index}: ${distance}`);
      }
    }
  });

  it("atraviesa los dobles respecto al tramo y escala uniformemente en móvil", () => {
    const chain = [tile("6-6", 6, 6), tile("5-6", 6, 5), tile("5-5", 5, 5)];
    const desktop = layoutDominoChain(chain, 1000, 420); const mobile = layoutDominoChain(chain, 320, 300);
    assert.ok(Math.abs(angleDistance(desktop[2]!.rotation, desktop[2]!.tangent) - Math.PI / 2) < 1e-9);
    assert.ok(mobile.every((item) => item.scale === mobile[0]!.scale));
    assert.ok(mobile[0]!.scale < desktop[0]!.scale);
    assert.deepEqual(mobile.map((item) => item.distanceFromOpening), desktop.map((item) => item.distanceFromOpening));
  });
});
