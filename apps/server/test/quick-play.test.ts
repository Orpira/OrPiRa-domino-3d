import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { CompetitionManager, DEFAULT_QUICK_PLAY, DEFAULT_TURN_CLOCK, JsonFileMatchStore, QuickPlayManager } from "../src/index.ts";

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "domino-quick-")); const clock = { t: 0 }; const now = () => clock.t; const store = new JsonFileMatchStore(join(directory, "matches"));
  const identities = await CompetitionManager.open(join(directory, "economy.json"), store, now);
  const quick = await QuickPlayManager.open(join(directory, "quick-play.json"), store, (token) => identities.identify(token), now);
  const people = async (...names: string[]) => { const grants: TestIdentityGrant[] = []; for (const name of names) grants.push(await identities.createIdentity(name)); return grants; };
  return { directory, clock, identities, quick, people, close: () => rm(directory, { recursive: true, force: true }) };
}

describe("Jugar ahora: cola pública de práctica gratuita", () => {
  test("cuatro humanos forman mesa al instante por orden de llegada y sin bots", async () => {
    const state = await setup(); try {
      const grants = await state.people("Ana", "Beto", "Cora", "Dani", "Eva");
      for (const grant of grants.slice(0, 3)) { const view = await state.quick.join(grant.identityToken); assert.ok(view.ticket); assert.equal(view.match, null); }
      const waiting = await state.quick.view(grants[2]!.identityToken); assert.equal(waiting.ticket!.position, 3); assert.deepEqual(waiting.ticket!.waiting, ["Ana", "Beto", "Cora"]);
      const full = await state.quick.join(grants[3]!.identityToken); assert.equal(full.ticket, null); assert.ok(full.match);
      assert.deepEqual(full.match!.seats.map((seat) => [seat.displayName, seat.bot]), [["Ana", false], ["Beto", false], ["Cora", false], ["Dani", false]]);
      assert.equal(full.match!.clock.seats.some((seat) => seat.bot), false);
      for (const grant of grants.slice(0, 4)) assert.equal((await state.quick.view(grant.identityToken)).match!.matchId, full.match!.matchId);
      const fifth = await state.quick.join(grants[4]!.identityToken); assert.equal(fifth.ticket!.position, 1); assert.equal(state.quick.queueSize(), 1);
      // Privacidad: cada uno ve solo su mano.
      const views = await Promise.all(grants.slice(0, 4).map((grant) => state.quick.view(grant.identityToken)));
      for (const view of views) { assert.equal(view.match!.game.ownHand!.length, 7); assert.equal("hands" in (view.match!.game as unknown as Record<string, unknown>), false); }
    } finally { await state.close(); }
  });

  test("tras la espera completa con bots identificados como «Bot» y la partida termina con historial", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto");
      await state.quick.join(ana!.identityToken); state.clock.t = 10_000; await state.quick.join(beto!.identityToken);
      state.clock.t = DEFAULT_QUICK_PLAY.fillAfterMs - 1; await state.quick.tick(); assert.equal((await state.quick.view(beto!.identityToken)).match, null);
      assert.equal((await state.quick.view(beto!.identityToken)).ticket!.botsFillAt, DEFAULT_QUICK_PLAY.fillAfterMs);
      state.clock.t = DEFAULT_QUICK_PLAY.fillAfterMs; await state.quick.tick();
      const started = (await state.quick.view(ana!.identityToken)).match!; assert.ok(started); assert.equal(state.quick.queueSize(), 0);
      assert.deepEqual(started.seats.map((seat) => [seat.displayName, seat.bot]), [["Ana", false], ["Beto", false], ["Bot 1", true], ["Bot 2", true]]);
      assert.deepEqual(started.clock.seats.map((seat) => seat.bot), [false, false, true, true]);
      let guard = 50_000; let view = started;
      // Ana juega sus turnos; Beto no vuelve a aparecer.
      while (view.status === "PLAYING" && guard-- > 0) {
        const action = view.legalActions[0];
        if (view.game.phase === "ROUND_ACTIVE" && action) {
          state.clock.t += 100; const response = await state.quick.command(ana!.identityToken, { commandId: `ana-${guard}`, expectedRevision: view.game.revision, command: action.type === "PASS" ? { type: "PASS" } : { type: "PLACE", tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } });
          assert.equal(response.ok, true);
        } else { state.clock.t = Math.max(state.clock.t + 100, view.clock.turnDeadline ?? state.clock.t); await state.quick.tick(); }
        view = (await state.quick.view(ana!.identityToken)).match!;
      }
      assert.ok(guard > 0); assert.equal(view.status, "ENDED"); assert.ok(view.game.matchResult);
      assert.ok(view.clock.automaticMoves.some((move) => move.reason === "BOT"));
      const history = await state.quick.historyFor(beto!.identityToken); assert.equal(history.length, 1);
      assert.deepEqual(history[0]!.participants.map((entry) => [entry.displayName, entry.bot, entry.endedAutomatic]), [["Ana", false, false], ["Beto", false, true], ["Bot 1", true, false], ["Bot 2", true, false]]);
      assert.equal(history[0]!.participants.reduce((total, entry) => Math.max(total, entry.score), 0) >= 100, true);
      // «Jugar otra»: tras terminar, la misma identidad puede volver a la cola.
      const again = await state.quick.join(ana!.identityToken); assert.ok(again.ticket); assert.equal(again.match, null);
    } finally { await state.close(); }
  });

  test("cancelar saca de la cola y la misma identidad nunca ocupa dos plazas", async () => {
    const state = await setup(); try {
      const [ana, beto, cora, dani] = await state.people("Ana", "Beto", "Cora", "Dani");
      const first = await state.quick.join(ana!.identityToken); const repeated = await state.quick.join(ana!.identityToken);
      assert.equal(repeated.ticket!.ticketId, first.ticket!.ticketId); assert.equal(state.quick.queueSize(), 1);
      const cancelled = await state.quick.cancel(ana!.identityToken); assert.equal(cancelled.ticket, null); assert.equal(state.quick.queueSize(), 0);
      state.clock.t = DEFAULT_QUICK_PLAY.fillAfterMs * 3; await state.quick.tick(); assert.equal((await state.quick.view(ana!.identityToken)).match, null);
      for (const grant of [ana, beto, cora, dani]) await state.quick.join(grant!.identityToken);
      const playing = await state.quick.join(ana!.identityToken); assert.equal(playing.ticket, null); assert.ok(playing.match); assert.equal(state.quick.queueSize(), 0);
      await assert.rejects(() => state.quick.join("token-falso"), /UNAUTHENTICATED/);
    } finally { await state.close(); }
  });

  test("nunca hay bots en Competición de prueba: una sala incompleta espera y caduca sin rellenarse", async () => {
    const state = await setup(); try {
      const grants = await state.people("Ana", "Beto", "Cora");
      const code = (await state.identities.create(grants[0]!.identityToken)).code; for (const grant of grants.slice(1)) await state.identities.join(code, grant.identityToken);
      for (const grant of grants) await state.identities.accept(code, grant.identityToken, 1);
      for (let minute = 1; minute < 15; minute++) { state.clock.t = minute * 60_000; await state.identities.tick(); await state.quick.tick(); }
      const waiting = await state.identities.view(code, grants[0]!.identityToken); assert.equal(waiting.status, "WAITING"); assert.equal(waiting.members.length, 3); assert.equal(waiting.clock, null);
      state.clock.t = 15 * 60_000; await state.identities.tick(); assert.equal((await state.identities.view(code, grants[0]!.identityToken)).status, "EXPIRED");
      assert.equal(DEFAULT_TURN_CLOCK.turnMs, 30_000);
    } finally { await state.close(); }
  });
});
