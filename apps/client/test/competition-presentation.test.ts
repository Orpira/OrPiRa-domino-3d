import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CompetitionMemberView, SimulatedConditions, SimulatedMovement } from "../../../packages/protocol/src/index.ts";
import { acceptanceSummary, competitionErrorMessage, competitionRecords, conditionsBreakdown, economicOutcome, formatCop, formatSignedCop } from "../src/competition-presentation.ts";

const conditions: SimulatedConditions = { currencyLabel: "COP simulados · sin valor monetario", initialCredit: 100000, entry: 5000, playerCount: 4, commissionPercent: 0, prize: 20000, targetScore: 100, expiresAfterMinutes: 15, version: 1 };
const settlement = { championIdentityId: "A", matchId: "M", settledAt: 1, entry: 5000, grossPrize: 20000, commission: 0, netPrize: 20000 };
let sequence = 0;
const movement = (kind: SimulatedMovement["kind"], availableDelta: number, reservedDelta: number, competitionId: string | null = "C1"): SimulatedMovement =>
  ({ movementId: `m${sequence}`, identityId: "A", competitionId, kind, availableDelta, reservedDelta, createdAt: 1_000 + sequence++ });

describe("presentación de la competición simulada", () => {
  test("formatea importes en COP con separador de miles colombiano", () => {
    assert.equal(formatCop(100000), "100.000 COP"); assert.equal(formatSignedCop(15000), "+15.000 COP"); assert.equal(formatSignedCop(-5000), "−5.000 COP");
  });

  test("desglosa cuatro entradas, bolsa, comisión y premio sin alterar los importes del servidor", () => {
    const breakdown = conditionsBreakdown(conditions);
    assert.deepEqual(breakdown, { entries: [5000, 5000, 5000, 5000], pool: 20000, commissionAmount: 0, prize: 20000, consistent: true });
    assert.equal(conditionsBreakdown({ ...conditions, prize: 25000 }).consistent, false);
  });

  test("distingue premio recibido de resultado neto y no inventa liquidaciones", () => {
    assert.equal(economicOutcome(null, "A"), null);
    assert.deepEqual(economicOutcome(settlement, "A"), { isChampion: true, entry: 5000, grossPrize: 20000, commission: 0, prizeReceived: 20000, net: 15000 });
    assert.deepEqual(economicOutcome(settlement, "B"), { isChampion: false, entry: 5000, grossPrize: 20000, commission: 0, prizeReceived: 0, net: -5000 });
  });

  test("resume aceptaciones y plazas libres", () => {
    const member = (displayName: string, accepted: boolean): CompetitionMemberView => ({ identityId: displayName, displayName, seat: 0, accepted, annulmentAccepted: false, connected: true });
    assert.deepEqual(acceptanceSummary([member("Ana", true), member("Beto", false), member("Cora", false)], 4), { accepted: 1, joined: 3, missingSeats: 1, pendingNames: ["Beto", "Cora"] });
  });

  test("agrupa movimientos por competición con estado y resultado neto", () => {
    const records = competitionRecords([
      movement("INITIAL_CREDIT", 100000, 0, null),
      movement("ENTRY_RESERVED", -5000, 5000, "C1"), movement("ENTRY_RELEASED", 5000, -5000, "C1"),
      movement("ENTRY_RESERVED", -5000, 5000, "C2"), movement("ENTRY_CONSUMED", 0, -5000, "C2"), movement("PRIZE_AWARDED", 20000, 0, "C2"),
      movement("ENTRY_RESERVED", -5000, 5000, "C3"), movement("ENTRY_CONSUMED", 0, -5000, "C3"),
      movement("ENTRY_RESERVED", -5000, 5000, "C4"),
    ]);
    assert.deepEqual(records.map(({ competitionId, state, net }) => ({ competitionId, state, net })), [
      { competitionId: "C4", state: "RESERVED", net: null }, { competitionId: "C3", state: "PLAYED", net: -5000 },
      { competitionId: "C2", state: "WON", net: 15000 }, { competitionId: "C1", state: "RETURNED", net: 0 },
    ]);
  });

  test("traduce errores del servidor sin ocultar códigos desconocidos", () => {
    assert.match(competitionErrorMessage("INSUFFICIENT_BALANCE"), /insuficiente/); assert.match(competitionErrorMessage("COMPETITION_FULL"), /completa/);
    assert.match(competitionErrorMessage("RARE"), /RARE/);
  });
});
