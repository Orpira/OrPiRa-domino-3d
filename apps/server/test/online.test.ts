import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { legalActions, type Deal } from "../../../packages/rules/src/index.ts";
import { dealFor } from "../../../packages/rules/test/helpers.ts";
import { placementDecision } from "../../client/src/placement-interaction.ts";
import type { CommandResponse, LobbyView, SessionGrant } from "../../../packages/protocol/src/index.ts";
import { AuthoritativeRoom, JsonFileMatchStore, LobbyManager, MemoryMatchStore, RoomRegistry, createDominoHttpServer, type SessionPlayer } from "../src/index.ts";

const SESSIONS: readonly SessionPlayer[] = [
  { playerId: "P0", seat: 0, sessionId: "secret-0" }, { playerId: "P1", seat: 1, sessionId: "secret-1" },
  { playerId: "P2", seat: 2, sessionId: "secret-2" }, { playerId: "P3", seat: 3, sessionId: "secret-3" },
];
const factory = (seed = 1) => (): Deal => dealFor(seed);
function sessionFor(playerId: string) { return SESSIONS.find((entry) => entry.playerId === playerId)!.sessionId; }

describe("sala online autoritativa", () => {
  test("AC27 reintento devuelve el mismo resultado incluso después de restaurar", async () => {
    const store = new MemoryMatchStore(); const room = await AuthoritativeRoom.create("online-idem", SESSIONS, factory(), store);
    const actorId = room.state.currentPlayerId!; const sessionId = sessionFor(actorId);
    const envelope = { commandId: "cmd-1", expectedRevision: room.state.revision, command: { type: "PLACE" as const, tileId: "6-6" as const } };
    const first = await room.submit(sessionId, envelope); const revision = room.state.revision;
    assert.deepEqual(await room.submit(sessionId, envelope), first); assert.equal(room.state.revision, revision);
    const restored = (await AuthoritativeRoom.restore("online-idem", factory(), store))!;
    assert.deepEqual(await restored.submit(sessionId, envelope), first); assert.equal(restored.state.revision, revision);
  });

  test("AC28 comandos concurrentes con igual revisión aceptan solo uno", async () => {
    const room = await AuthoritativeRoom.create("online-race", SESSIONS, factory()); const actorId = room.state.currentPlayerId!; const sessionId = sessionFor(actorId);
    const revision = room.state.revision;
    const [first, second] = await Promise.all([
      room.submit(sessionId, { commandId: "race-a", expectedRevision: revision, command: { type: "PLACE", tileId: "6-6" } }),
      room.submit(sessionId, { commandId: "race-b", expectedRevision: revision, command: { type: "PLACE", tileId: "6-6" } }),
    ]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    const rejected = [first, second].find((result) => !result.ok)!; if (!rejected.ok) assert.equal(rejected.code, "STALE_REVISION");
    assert.equal(room.state.revision, revision + 1);
  });

  test("actor procede de sesión, vistas no filtran manos y reconexión conserva asiento", async () => {
    const room = await AuthoritativeRoom.create("online-private", SESSIONS, factory(3)); const actorId = room.state.currentPlayerId!;
    const rival = SESSIONS.find((entry) => entry.playerId !== actorId)!; const before = structuredClone(room.state);
    const denied = await room.submit(rival.sessionId, { commandId: "impersonation", expectedRevision: room.state.revision, command: { type: "PLACE", tileId: "6-6" } });
    assert.equal(denied.ok, false); if (!denied.ok) assert.equal(denied.code, "NOT_YOUR_TURN"); assert.deepEqual(room.state, before);
    const view = room.connect(sessionFor(actorId))! as unknown as Record<string, unknown>;
    assert.equal("hands" in view, false); assert.ok(Array.isArray(view.ownHand)); assert.equal(room.spectatorView().ownHand, null);
    room.disconnect(sessionFor(actorId)); assert.deepEqual(room.state, before);
    assert.deepEqual(room.connect(sessionFor(actorId)), view);
  });

  test("commandId reutilizado con contenido distinto se rechaza", async () => {
    const room = await AuthoritativeRoom.create("online-conflict", SESSIONS, factory()); const sessionId = sessionFor(room.state.currentPlayerId!); const revision = room.state.revision;
    await room.submit(sessionId, { commandId: "same", expectedRevision: revision, command: { type: "PLACE", tileId: "6-6" } });
    const conflict = await room.submit(sessionId, { commandId: "same", expectedRevision: revision, command: { type: "PASS" } });
    assert.equal(conflict.ok, false); if (!conflict.ok) assert.equal(conflict.code, "COMMAND_ID_CONFLICT");
  });
});

describe("adaptador HTTP", () => {
  const servers: ReturnType<typeof createDominoHttpServer>[] = [];
  afterEach(() => servers.splice(0).forEach((server) => server.close()));
  test("salud, autenticación, vista privada y comando confirmado", async () => {
    const room = await AuthoritativeRoom.create("http-match", SESSIONS, factory()); const registry = new RoomRegistry(); registry.add(room);
    const server = createDominoHttpServer(registry); servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo; const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/matches/http-match`)).status, 401);
    const actorId = room.state.currentPlayerId!; const sessionId = sessionFor(actorId);
    const viewResponse = await fetch(`${base}/matches/http-match`, { headers: { authorization: `Bearer ${sessionId}` } });
    const view = await viewResponse.json() as Record<string, unknown>; assert.equal("hands" in view, false);
    const action = legalActions(room.state, actorId)[0]!;
    const commandResponse = await fetch(`${base}/matches/http-match/commands`, { method: "POST", headers: { authorization: `Bearer ${sessionId}`, "content-type": "application/json" },
      body: JSON.stringify({ commandId: "http-1", expectedRevision: room.state.revision, command: action }) });
    assert.equal(commandResponse.status, 200); assert.equal((await commandResponse.json() as { ok: boolean }).ok, true);
  });

  test("CORS permite solo los orígenes web y Android configurados", async () => {
    const server = createDominoHttpServer(new RoomRegistry(), undefined, { allowedOrigins: ["https://domino.orpira.es", "https://localhost"] }); servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo; const base = `http://127.0.0.1:${address.port}`;
    const web = await fetch(`${base}/health`, { headers: { origin: "https://domino.orpira.es" } });
    assert.equal(web.status, 200); assert.equal(web.headers.get("access-control-allow-origin"), "https://domino.orpira.es");
    const android = await fetch(`${base}/health`, { method: "OPTIONS", headers: { origin: "https://localhost", "access-control-request-method": "GET" } });
    assert.equal(android.status, 204); assert.equal(android.headers.get("access-control-allow-origin"), "https://localhost");
    const denied = await fetch(`${base}/health`, { headers: { origin: "https://malicioso.example" } }); assert.equal(denied.status, 403);
  });

  test("la selección online abre con 6-6 y los cuatro clientes reciben el estado confirmado", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-online-opening-"));
    try {
      const manager = await LobbyManager.open(join(directory, "lobbies.json"), new JsonFileMatchStore(join(directory, "matches")));
      const server = createDominoHttpServer(new RoomRegistry(), manager); servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address() as AddressInfo; const base = `http://127.0.0.1:${address.port}`;
      const post = async (path: string, value: unknown, sessionId?: string) => {
        const response = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(sessionId ? { authorization: `Bearer ${sessionId}` } : {}) }, body: JSON.stringify(value) });
        return response;
      };
      const created = await post("/api/lobbies", { name: "Ana" }); const grants = [await created.json() as SessionGrant];
      for (const name of ["Beto", "Cora", "Dani"]) grants.push(await (await post(`/api/lobbies/${grants[0]!.code}/join`, { name })).json() as SessionGrant);
      const getView = async (grant: SessionGrant) => (await (await fetch(`${base}/api/lobbies/${grant.code}`, { headers: { authorization: `Bearer ${grant.sessionId}` } })).json()) as LobbyView;
      const initialViews = await Promise.all(grants.map(getView));
      const openerIndex = initialViews.findIndex((view) => view.game?.currentPlayerId === view.viewerPlayerId);
      assert.notEqual(openerIndex, -1); const openerGrant = grants[openerIndex]!; const openerView = initialViews[openerIndex]!;
      assert.ok(openerView.game?.ownHand?.includes("6-6"));
      const openingDecision = placementDecision("6-6", openerView.legalActions); assert.equal(openingDecision.kind, "SEND");
      const command = openingDecision.kind === "SEND" ? openingDecision.command : null;
      assert.deepEqual(command, { type: "PLACE", tileId: "6-6" });
      const response = await post(`/api/lobbies/${openerGrant.code}/commands`, { commandId: "iphone-open-1", expectedRevision: openerView.game!.revision, command }, openerGrant.sessionId);
      const confirmation = await response.json() as CommandResponse; assert.equal(response.status, 200); assert.equal(confirmation.ok, true);
      const confirmedViews = await Promise.all(grants.map(getView)); const openerSeat = openerView.players.find((player) => player.playerId === openerView.viewerPlayerId)!.seat;
      const expectedNextSeat = ((openerSeat + 3) % 4) as 0 | 1 | 2 | 3;
      for (const view of confirmedViews) {
        assert.equal(view.game!.chain.length, 1); assert.deepEqual(view.game!.chain[0], { id: "6-6", left: 6, right: 6, playedBy: openerView.viewerPlayerId });
        assert.equal(view.game!.handCounts[openerView.viewerPlayerId], 6);
        assert.equal(view.players.find((player) => player.playerId === view.game!.currentPlayerId)!.seat, expectedNextSeat);
      }
      const confirmedOpener = confirmedViews[openerIndex]!; assert.equal(confirmedOpener.game!.ownHand!.length, 6); assert.equal(confirmedOpener.game!.ownHand!.includes("6-6"), false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe("lobby privado y recuperación local", () => {
  test("cuatro sesiones únicas ocupan cuatro asientos y completan una partida hasta 100", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-lobby-"));
    try {
      let manager = await LobbyManager.open(join(directory, "lobbies.json"), new JsonFileMatchStore(join(directory, "matches")));
      const grants = [await manager.create("Ana")];
      grants.push(await manager.join(grants[0]!.code, "Beto"), await manager.join(grants[0]!.code, "Cora"));
      let waiting = await manager.view(grants[0]!.code, grants[0]!.sessionId); assert.equal(waiting!.status, "WAITING"); assert.equal(waiting!.players.length, 3);
      grants.push(await manager.join(grants[0]!.code, "Dani"));
      const started = await manager.view(grants[0]!.code, grants[0]!.sessionId); assert.equal(started!.status, "PLAYING");
      assert.deepEqual(started!.players.map((player) => player.seat), [0,1,2,3]); assert.equal(new Set(grants.map((grant) => grant.sessionId)).size, 4);
      let guard = 6_000;
      while (guard-- > 0) {
        const reference = await manager.view(grants[0]!.code, grants[0]!.sessionId); if (reference!.status === "ENDED") break;
        const game = reference!.game!;
        if (game.phase === "ROUND_ENDED") {
          await manager.command(grants[0]!.code, grants[0]!.sessionId, { commandId: `next-${guard}`, expectedRevision: game.revision, command: { type: "NEXT_ROUND" } }); continue;
        }
        const currentGrant = grants.find((grant) => grant.playerId === game.currentPlayerId)!;
        const currentView = (await manager.view(currentGrant.code, currentGrant.sessionId))!; const action = currentView.legalActions[0]!;
        await manager.command(currentGrant.code, currentGrant.sessionId, { commandId: `play-${guard}`, expectedRevision: currentView.game!.revision, command: action.type === "PASS" ? { type: "PASS" } : { type: "PLACE", tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } });
      }
      assert.ok(guard > 0); const ended = await manager.view(grants[0]!.code, grants[0]!.sessionId); assert.equal(ended!.status, "ENDED");
      assert.equal(ended!.game!.players.find((player) => player.playerId === ended!.game!.matchResult!.championId)!.score, 100);
      const finalViews = await Promise.all(grants.map((grant) => manager.view(grant.code, grant.sessionId)));
      for (const view of finalViews) {
        assert.equal("hands" in (view!.game as unknown as Record<string, unknown>), false);
        assert.equal(view!.game!.phase, "MATCH_ENDED"); assert.deepEqual(view!.game!.matchResult, ended!.game!.matchResult);
      }
      const championGrant = grants.find((grant) => grant.playerId === ended!.game!.matchResult!.championId)!;
      const forbiddenRound = await manager.command(championGrant.code, championGrant.sessionId, { commandId: "no-round-after-match", expectedRevision: ended!.game!.revision, command: { type: "NEXT_ROUND" } });
      assert.equal(forbiddenRound?.ok, false); if (forbiddenRound && !forbiddenRound.ok) assert.equal(forbiddenRound.code, "WRONG_PHASE");
      manager = await LobbyManager.open(join(directory, "lobbies.json"), new JsonFileMatchStore(join(directory, "matches")));
      const restoredFinalViews = await Promise.all(grants.map((grant) => manager.view(grant.code, grant.sessionId)));
      for (const view of restoredFinalViews) { assert.equal(view!.status, "ENDED"); assert.deepEqual(view!.game!.matchResult, ended!.game!.matchResult); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("recupera lobby, sesión e idempotencia después de reiniciar el servidor", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-recovery-"));
    try {
      const metadata = join(directory, "lobbies.json"); const matches = join(directory, "matches");
      let manager = await LobbyManager.open(metadata, new JsonFileMatchStore(matches)); const grants = [await manager.create("Uno")];
      grants.push(await manager.join(grants[0]!.code,"Dos"),await manager.join(grants[0]!.code,"Tres"),await manager.join(grants[0]!.code,"Cuatro"));
      const current = (await manager.view(grants[0]!.code, grants[0]!.sessionId))!.game!.currentPlayerId!; const actor = grants.find((grant) => grant.playerId === current)!;
      const actorView = (await manager.view(actor.code, actor.sessionId))!; const action = actorView.legalActions[0]!;
      const envelope = { commandId: "survives-restart", expectedRevision: actorView.game!.revision, command: action.type === "PASS" ? { type: "PASS" as const } : { type: "PLACE" as const, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } };
      const first = await manager.command(actor.code, actor.sessionId, envelope);
      manager = await LobbyManager.open(metadata, new JsonFileMatchStore(matches)); const reconnected = await manager.view(actor.code, actor.sessionId);
      assert.ok(reconnected?.game); assert.deepEqual(await manager.command(actor.code, actor.sessionId, envelope), first);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
