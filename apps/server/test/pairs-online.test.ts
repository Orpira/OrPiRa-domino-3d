import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PAIRS_TARGET, type Deal } from "../../../packages/rules/src/index.ts";
import { dealFor } from "../../../packages/rules/test/helpers.ts";
import type { QuickPlayView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import {
  AuthoritativeRoom, CompetitionManager, createDominoHttpServer, DEFAULT_QUICK_PLAY, DEFAULT_TURN_CLOCK, JsonFileMatchStore, LeagueManager, LobbyManager,
  MemoryMatchStore, QuickPlayManager, RoomRegistry, type SessionPlayer,
} from "../src/index.ts";

const SESSIONS: readonly SessionPlayer[] = [0, 1, 2, 3].map((seat) => ({ playerId: `P${seat}`, seat: seat as 0, sessionId: `secret-${seat}` }));
const factory = (seed = 1) => (): Deal => dealFor(seed);

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "domino-pairs-")); const clock = { t: Date.UTC(2026, 9, 14, 17) }; const now = () => clock.t;
  const store = new JsonFileMatchStore(join(directory, "matches"));
  const identities = await CompetitionManager.open(join(directory, "economy.json"), store, now);
  const quick = await QuickPlayManager.open(join(directory, "quick-play.json"), store, (token) => identities.identify(token), now);
  const league = await LeagueManager.open(join(directory, "league.json"), now); quick.attachLeague(league);
  const people = async (...names: string[]) => { const grants: TestIdentityGrant[] = []; for (const name of names) grants.push(await identities.createIdentity(name)); return grants; };
  return { directory, clock, identities, quick, league, store, people, close: () => rm(directory, { recursive: true, force: true }) };
}

/** Cada humano juega su primera acción legal en su turno; las pausas entre manos las resuelve el reloj. */
async function playOut(state: Awaited<ReturnType<typeof setup>>, grants: readonly TestIdentityGrant[]) {
  for (let guard = 0; guard < 20_000; guard++) {
    let acted = false; let view: QuickPlayView | null = null;
    for (const grant of grants) {
      view = await state.quick.view(grant.identityToken); const match = view.match!; if (match.status === "ENDED") return match;
      const action = match.legalActions[0]; if (match.game.phase !== "ROUND_ACTIVE" || !action) continue;
      state.clock.t += 100; acted = true;
      const response = await state.quick.command(grant.identityToken, { commandId: `${grant.displayName}-${guard}`, expectedRevision: match.game.revision,
        command: action.type === "PASS" ? { type: "PASS" } : { type: "PLACE", tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } });
      assert.equal(response.ok, true);
    }
    if (!acted) { state.clock.t = Math.max(state.clock.t + 100, view!.match!.clock.turnDeadline ?? state.clock.t); await state.quick.tick(); }
  }
  throw new Error("La partida no terminó");
}

describe("Parejas online: salas, Jugar ahora y liga", () => {
  test("la sala autoritativa juega a 200 por parejas y conserva la modalidad al restaurarse", async () => {
    const store = new MemoryMatchStore(); let t = 0; const options = { mode: "PAIRS" as const, now: () => t, botPlayerIds: SESSIONS.map((entry) => entry.playerId), clock: { ...DEFAULT_TURN_CLOCK, automaticDelayMs: 10, roundBreakMs: 10 } };
    const room = await AuthoritativeRoom.create("online-pairs", SESSIONS, factory(), store, options);
    assert.equal(room.state.mode, "PAIRS"); assert.equal(room.connect("secret-0")!.mode, "PAIRS");
    const restored = (await AuthoritativeRoom.restore("online-pairs", factory(), store, { now: () => t, clock: options.clock }))!; assert.equal(restored.state.mode, "PAIRS");
    for (let guard = 0; guard < 5_000 && restored.state.phase !== "MATCH_ENDED"; guard++) { t += 20; await restored.advance(); }
    const result = restored.state.matchResult!; assert.ok(result.championTeam); assert.equal(result.championTeam.length, 2);
    const [a, b] = result.championTeam; assert.equal(result.finalScores[a!], result.finalScores[b!]); assert.ok(result.finalScores[a!]! >= PAIRS_TARGET);
    const seats = result.championTeam.map((id) => restored.state.players.find((player) => player.playerId === id)!.seat);
    assert.equal(seats[0]! % 2, seats[1]! % 2);
    const sinModo = await AuthoritativeRoom.create("online-individual", SESSIONS, factory(), store); assert.equal(sinModo.state.mode, undefined);
  });

  test("una sala con código por parejas: los asientos 0 y 2 contra 1 y 3; por defecto sigue siendo individual", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-pairs-lobby-")); try {
      const lobbies = await LobbyManager.open(join(directory, "lobbies.json"), new JsonFileMatchStore(join(directory, "matches")));
      const host = await lobbies.create("Ana", "PAIRS"); const guests = [];
      assert.equal((await lobbies.view(host.code, host.sessionId))!.mode, "PAIRS");
      for (const name of ["Beto", "Cora", "Dani"]) guests.push(await lobbies.join(host.code, name));
      const view = (await lobbies.view(host.code, host.sessionId))!; assert.equal(view.status, "PLAYING"); assert.equal(view.game!.mode, "PAIRS");
      // Tras reiniciar el proceso, la sala recupera la partida por parejas.
      const reopened = await LobbyManager.open(join(directory, "lobbies.json"), new JsonFileMatchStore(join(directory, "matches")));
      assert.equal((await reopened.view(host.code, guests[1]!.sessionId))!.game!.mode, "PAIRS");
      const individual = await lobbies.create("Eva"); assert.equal((await lobbies.view(individual.code, individual.sessionId))!.mode, "INDIVIDUAL");
      await assert.rejects(() => lobbies.create("Fede", "TRIOS" as "PAIRS"), /INVALID_MODE/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("Jugar ahora mantiene una cola por modalidad: nunca mezcla individuales con parejas", async () => {
    const state = await setup(); try {
      const grants = await state.people("Ana", "Beto", "Cora", "Dani", "Eva", "Fede", "Gina");
      for (const grant of grants.slice(0, 3)) await state.quick.join(grant.identityToken, "PAIRS");
      const solo = await state.quick.join(grants[3]!.identityToken); assert.equal(solo.ticket!.mode, "INDIVIDUAL"); assert.equal(solo.ticket!.position, 1); assert.equal(solo.match, null);
      const third = await state.quick.view(grants[2]!.identityToken); assert.equal(third.ticket!.mode, "PAIRS"); assert.equal(third.ticket!.position, 3); assert.deepEqual(third.ticket!.waiting, ["Ana", "Beto", "Cora"]);
      // Pedir otra modalidad sin salir de la cola no duplica la plaza.
      assert.equal((await state.quick.join(grants[0]!.identityToken, "INDIVIDUAL")).ticket!.mode, "PAIRS"); assert.equal(state.quick.queueSize(), 4);
      const full = await state.quick.join(grants[4]!.identityToken, "PAIRS"); assert.ok(full.match); assert.equal(full.match!.mode, "PAIRS"); assert.equal(full.match!.game.mode, "PAIRS");
      assert.deepEqual(full.match!.seats.map((seat) => [seat.displayName, seat.seat, seat.bot]), [["Ana", 0, false], ["Beto", 1, false], ["Cora", 2, false], ["Eva", 3, false]]);
      assert.equal((await state.quick.view(grants[3]!.identityToken)).ticket!.mode, "INDIVIDUAL"); assert.equal(state.quick.queueSize(), 1);
      await assert.rejects(() => state.quick.join(grants[5]!.identityToken, "TRIOS" as "PAIRS"), /INVALID_MODE/);
    } finally { await state.close(); }
  });

  test("tras la espera, la mesa por parejas se completa con bots por orden de llegada y la partida termina a 200", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto"); const start = state.clock.t;
      await state.quick.join(ana!.identityToken, "PAIRS"); await state.quick.join(beto!.identityToken, "PAIRS");
      state.clock.t = start + DEFAULT_QUICK_PLAY.fillAfterMs; await state.quick.tick();
      const started = (await state.quick.view(ana!.identityToken)).match!;
      assert.deepEqual(started.seats.map((seat) => [seat.displayName, seat.bot]), [["Ana", false], ["Beto", false], ["Bot 1", true], ["Bot 2", true]]);
      assert.equal(started.game.mode, "PAIRS");
      const ended = await playOut(state, [ana!, beto!]); const result = ended.game.matchResult!;
      assert.ok(result.championTeam); assert.ok(result.finalScores[result.championTeam[0]!]! >= PAIRS_TARGET);
      const history = (await state.quick.historyFor(ana!.identityToken))[0]!; assert.equal(history.mode, "PAIRS");
      // Ana (asiento 0) y Beto (asiento 1) son rivales: cada uno con un bot de compañero.
      const anaWon = result.championTeam.includes(ana!.identityId); const award = (grant: TestIdentityGrant) => state.league.awardFor(ended.matchId, grant.identityId)!;
      assert.equal(award(anaWon ? ana! : beto!).points, 20); assert.equal(award(anaWon ? beto! : ana!).points, 5);
    } finally { await state.close(); }
  });

  test("liga por parejas con cuatro humanos: 40 a cada ganador y 10 a cada perdedor", async () => {
    const state = await setup(); try {
      const grants = await state.people("Ana", "Beto", "Cora", "Dani");
      for (const grant of grants) await state.quick.join(grant.identityToken, "PAIRS");
      const ended = await playOut(state, grants); const team = ended.game.matchResult!.championTeam!;
      for (const grant of grants) {
        const award = state.league.awardFor(ended.matchId, grant.identityId)!;
        assert.deepEqual([award.position, award.points], team.includes(grant.identityId) ? [1, 40] : [3, 10]);
      }
      const view = await state.league.view(grants[0]!.identityId); assert.deepEqual(view.top.map((row) => row.points).sort((a, b) => b - a), [40, 40, 10, 10]);
    } finally { await state.close(); }
  });

  test("HTTP: «Jugar ahora» acepta la modalidad en el cuerpo y sin cuerpo sigue siendo individual", async () => {
    const state = await setup(); const server = createDominoHttpServer(new RoomRegistry(), undefined, { competitionManager: state.identities, quickPlayManager: state.quick });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const [ana, beto] = await state.people("Ana", "Beto");
      const post = (token: string, body?: unknown) => fetch(`${base}/api/quick-play/join`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      assert.equal(((await (await post(ana!.identityToken, { mode: "PAIRS" })).json()) as QuickPlayView).ticket!.mode, "PAIRS");
      assert.equal(((await (await post(beto!.identityToken)).json()) as QuickPlayView).ticket!.mode, "INDIVIDUAL");
    } finally { server.close(); await state.close(); }
  });
});
