import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { legalActions, type Deal, type GameState } from "../../../packages/rules/src/index.ts";
import { dealFor } from "../../../packages/rules/test/helpers.ts";
import type { LobbyView, QuickPlayView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import {
  AuthoritativeRoom, CompetitionManager, createDominoHttpServer, DEFAULT_QUICK_PLAY, DEFAULT_TURN_CLOCK, JsonFileMatchStore, LeagueManager, LobbyManager,
  MemoryMatchStore, QuickPlayManager, RoomRegistry, tableConfig, type SessionPlayer,
} from "../src/index.ts";

const SESSIONS: readonly SessionPlayer[] = [0, 1, 2, 3].map((seat) => ({ playerId: `P${seat}`, seat: seat as 0, sessionId: `secret-${seat}` }));
const factory = (seed = 1) => (): Deal => dealFor(seed);

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "domino-modes-")); const clock = { t: Date.UTC(2026, 9, 14, 17) }; const now = () => clock.t;
  const store = new JsonFileMatchStore(join(directory, "matches"));
  const identities = await CompetitionManager.open(join(directory, "economy.json"), store, now);
  const quick = await QuickPlayManager.open(join(directory, "quick-play.json"), store, (token) => identities.identify(token), now);
  const league = await LeagueManager.open(join(directory, "league.json"), now); quick.attachLeague(league);
  const people = async (...names: string[]) => { const grants: TestIdentityGrant[] = []; for (const name of names) grants.push(await identities.createIdentity(name)); return grants; };
  return { directory, clock, identities, quick, league, people, close: () => rm(directory, { recursive: true, force: true }) };
}

/** Lleva a un estado con robo en el que el jugador en turno no puede colocar y quedan fichas en el pozo. */
async function roomNeedingDraw(options: { now: () => number; botPlayerIds?: readonly string[] } ) {
  for (let seed = 1; seed < 400; seed++) {
    const room = await AuthoritativeRoom.create(`draw-${seed}`, SESSIONS, factory(seed), new MemoryMatchStore(), { ...options, rules: "DRAW" });
    for (let step = 0; step < 40 && room.state.phase === "ROUND_ACTIVE"; step++) {
      const actor = room.state.currentPlayerId!; const actions = legalActions(room.state, actor);
      if (actions[0]!.type === "DRAW") return { room, actor };
      const action = actions[0]!; const sessionId = SESSIONS.find((entry) => entry.playerId === actor)!.sessionId;
      const response = await room.submit(sessionId, { commandId: `s-${step}`, expectedRevision: room.state.revision, command: action.type === "PLACE" ? { type: "PLACE", tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } : { type: "PASS" } });
      assert.equal(response.ok, true);
    }
  }
  throw new Error("No se encontró un turno con robo");
}

describe("Modalidades en el servidor", () => {
  test("la configuración de mesa valida reglas, formato y objetivo", () => {
    assert.deepEqual(tableConfig({}), { mode: "INDIVIDUAL", rules: "LATINO" });
    assert.deepEqual(tableConfig({ rules: "DRAW", targetScore: 150 }), { mode: "INDIVIDUAL", rules: "DRAW", targetScore: 150 });
    assert.throws(() => tableConfig({ rules: "DRAW", mode: "PAIRS" }), /INVALID_MODE/);
    assert.throws(() => tableConfig({ rules: "BLOCK" }), /INVALID_RULES/);
    assert.throws(() => tableConfig({ targetScore: 120 }), /INVALID_TARGET/);
  });

  test("robar desde el cliente: sigue su turno, la respuesta y la vista nunca revelan el pozo", async () => {
    const { room, actor } = await roomNeedingDraw({ now: () => 0 }); const sessionId = SESSIONS.find((entry) => entry.playerId === actor)!.sessionId;
    const before = room.state.boneyard!.length; const handBefore = room.state.hands[actor]!.length;
    const response = await room.submit(sessionId, { commandId: "robo-1", expectedRevision: room.state.revision, command: { type: "DRAW" } });
    assert.equal(response.ok, true); assert.equal(room.state.currentPlayerId, actor);
    assert.equal(room.state.hands[actor]!.length, handBefore + 1); assert.equal(room.state.boneyard!.length, before - 1);
    assert.equal(response.view!.boneyardCount, before - 1); assert.equal(JSON.stringify(response).includes("boneyard\""), false);
    for (const session of SESSIONS) assert.equal("boneyard" in room.connect(session.sessionId)!, false);
    // Repetir el mismo commandId devuelve lo mismo sin robar otra vez.
    assert.deepEqual(await room.submit(sessionId, { commandId: "robo-1", expectedRevision: response.view!.revision - 1, command: { type: "DRAW" } }), response);
    assert.equal(room.state.boneyard!.length, before - 1);
  });

  test("si se agota el tiempo y hay que robar, la jugada automática completa el turno y cuenta un solo tiempo agotado", async () => {
    let t = 0; const { room, actor } = await roomNeedingDraw({ now: () => t });
    t += DEFAULT_TURN_CLOCK.turnMs + 1; await room.advance();
    assert.notEqual(room.state.currentPlayerId, actor);
    const seat = room.clockView().seats.find((entry) => entry.playerId === actor)!; assert.equal(seat.consecutiveTimeouts, 1); assert.equal(seat.automatic, false);
    const moves = room.clockView().automaticMoves.filter((move) => move.playerId === actor);
    assert.ok(moves.some((move) => move.action === "DRAW")); assert.ok(["PLACE", "PASS"].includes(moves.at(-1)!.action));
  });

  test("sala con código «con robo» a 150: modalidad, objetivo y pozo en la vista", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-modes-lobby-")); try {
      const lobbies = await LobbyManager.open(join(directory, "lobbies.json"), new JsonFileMatchStore(join(directory, "matches")));
      const host = await lobbies.create("Ana", { rules: "DRAW", targetScore: 150 }); for (const name of ["Beto", "Cora", "Dani"]) await lobbies.join(host.code, name);
      const view = (await lobbies.view(host.code, host.sessionId))!;
      assert.deepEqual([view.rules, view.mode, view.targetScore, view.game!.rules, view.game!.targetScore, view.game!.boneyardCount, view.game!.ownHand!.length], ["DRAW", "INDIVIDUAL", 150, "DRAW", 150, 8, 5]);
      const latino = await lobbies.create("Eva"); const latinoView = (await lobbies.view(latino.code, latino.sessionId))!; assert.deepEqual([latinoView.rules, latinoView.targetScore], ["LATINO", 100]);
      const pairs = await lobbies.create("Fede", { mode: "PAIRS" }); assert.equal((await lobbies.view(pairs.code, pairs.sessionId))!.targetScore, 200);
      await assert.rejects(() => lobbies.create("Gina", { rules: "DRAW", mode: "PAIRS" }), /INVALID_MODE/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("Jugar ahora «con robo»: cola propia, bots, partida completa, historial con reglas y sin puntos de liga", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto"); const start = state.clock.t;
      await state.quick.join(ana!.identityToken, { rules: "DRAW" });
      const latino = await state.quick.join(beto!.identityToken); assert.equal(latino.ticket!.rules, "LATINO"); assert.equal(latino.ticket!.position, 1);
      assert.equal((await state.quick.view(ana!.identityToken)).ticket!.rules, "DRAW");
      state.clock.t = start + DEFAULT_QUICK_PLAY.fillAfterMs; await state.quick.tick();
      const started = (await state.quick.view(ana!.identityToken)).match!; assert.equal(started.rules, "DRAW"); assert.equal(started.game.boneyardCount, 8);
      assert.equal(started.seats.filter((seat) => seat.bot).length, 3);
      let view: QuickPlayView = await state.quick.view(ana!.identityToken);
      for (let guard = 0; guard < 50_000 && view.match!.status !== "ENDED"; guard++) { state.clock.t = Math.max(state.clock.t + 100, view.match!.clock.turnDeadline ?? state.clock.t); await state.quick.tick(); view = await state.quick.view(ana!.identityToken); }
      assert.equal(view.match!.status, "ENDED");
      const history = (await state.quick.historyFor(ana!.identityToken))[0]!; assert.equal(history.rules, "DRAW");
      assert.equal(state.league.awardFor(view.match!.matchId, ana!.identityId), null); assert.equal(view.match!.league, null);
      assert.equal((await state.league.view(null)).totalPlayers, 0);
      await assert.rejects(() => state.quick.join(ana!.identityToken, { rules: "DRAW", mode: "PAIRS" }), /INVALID_MODE/);
    } finally { await state.close(); }
  });

  test("HTTP: crear sala con reglas y objetivo, y «Jugar ahora» con reglas", async () => {
    const state = await setup(); const directory = await mkdtemp(join(tmpdir(), "domino-modes-http-"));
    const lobbies = await LobbyManager.open(join(directory, "lobbies.json"), new JsonFileMatchStore(join(directory, "matches")));
    const server = createDominoHttpServer(new RoomRegistry(), lobbies, { competitionManager: state.identities, quickPlayManager: state.quick });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const post = (path: string, body: unknown, token?: string) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const grant = await (await post("/api/lobbies", { name: "Ana", rules: "DRAW", targetScore: 200 })).json() as { code: string; sessionId: string };
      const view = await (await fetch(`${base}/api/lobbies/${grant.code}`, { headers: { authorization: `Bearer ${grant.sessionId}` } })).json() as LobbyView;
      assert.deepEqual([view.rules, view.targetScore], ["DRAW", 200]);
      const bad = await post("/api/lobbies", { name: "Ana", targetScore: 99 }); assert.equal(bad.status, 400); assert.equal((await bad.json() as { code: string }).code, "INVALID_TARGET");
      const [eva] = await state.people("Eva");
      assert.equal(((await (await post("/api/quick-play/join", { rules: "DRAW" }, eva!.identityToken)).json()) as QuickPlayView).ticket!.rules, "DRAW");
    } finally { server.close(); await state.close(); await rm(directory, { recursive: true, force: true }); }
  });

  test("las partidas guardadas antes de las modalidades se restauran como Latino", async () => {
    const store = new MemoryMatchStore(); const room = await AuthoritativeRoom.create("antigua", SESSIONS, factory(), store);
    const restored = (await AuthoritativeRoom.restore("antigua", factory(), store))!; const state: GameState = restored.state;
    assert.equal(state.rules, undefined); assert.equal(state.boneyard, undefined); assert.equal(room.state.matchId, "antigua");
  });
});

describe("All Fives en el servidor", () => {
  test("mesa All Fives en Jugar ahora: cola propia, partida completa con bots, puntos múltiplos de 5 y sin liga", async () => {
    const state = await setup(); try {
      assert.deepEqual(tableConfig({ rules: "ALL_FIVES", targetScore: 150 }), { mode: "INDIVIDUAL", rules: "ALL_FIVES", targetScore: 150 });
      assert.throws(() => tableConfig({ rules: "ALL_FIVES", mode: "PAIRS" }), /INVALID_MODE/);
      const [ana] = await state.people("Ana"); const start = state.clock.t;
      const waiting = await state.quick.join(ana!.identityToken, { rules: "ALL_FIVES" }); assert.equal(waiting.ticket!.rules, "ALL_FIVES");
      state.clock.t = start + DEFAULT_QUICK_PLAY.fillAfterMs; await state.quick.tick();
      let view: QuickPlayView = await state.quick.view(ana!.identityToken); assert.equal(view.match!.rules, "ALL_FIVES");
      for (let guard = 0; guard < 50_000 && view.match!.status !== "ENDED"; guard++) { state.clock.t = Math.max(state.clock.t + 100, view.match!.clock.turnDeadline ?? state.clock.t); await state.quick.tick(); view = await state.quick.view(ana!.identityToken); }
      assert.equal(view.match!.status, "ENDED"); assert.ok(view.match!.game.players.every((player) => player.score % 5 === 0));
      assert.equal((await state.quick.historyFor(ana!.identityToken))[0]!.rules, "ALL_FIVES"); assert.equal(view.match!.league, null);
    } finally { await state.close(); }
  });
});
