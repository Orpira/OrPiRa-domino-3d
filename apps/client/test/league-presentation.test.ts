import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LeagueRankView } from "../../../packages/protocol/src/index.ts";
import { awardBreakdown, daysLeftText, formatLeaguePoints, rankPips, rankProgress, RANK_NAMES } from "../src/league-presentation.ts";

const thresholds = [0, 40, 120, 250, 450, 700, 1000];
const ranks: LeagueRankView[] = thresholds.map((minPoints, pips) => ({ id: `DOUBLE_${pips}` as LeagueRankView["id"], name: "", pips, minPoints }));

describe("presentación de la liga", () => {
  test("rangos, progreso y textos", () => {
    assert.equal(RANK_NAMES.DOUBLE_0, "Doble blanca"); assert.equal(RANK_NAMES.DOUBLE_6, "Doble seis"); assert.equal(rankPips("DOUBLE_4"), 4);
    assert.equal(rankProgress(80, "DOUBLE_1", ranks), 0.5); assert.equal(rankProgress(0, "DOUBLE_0", ranks), 0); assert.equal(rankProgress(5000, "DOUBLE_6", ranks), 1);
    assert.equal(formatLeaguePoints(1), "1 punto"); assert.equal(formatLeaguePoints(1200), "1.200 puntos");
    assert.equal(daysLeftText(1), "Queda 1 día"); assert.equal(daysLeftText(12), "Quedan 12 días");
  });

  test("desglosa la concesión del servidor sin recalcularla", () => {
    const award = { matchId: "m", seasonId: "2026-10", position: 2, basePoints: 20, humans: 3, automatic: false, points: 15, previousRank: "DOUBLE_0", newRank: "DOUBLE_0", promoted: false, awardedAt: 0 } as const;
    assert.deepEqual(awardBreakdown(award).map((line) => line.value), ["20 base", "× 3/4, redondeo hacia abajo", "+15"]);
    assert.equal(awardBreakdown({ ...award, automatic: true, points: 0 }).some((line) => line.label.includes("modo automático")), true);
  });
});
