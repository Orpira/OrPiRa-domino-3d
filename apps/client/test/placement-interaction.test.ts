import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LegalAction } from "../../../packages/rules/src/index.ts";
import { currentSelection, placementDecision, SubmissionGate } from "../src/placement-interaction.ts";

describe("decisión de colocación desde acciones legales", () => {
  test("envía directamente una única colocación lateral", () => {
    assert.deepEqual(placementDecision("1-6", [{ type: "PLACE", tileId: "1-6", side: "RIGHT" }]),
      { kind: "SEND", command: { type: "PLACE", tileId: "1-6", side: "RIGHT" } });
  });
  test("pide extremo cuando LEFT y RIGHT son legales", () => {
    const actions: LegalAction[] = [{ type: "PLACE", tileId: "3-4", side: "LEFT" }, { type: "PLACE", tileId: "3-4", side: "RIGHT" }];
    assert.deepEqual(placementDecision("3-4", actions), { kind: "CHOOSE", tileId: "3-4", sides: ["LEFT", "RIGHT"] });
  });
  test("con extremos iguales conserva ambas elecciones autorizadas por el motor", () => {
    const actions: LegalAction[] = [{ type: "PLACE", tileId: "2-5", side: "LEFT" }, { type: "PLACE", tileId: "2-5", side: "RIGHT" }];
    assert.equal(placementDecision("2-5", actions).kind, "CHOOSE");
  });
  test("la apertura 6-6 se envía directamente sin extremo", () => {
    assert.deepEqual(placementDecision("6-6", [{ type: "PLACE", tileId: "6-6" }]),
      { kind: "SEND", command: { type: "PLACE", tileId: "6-6" } });
  });
  test("una ficha sin acción legal no produce comando", () => {
    assert.deepEqual(placementDecision("0-0", [{ type: "PASS" }]), { kind: "NONE" });
  });
  test("el bloqueo de envío rechaza un segundo toque simultáneo", () => {
    const gate = new SubmissionGate(); assert.equal(gate.tryLock(), true); assert.equal(gate.tryLock(), false);
    gate.release(); assert.equal(gate.tryLock(), true);
  });
  test("una revisión nueva invalida la elección de extremo", () => {
    const selection = { tileId: "3-4" as const, revision: 12 };
    assert.equal(currentSelection(selection, 12), "3-4"); assert.equal(currentSelection(selection, 13), null);
  });
});
