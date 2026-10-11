import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClientCommand, CommandEnvelope, CompetitionView, SimulatedConditions, TestAccountView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { CompetitionManager, createDominoHttpServer, JsonFileMatchStore, RoomRegistry, settlementAmounts, SIMULATED_CONDITIONS } from "../src/index.ts";

async function setup(now: () => number = Date.now, terms: SimulatedConditions = SIMULATED_CONDITIONS) {
  const directory = await mkdtemp(join(tmpdir(), "domino-competition-")); const metadata = join(directory, "economy.json"); const matches = join(directory, "matches");
  const manager = await CompetitionManager.open(metadata, new JsonFileMatchStore(matches), now, terms); return { directory, metadata, matches, manager };
}
async function four(manager: CompetitionManager) {
  const grants: TestIdentityGrant[] = [];
  for (const name of ["Ana", "Beto", "Cora", "Dani"]) grants.push(await manager.createIdentity(name));
  let view = await manager.create(grants[0]!.identityToken); const code = view.code;
  for (const grant of grants.slice(1)) view = await manager.join(code, grant.identityToken);
  return { grants, code };
}
async function start(manager: CompetitionManager, grants: readonly TestIdentityGrant[], code: string) {
  let view!: CompetitionView; for (const grant of grants) view = await manager.accept(code, grant.identityToken, SIMULATED_CONDITIONS.version); return view;
}


// Juega con la primera acción legal de cada turno; `beforeFinal` se ejecuta antes del comando que termina la partida.
async function playToEnd(manager: CompetitionManager, grants: readonly TestIdentityGrant[], code: string, beforeFinal?: () => Promise<void>) {
  let view = await manager.view(code, grants[0]!.identityToken); let guard = 7000;
  while (view.status === "PLAYING" && guard-- > 0) {
    const game = view.game!; let token: string; let envelope: CommandEnvelope;
    if (game.phase === "ROUND_ENDED") { token = grants[0]!.identityToken; envelope = { commandId: `next-${guard}`, expectedRevision: game.revision, command: { type: "NEXT_ROUND" } }; }
    else {
      token = grants.find((grant) => grant.identityId === game.currentPlayerId)!.identityToken; const current = await manager.view(code, token); const action = current.legalActions[0]!;
      envelope = { commandId: `play-${guard}`, expectedRevision: current.game!.revision, command: action.type === "PASS" ? { type: "PASS" } : { type: "PLACE", tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } };
      const leader = Math.max(...current.game!.players.map((player) => player.score));
      if (beforeFinal && leader >= 80 && current.game!.ownHand!.length === 1 && action.type === "PLACE") await beforeFinal();
    }
    await manager.command(code, token, envelope); view = await manager.view(code, grants[0]!.identityToken);
  }
  return view;
}
function assertConserved(accounts: readonly TestAccountView[], credit: number, retainedCommission = 0) {
  for (const account of accounts) {
    const available = account.movements.reduce((total, entry) => total + entry.availableDelta, 0); const reserved = account.movements.reduce((total, entry) => total + entry.reservedDelta, 0);
    assert.equal(available, account.available); assert.equal(reserved, account.reserved); assert.ok(account.available >= 0 && account.reserved >= 0);
  }
  assert.equal(accounts.reduce((total, account) => total + account.available + account.reserved, 0) + retainedCommission, credit * accounts.length);
}

describe("competición económica simulada autoritativa", () => {
  test("concede crédito una vez, reserva concurrentemente y no expone saldos ajenos", async () => {
    const { directory, manager } = await setup(); try {
      const identity = await manager.createIdentity("Ana"); const initial = await manager.account(identity.identityToken);
      assert.equal(initial.available, 100000); assert.equal(initial.reserved, 0); assert.equal(initial.movements.filter((entry) => entry.kind === "INITIAL_CREDIT").length, 1);
      const views = await Promise.all(Array.from({ length: 21 }, () => manager.create(identity.identityToken)));
      const accepted = await Promise.allSettled(views.map((view) => manager.accept(view.code, identity.identityToken, 1)));
      assert.equal(accepted.filter((result) => result.status === "fulfilled").length, 20); assert.equal(accepted.filter((result) => result.status === "rejected").length, 1);
      const exhausted = await manager.account(identity.identityToken); assert.equal(exhausted.available, 0); assert.equal(exhausted.reserved, 100000);
      const publicView = await manager.view(views[0]!.code, identity.identityToken) as unknown as Record<string, unknown>;
      assert.equal("available" in publicView, false); assert.equal(JSON.stringify(publicView).includes("identityToken"), false);
      await assert.rejects(() => manager.account("token-falsificado"), /UNAUTHENTICATED/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("requiere cuatro aceptaciones y cancela o caduca con devolución única incluso tras reinicio", async () => {
    let clock = 1_000; const state = await setup(() => clock); try {
      const { grants, code } = await four(state.manager);
      for (const grant of grants.slice(0, 3)) await state.manager.accept(code, grant.identityToken, 1);
      assert.equal((await state.manager.view(code, grants[0]!.identityToken)).status, "WAITING");
      await state.manager.cancel(code, grants[0]!.identityToken);
      for (const grant of grants) { const account = await state.manager.account(grant.identityToken); assert.equal(account.available, 100000); assert.equal(account.reserved, 0); }
      const expiring = await state.manager.create(grants[0]!.identityToken); await state.manager.accept(expiring.code, grants[0]!.identityToken, 1); clock += 15 * 60_000 + 1;
      const restored = await CompetitionManager.open(state.metadata, new JsonFileMatchStore(state.matches), () => clock);
      assert.equal((await restored.view(expiring.code, grants[0]!.identityToken)).status, "EXPIRED");
      const account = await restored.account(grants[0]!.identityToken); assert.equal(account.available, 100000); assert.equal(account.reserved, 0);
      assert.equal(account.movements.filter((entry) => entry.competitionId === expiring.competitionId && entry.kind === "ENTRY_RELEASED").length, 1);
    } finally { await rm(state.directory, { recursive: true, force: true }); }
  });

  test("restaura partida y liquida exactamente una vez al campeón confirmado", async () => {
    const state = await setup(); try {
      const { grants, code } = await four(state.manager); let manager = state.manager; let view = await start(manager, grants, code);
      assert.equal(view.status, "PLAYING");
      for (const grant of grants) { const account = await manager.account(grant.identityToken); assert.equal(account.available, 95000); assert.equal(account.reserved, 5000); }
      manager = await CompetitionManager.open(state.metadata, new JsonFileMatchStore(state.matches)); view = await manager.view(code, grants[0]!.identityToken); assert.equal(view.status, "PLAYING");
      let finalEnvelope: { commandId: string; expectedRevision: number; command: ClientCommand } | null = null; let finalToken = ""; let guard = 7000;
      while (view.status !== "ENDED" && guard-- > 0) {
        const game = view.game!;
        if (game.phase === "ROUND_ENDED") {
          finalToken = grants[0]!.identityToken; finalEnvelope = { commandId: `next-${guard}`, expectedRevision: game.revision, command: { type: "NEXT_ROUND" } };
        } else {
          const current = grants.find((grant) => grant.identityId === game.currentPlayerId)!; finalToken = current.identityToken;
          const currentView = await manager.view(code, finalToken); const action = currentView.legalActions[0]!;
          finalEnvelope = { commandId: `play-${guard}`, expectedRevision: currentView.game!.revision, command: action.type === "PASS" ? { type: "PASS" } : { type: "PLACE", tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } };
        }
        await manager.command(code, finalToken, finalEnvelope); view = await manager.view(code, grants[0]!.identityToken);
      }
      assert.ok(guard > 0); assert.equal(view.status, "ENDED"); assert.ok(view.settlement); const champion = view.settlement!.championIdentityId;
      await manager.command(code, finalToken, finalEnvelope!);
      manager = await CompetitionManager.open(state.metadata, new JsonFileMatchStore(state.matches));
      let total = 0; for (const grant of grants) { const account = await manager.account(grant.identityToken); total += account.available + account.reserved; assert.equal(account.reserved, 0); assert.equal(account.available, grant.identityId === champion ? 115000 : 95000); }
      assert.equal(total, 400000); const championGrant = grants.find((grant) => grant.identityId === champion)!; const championAccount = await manager.account(championGrant.identityToken);
      assert.equal(championAccount.movements.filter((entry) => entry.kind === "PRIZE_AWARDED").length, 1);
    } finally { await rm(state.directory, { recursive: true, force: true }); }
  });

  test("publica las condiciones vigentes sin autenticación y sin datos de cuentas", async () => {
    const state = await setup(); const server = createDominoHttpServer(new RoomRegistry(), undefined, { competitionManager: state.manager });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${address.port}/api/simulated-conditions`); assert.equal(response.status, 200);
      const conditions = await response.json() as Record<string, unknown>; assert.deepEqual(conditions, { ...SIMULATED_CONDITIONS });
      assert.equal(SIMULATED_CONDITIONS.entry * SIMULATED_CONDITIONS.playerCount, SIMULATED_CONDITIONS.prize);
    } finally { await new Promise((resolve) => server.close(resolve)); await rm(state.directory, { recursive: true, force: true }); }
  });

  test("anulación posterior al inicio exige cuatro consentimientos y nunca declara campeón", async () => {
    const { directory, manager } = await setup(); try {
      const { grants, code } = await four(manager); await start(manager, grants, code);
      for (const grant of grants.slice(0, 3)) assert.equal((await manager.requestAnnulment(code, grant.identityToken)).status, "PLAYING");
      const annulled = await manager.requestAnnulment(code, grants[3]!.identityToken); assert.equal(annulled.status, "CANCELLED"); assert.equal(annulled.settlement, null);
      for (const grant of grants) { const account = await manager.account(grant.identityToken); assert.equal(account.available, 100000); assert.equal(account.reserved, 0); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  test("conserva la contabilidad y recupera una liquidación interrumpida tras reinicio sin duplicarla", async () => {
    const state = await setup(); try {
      const { grants, code } = await four(state.manager); await start(state.manager, grants, code);
      const snapshot = join(state.directory, "economy-before-final.json"); let captured = false;
      // Copia el registro económico antes de cada posible jugada final para simular una caída tras guardar la partida.
      const view = await playToEnd(state.manager, grants, code, async () => { await copyFile(state.metadata, snapshot); captured = true; });
      assert.equal(view.status, "ENDED"); assert.ok(captured); assert.equal(view.settlement!.matchId.length > 0, true);
      const before = JSON.parse(await readFile(snapshot, "utf8")) as { competitions: Array<{ code: string; status: string; settlement: unknown }> };
      assert.deepEqual(before.competitions.filter((entry) => entry.code === code).map((entry) => [entry.status, entry.settlement]), [["PLAYING", null]]);
      await copyFile(snapshot, state.metadata);
      let manager = await CompetitionManager.open(state.metadata, new JsonFileMatchStore(state.matches));
      const recovered = await manager.view(code, grants[0]!.identityToken); assert.equal(recovered.status, "ENDED"); assert.equal(recovered.settlement!.championIdentityId, view.settlement!.championIdentityId);
      manager = await CompetitionManager.open(state.metadata, new JsonFileMatchStore(state.matches));
      const accounts = await Promise.all(grants.map((grant) => manager.account(grant.identityToken))); assertConserved(accounts, 100000);
      assert.equal(accounts.flatMap((account) => account.movements).filter((entry) => entry.kind === "PRIZE_AWARDED").length, 1);
      assert.equal(accounts.flatMap((account) => account.movements).filter((entry) => entry.kind === "ENTRY_CONSUMED").length, 4);
    } finally { await rm(state.directory, { recursive: true, force: true }); }
  });

  test("un cambio de condiciones invalida aceptaciones previas y devuelve las reservas una sola vez", async () => {
    const state = await setup(); try {
      const { grants, code } = await four(state.manager); for (const grant of grants.slice(0, 2)) await state.manager.accept(code, grant.identityToken, 1);
      const changed: SimulatedConditions = { ...SIMULATED_CONDITIONS, version: 2 };
      const manager = await CompetitionManager.open(state.metadata, new JsonFileMatchStore(state.matches), Date.now, changed);
      const view = await manager.view(code, grants[0]!.identityToken); assert.equal(view.status, "CANCELLED"); assert.match(view.cancellationReason!, /condiciones/);
      await assert.rejects(() => manager.accept(code, grants[2]!.identityToken, 2), /COMPETITION_NOT_WAITING/);
      const fresh = await manager.create(grants[0]!.identityToken); await assert.rejects(() => manager.accept(fresh.code, grants[0]!.identityToken, 1), /CONDITIONS_CHANGED/);
      const accounts = await Promise.all(grants.map((grant) => manager.account(grant.identityToken))); assertConserved(accounts, 100000);
      for (const account of accounts) assert.equal(account.reserved, 0);
      assert.equal(accounts.flatMap((account) => account.movements).filter((entry) => entry.kind === "ENTRY_RELEASED").length, 2);
    } finally { await rm(state.directory, { recursive: true, force: true }); }
  });

  test("ignora importes, identidad y resultados enviados por el cliente", async () => {
    const state = await setup(); const server = createDominoHttpServer(new RoomRegistry(), undefined, { competitionManager: state.manager });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const post = (path: string, token: string | null, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const forged = await (await post("/api/test-identities", null, { displayName: "Eva", available: 9_999_999, identityId: "test-admin" })).json() as TestIdentityGrant;
      assert.notEqual(forged.identityId, "test-admin");
      const room = await (await post("/api/competitions", forged.identityToken, { entry: 1, prize: 1_000_000 })).json() as CompetitionView;
      assert.equal(room.conditions.entry, 5000); assert.equal(room.conditions.prize, 20000);
      const accepted = await (await post(`/api/competitions/${room.code}/accept`, forged.identityToken, { conditionsVersion: 1, entry: 1, championIdentityId: forged.identityId, settlement: { netPrize: 1 } })).json() as CompetitionView;
      assert.equal(accepted.status, "WAITING"); assert.equal(accepted.settlement, null);
      const account = await (await fetch(`${base}/api/test-account`, { headers: { authorization: `Bearer ${forged.identityToken}` } })).json() as TestAccountView;
      assert.equal(account.available, 95000); assert.equal(account.reserved, 5000);
      assert.equal((await post(`/api/competitions/${room.code}/accept`, "token-ajeno", { conditionsVersion: 1 })).status, 400);
      assert.equal((await fetch(`${base}/api/test-account`)).status, 401);
      const commands = await post(`/api/competitions/${room.code}/commands`, forged.identityToken, { commandId: "x", expectedRevision: 0, command: { type: "PASS" } });
      assert.equal(((await commands.json()) as { code: string }).code, "COMPETITION_NOT_PLAYING");
    } finally { await new Promise((resolve) => server.close(resolve)); await rm(state.directory, { recursive: true, force: true }); }
  });
  test("reserva concurrente del mismo saldo en dos salas distintas: solo una entrada se reserva", async () => {
    const state = await setup(); try {
      const identity = await state.manager.createIdentity("Ana");
      for (let index = 0; index < 19; index++) { const room = await state.manager.create(identity.identityToken); await state.manager.accept(room.code, identity.identityToken, 1); }
      assert.equal((await state.manager.account(identity.identityToken)).available, 5000);
      const first = await state.manager.create(identity.identityToken); const second = await state.manager.create(identity.identityToken);
      const results = await Promise.allSettled([state.manager.accept(first.code, identity.identityToken, 1), state.manager.accept(second.code, identity.identityToken, 1)]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected"); assert.equal(rejected.length, 1); assert.match(String(rejected[0]!.reason), /INSUFFICIENT_BALANCE/);
      const account = await state.manager.account(identity.identityToken); assert.equal(account.available, 0); assert.equal(account.reserved, 100000);
      assert.equal(account.movements.filter((entry) => entry.kind === "ENTRY_RESERVED").length, 20); assertConserved([account], 100000);
    } finally { await rm(state.directory, { recursive: true, force: true }); }
  });

  test("redondea la comisión a pesos enteros y rechaza condiciones que no cuadran", () => {
    const base = { ...SIMULATED_CONDITIONS, commissionPercent: 5 };
    assert.deepEqual(settlementAmounts({ ...base, entry: 5000, prize: 19000 }), { pool: 20000, commission: 1000, prize: 19000 });
    assert.deepEqual(settlementAmounts({ ...base, entry: 5001, prize: 19004 }), { pool: 20004, commission: 1000, prize: 19004 });
    assert.deepEqual(settlementAmounts({ ...base, entry: 5003, prize: 19011 }), { pool: 20012, commission: 1001, prize: 19011 });
    assert.throws(() => settlementAmounts({ ...base, entry: 5000, prize: 20000 }), /INCONSISTENT_CONDITIONS/);
    assert.throws(() => settlementAmounts({ ...base, entry: 5000.5, prize: 19000 }), /INCONSISTENT_CONDITIONS/);
  });

  test("liquida con comisión del 5 % y redondeo, conservando la contabilidad", async () => {
    const terms: SimulatedConditions = { ...SIMULATED_CONDITIONS, entry: 5001, commissionPercent: 5, prize: 19004, version: 5 };
    await assert.rejects(() => CompetitionManager.open(join(tmpdir(), "nunca-creado.json"), new JsonFileMatchStore(join(tmpdir(), "nunca-creado")), Date.now, { ...terms, prize: 20004 }), /INCONSISTENT_CONDITIONS/);
    const state = await setup(Date.now, terms); try {
      const grants: TestIdentityGrant[] = []; for (const name of ["Ana", "Beto", "Cora", "Dani"]) grants.push(await state.manager.createIdentity(name));
      const code = (await state.manager.create(grants[0]!.identityToken)).code; for (const grant of grants.slice(1)) await state.manager.join(code, grant.identityToken);
      for (const grant of grants) await state.manager.accept(code, grant.identityToken, 5);
      const view = await playToEnd(state.manager, grants, code); assert.equal(view.status, "ENDED");
      assert.deepEqual({ ...view.settlement!, championIdentityId: "", matchId: "", settledAt: 0 }, { championIdentityId: "", matchId: "", settledAt: 0, automaticIdentityIds: [], entry: 5001, grossPrize: 20004, commission: 1000, netPrize: 19004 });
      const manager = await CompetitionManager.open(state.metadata, new JsonFileMatchStore(state.matches), Date.now, terms);
      const accounts = await Promise.all(grants.map((grant) => manager.account(grant.identityToken)));
      for (const account of accounts) assert.equal(account.available, account.identityId === view.settlement!.championIdentityId ? 100000 - 5001 + 19004 : 100000 - 5001);
      assertConserved(accounts, 100000, view.settlement!.commission);
      assert.equal(accounts.flatMap((account) => account.movements).filter((entry) => entry.kind === "PRIZE_AWARDED").length, 1);
    } finally { await rm(state.directory, { recursive: true, force: true }); }
  });
});
