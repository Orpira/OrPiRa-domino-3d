import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LegalAction, TileId } from "../../../packages/rules/src/index.ts";
import { dragIntent, dropSides, nearestDrop } from "../src/drop-target.ts";

const id = (value: string) => value as TileId;

describe("arrastre de fichas a la mesa", () => {
  it("los destinos legales salen de las acciones del turno", () => {
    const actions: LegalAction[] = [{ type: "PLACE", tileId: id("3-6"), side: "LEFT" }, { type: "PLACE", tileId: id("3-6"), side: "RIGHT" }, { type: "PLACE", tileId: id("1-6"), side: "RIGHT" }];
    assert.deepEqual(dropSides(actions, id("3-6")), ["LEFT", "RIGHT"]);
    assert.deepEqual(dropSides(actions, id("1-6")), ["RIGHT"]);
    assert.deepEqual(dropSides(actions, id("2-2")), []);
    assert.deepEqual(dropSides([{ type: "PLACE", tileId: id("6-6") }], id("6-6")), ["CENTER"]);
    assert.deepEqual(dropSides([{ type: "PASS" }], id("6-6")), []);
  });

  it("un toque no es arrastre; el dedo en horizontal desplaza la mano", () => {
    assert.equal(dragIntent(3, 4, "touch"), "WAIT");
    assert.equal(dragIntent(2, -30, "touch"), "DRAG");
    assert.equal(dragIntent(30, -4, "touch"), "SCROLL");
    assert.equal(dragIntent(30, -4, "mouse"), "DRAG");
  });

  it("con dos extremos cae en el más cercano; con uno, en ese aunque se suelte lejos", () => {
    const anchors = { LEFT: { x: 100, y: 200 }, RIGHT: { x: 400, y: 120 } };
    assert.equal(nearestDrop(["LEFT", "RIGHT"], { x: 150, y: 210 }, anchors), "LEFT");
    assert.equal(nearestDrop(["LEFT", "RIGHT"], { x: 380, y: 300 }, anchors), "RIGHT");
    assert.equal(nearestDrop(["RIGHT"], { x: 100, y: 200 }, anchors), "RIGHT");
    assert.equal(nearestDrop(["CENTER"], { x: 0, y: 0 }, {}), "CENTER");
    assert.equal(nearestDrop([], { x: 0, y: 0 }, anchors), null);
  });
});
