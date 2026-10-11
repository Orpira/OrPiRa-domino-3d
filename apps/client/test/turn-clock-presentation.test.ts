import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TurnClockView } from "../../../packages/protocol/src/index.ts";
import { automaticMoveText, formatCountdown, latestAutomaticNotice, remainingMs, seatBadges } from "../src/turn-clock-presentation.ts";

const clock: TurnClockView = { turnDeadline: 130_000, deadlineKind: "TURN", serverNow: 100_000, turnSeconds: 30, seats: [], automaticMoves: [
  { revision: 8, playerId: "B", reason: "BOT", action: "PASS", at: 1 }, { revision: 9, playerId: "A", reason: "TIMEOUT", action: "PLACE", tileId: "6-4", side: "LEFT", at: 2 },
] };

describe("presentación del reloj de turno", () => {
  test("cuenta atrás desde la hora límite del servidor, sin depender del reloj del dispositivo", () => {
    assert.equal(remainingMs(clock, 5_000_000, 5_000_000), 30_000); assert.equal(remainingMs(clock, 5_000_000, 5_012_500), 17_500);
    assert.equal(remainingMs(clock, 5_000_000, 5_090_000), 0); assert.equal(remainingMs({ ...clock, turnDeadline: null }, 0, 0), null);
    assert.equal(formatCountdown(30_000), "0:30"); assert.equal(formatCountdown(4_100), "0:05"); assert.equal(formatCountdown(0), "0:00");
  });

  test("anuncia jugadas automáticas visibles para todos e identifica bots", () => {
    const notice = latestAutomaticNotice(clock, 11)!; assert.equal(notice.playerId, "A");
    assert.equal(automaticMoveText(notice, { A: "Ana" }, "Z"), "Jugada automática por Ana (tiempo agotado): colocó 6–4.");
    assert.equal(automaticMoveText(notice, { A: "Ana" }, "A"), "Jugada automática por ti (tiempo agotado): colocó 6–4.");
    assert.equal(latestAutomaticNotice(clock, 20), null);
    assert.deepEqual(seatBadges({ playerId: "B", bot: true, automatic: false, consecutiveTimeouts: 0, resumeRequested: false, connected: true }), ["Bot"]);
    assert.deepEqual(seatBadges({ playerId: "A", bot: false, automatic: true, consecutiveTimeouts: 2, resumeRequested: false, connected: false }), ["Automático", "Sin conexión"]);
  });
});
