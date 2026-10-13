import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { choiceLabel, effectiveTarget, individualRoundText, normalizeChoice } from "../src/modes-presentation.ts";

const names = { P0: "Ana", P1: "Beto", P2: "Cora", P3: "Dani" };
const base = { handPipTotals: { P0: 0, P1: 10, P2: 5, P3: 8 }, tiedPlayerIds: [] as string[] };

describe("textos de modalidades", () => {
  it("normaliza la elección: con robo siempre individual y el objetivo por defecto no se envía", () => {
    assert.deepEqual(normalizeChoice({ rules: "DRAW", mode: "PAIRS" }), { rules: "DRAW", mode: "INDIVIDUAL" });
    assert.deepEqual(normalizeChoice({ rules: "LATINO", mode: "PAIRS", targetScore: 200 }), { rules: "LATINO", mode: "PAIRS" });
    assert.deepEqual(normalizeChoice({ rules: "LATINO", mode: "INDIVIDUAL", targetScore: 150 }), { rules: "LATINO", mode: "INDIVIDUAL", targetScore: 150 });
    assert.equal(effectiveTarget({ rules: "LATINO", mode: "PAIRS" }), 200);
  });
  it("etiquetas de mesa", () => {
    assert.equal(choiceLabel({ rules: "LATINO", mode: "PAIRS" }), "Latino · parejas a 200");
    assert.equal(choiceLabel({ rules: "DRAW", mode: "INDIVIDUAL", targetScore: 150 }), "Con robo · a 150");
  });
  it("resultado de mano con robo: dominada, tranque y empate", () => {
    const domino = individualRoundText({ ...base, reason: "DOMINO", winnerId: "P0", scoreDeltas: { P0: 23, P1: 0, P2: 0, P3: 0 } }, names, "DRAW");
    assert.equal(domino.headline, "Dominada · +23 puntos"); assert.match(domino.detail, /^Ana dominó/);
    const blocked = individualRoundText({ ...base, reason: "BLOCKED", winnerId: "P2", scoreDeltas: { P0: 0, P1: 0, P2: 18, P3: 0 } }, names, "DRAW");
    assert.equal(blocked.headline, "Tranque · +18 puntos");
    const tie = individualRoundText({ ...base, reason: "BLOCKED", winnerId: null, tiedPlayerIds: ["P1", "P3"], scoreDeltas: { P0: 0, P1: 0, P2: 0, P3: 0 } }, names, "DRAW");
    assert.match(tie.detail, /Beto y Dani/);
  });
  it("Latino conserva sus textos", () => {
    const latino = individualRoundText({ ...base, reason: "DOMINO", winnerId: "P1", scoreDeltas: { P0: 0, P1: 20, P2: 0, P3: 0 } }, names, "LATINO");
    assert.deepEqual(latino, { headline: "Ganador de ronda por dominada · +20 puntos", detail: "Beto gana la ronda" });
  });
});
