import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrientedTile, TileId } from "../../../packages/rules/src/index.ts";
import { chainBounds, COMPACT_ASPECT, endAnchors, endGlows, frameBounds, layoutDominoChain, MAX_CHAIN_TILES, MIN_FRAME_DEPTH, MIN_FRAME_WIDTH, seatSide, TILE_LENGTH } from "../src/table-layout.ts";

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

  it("en pantallas casi cuadradas usa filas de tres y reparte los brazos arriba y abajo", () => {
    const width = 360; const height = 330; assert.ok(width / height < COMPACT_ASPECT);
    const ids = Array.from({ length: MAX_CHAIN_TILES - 1 }, (_, index) => `${Math.floor(index / 7)}-${index % 7}` as TileId);
    const half = Math.floor(ids.length / 2);
    const chain = [...ids.slice(0, half).map((id) => tile(id, 6, 6)), tile("6-6", 6, 6), ...ids.slice(half).map((id) => tile(id, 6, 6))];
    for (const candidate of [chain, [tile("6-6", 6, 6), ...ids.map((id) => tile(id, 6, 6))]]) {
      const layout = layoutDominoChain(candidate, width, height); const scale = layout[0]!.scale;
      const opening = layout.findIndex((item) => item.id === "6-6");
      assert.equal(layout[opening]!.x, 0); assert.equal(layout[opening]!.z, 0);
      layout.forEach((item, index) => {
        if (index < opening) assert.ok(item.z <= 1e-9, "el brazo izquierdo sube"); if (index > opening) assert.ok(item.z >= -1e-9, "el brazo derecho baja");
        assert.ok(Math.abs(item.x) <= (3.14 + .58) * scale + 1e-9, "filas de tres fichas");
      });
      for (let a = 0; a < layout.length; a += 1) for (let b = a + 2; b < layout.length; b += 1) {
        const distance = Math.hypot(layout[a]!.x - layout[b]!.x, layout[a]!.z - layout[b]!.z);
        assert.ok(distance > .5 * TILE_LENGTH * scale, `Fichas ${a} y ${b} superpuestas: ${distance}`);
      }
      for (let index = 1; index < layout.length; index += 1) {
        const distance = Math.hypot(layout[index]!.x - layout[index - 1]!.x, layout[index]!.z - layout[index - 1]!.z);
        assert.ok(distance > .72 * scale && distance < 1.35 * scale, `Separación anómala en ${index}: ${distance}`);
      }
    }
  });

  it("encuadra las fichas con un tamaño mínimo y reserva el hueco de cada extremo", () => {
    const single = layoutDominoChain([tile("6-6", 6, 6)], 360, 330);
    const tiles = chainBounds(single)!; const frame = frameBounds(single)!;
    assert.ok(frame.maxX - frame.minX >= MIN_FRAME_WIDTH - 1e-9 && frame.maxZ - frame.minZ >= MIN_FRAME_DEPTH - 1e-9);
    assert.ok(frame.minX <= tiles.minX && frame.maxX >= tiles.maxX && frame.minZ <= tiles.minZ && frame.maxZ >= tiles.maxZ);
    assert.equal(chainBounds([]), null); assert.equal(frameBounds([]), null); assert.equal(endAnchors([]), null);
    const row = layoutDominoChain([tile("3-6", 3, 6), tile("6-6", 6, 6), tile("5-6", 6, 5)], 1000, 420);
    const anchors = endAnchors(row)!;
    assert.ok(anchors.left.x < row[0]!.x - TILE_LENGTH * row[0]!.scale, "el botón izquierdo queda fuera de la ficha");
    assert.ok(anchors.right.x > row[2]!.x + TILE_LENGTH * row[2]!.scale, "el botón derecho queda fuera de la ficha");
    assert.ok(Math.abs(anchors.left.z) < 1e-9 && Math.abs(anchors.right.z) < 1e-9);
  });

  it("con salida libre (parejas), la cadena se centra en la ficha de salida, a lo largo si no es doble", () => {
    const chain = [tile("2-4", 2, 4), tile("4-5", 4, 5), tile("5-1", 5, 1)];
    assert.throws(() => layoutDominoChain(chain, 1000, 420), /6-6/);
    const layout = layoutDominoChain(chain, 1000, 420, "4-5" as TileId);
    assert.equal(layout[1]!.x, 0); assert.equal(layout[1]!.z, 0); assert.equal(layout[1]!.rotation, 0);
    assert.ok(layout[0]!.x < 0 && layout[2]!.x > 0);
    const glows = endGlows(layout)!; assert.ok(glows.left.x < layout[0]!.x && glows.right.x > layout[2]!.x);
  });

  it("el brillo se posa sobre el borde abierto de cada ficha extrema", () => {
    assert.equal(endGlows([]), null);
    const opening = endGlows(layoutDominoChain([tile("6-6", 6, 6)], 1000, 420))!;
    assert.ok(opening.left.x < 0 && opening.right.x > 0, "con solo el 6–6, un brillo a cada costado");
    assert.ok(Math.abs(opening.right.x) < TILE_LENGTH / 2, "en el doble cruzado, a media anchura del centro");
    const row = layoutDominoChain([tile("3-6", 3, 6), tile("6-6", 6, 6), tile("5-6", 6, 5)], 1000, 420); const glows = endGlows(row)!;
    assert.ok(Math.abs(glows.left.x - (row[0]!.x - TILE_LENGTH / 2 * row[0]!.scale)) < 1e-9, "borde exterior de la ficha izquierda");
    assert.ok(Math.abs(glows.right.x - (row[2]!.x + TILE_LENGTH / 2 * row[2]!.scale)) < 1e-9, "borde exterior de la ficha derecha");
  });

  it("los extremos de un giro apuntan en la dirección real del brazo", () => {
    const ids = Array.from({ length: 6 }, (_, index) => `0-${index}` as TileId);
    const layout = layoutDominoChain([tile("6-6", 6, 6), ...ids.map((id) => tile(id, 6, 5))], 1000, 420);
    const turn = layout.at(-1)!; const anchors = endAnchors(layout)!;
    assert.ok(anchors.right.z > turn.z, "tras el primer giro el brazo derecho baja hacia el jugador");
  });

  it("cada ficha llega desde el lado de quien la jugó, en sentido antihorario", () => {
    const players = [{ playerId: "A", seat: 0 }, { playerId: "B", seat: 1 }, { playerId: "C", seat: 2 }, { playerId: "D", seat: 3 }];
    // El turno pasa del asiento s al s − 1: tras A (0) juega D (3), luego C (2) y luego B (1).
    assert.equal(seatSide(players, "A", "A"), "BOTTOM"); assert.equal(seatSide(players, "A", "D"), "RIGHT");
    assert.equal(seatSide(players, "A", "C"), "TOP"); assert.equal(seatSide(players, "A", "B"), "LEFT");
    assert.equal(seatSide(players, "C", "B"), "RIGHT"); assert.equal(seatSide(players, "C", "D"), "LEFT");
    assert.equal(seatSide(players, undefined, "B"), "BOTTOM"); assert.equal(seatSide(players, "A", "desconocido"), "BOTTOM");
  });
});
