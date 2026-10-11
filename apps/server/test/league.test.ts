import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { QuickPlayHistoryEntry, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { finalRanking } from "../../client/src/online-presentation.ts";
import {
  CompetitionManager, createDominoHttpServer, DEFAULT_LEAGUE, DEFAULT_TURN_CLOCK, finalPositions, JsonFileMatchStore, LeagueManager, leaguePoints, LobbyManager,
  QuickPlayManager, rankFor, RoomRegistry, seasonBounds, seasonIdAt,
} from "../src/index.ts";

const OCT_31_LATE = Date.UTC(2026, 10, 1, 4, 59); // 31 oct 23:59 en Bogotá (UTC−5)
const NOV_1 = Date.UTC(2026, 10, 1, 5); // 1 nov 00:00 en Bogotá
const FAST = { ...DEFAULT_TURN_CLOCK, turnMs: 50, automaticDelayMs: 10, roundBreakMs: 10, disconnectAutoMs: 60_000 };
let matchSequence = 0;
function entry(endedAt: number, people: ReadonlyArray<readonly [string, number, { bot?: boolean; automatic?: boolean }?]>): QuickPlayHistoryEntry {
  return { matchId: `m-${matchSequence++}`, startedAt: endedAt - 600_000, endedAt, championPlayerId: people[0]![0],
    participants: people.map(([name, score, flags], seat) => ({ playerId: flags?.bot ? `bot-${name}` : `id-${name}`, displayName: name, seat: seat as 0, bot: flags?.bot ?? false, score, endedAutomatic: flags?.automatic ?? false })) };
}
async function temp() { const directory = await mkdtemp(join(tmpdir(), "domino-league-")); return { directory, close: () => rm(directory, { recursive: true, force: true }) }; }

describe("Liga por temporadas", () => {
  test("puntos por posición multiplicados por humanos/4 y redondeados hacia abajo; 0 en modo automático", () => {
    assert.deepEqual([1, 2, 3, 4].map((position) => leaguePoints(position, 4, false)), [40, 20, 10, 4]);
    assert.deepEqual([1, 2, 3, 4].map((position) => leaguePoints(position, 3, false)), [30, 15, 7, 3]);
    assert.deepEqual([1, 2, 3, 4].map((position) => leaguePoints(position, 1, false)), [10, 5, 2, 1]);
    assert.equal(leaguePoints(1, 4, true), 0); assert.equal(leaguePoints(2, 2, true), 0);
    assert.deepEqual([0, 39, 40, 119, 120, 999, 1000, 5000].map((points) => rankFor(points)), ["DOUBLE_0", "DOUBLE_0", "DOUBLE_1", "DOUBLE_1", "DOUBLE_2", "DOUBLE_5", "DOUBLE_6", "DOUBLE_6"]);
  });

  test("los empates de posición siguen el mismo criterio que el resultado final (1, 2, 2, 4)", () => {
    const scores = { A: 100, B: 40, C: 40, D: 20 }; assert.deepEqual(finalPositions(scores), { A: 1, B: 2, C: 2, D: 4 });
    const players = Object.keys(scores).map((playerId, seat) => ({ playerId, seat: seat as 0, score: 0 }));
    const client = finalRanking(players, {}, { championId: "A", finalScores: scores });
    for (const row of client) assert.equal(row.rank, finalPositions(scores)[row.playerId]);
  });

  test("concede una sola vez por matchId ante repeticiones y reinicios; bots excluidos de la clasificación", async () => {
    const { directory, close } = await temp(); try {
      const clock = { t: Date.UTC(2026, 9, 12, 15) }; const path = join(directory, "league.json");
      let league = await LeagueManager.open(path, () => clock.t);
      const match = entry(clock.t, [["Bot 1", 100, { bot: true }], ["Ana", 60], ["Beto", 60, { automatic: true }], ["Bot 2", 20, { bot: true }]]);
      assert.deepEqual(await league.sync([match]), { awarded: 1, closed: 0 });
      for (let repeat = 0; repeat < 3; repeat++) assert.deepEqual(await league.sync([match, match]), { awarded: 0, closed: 0 });
      league = await LeagueManager.open(path, () => clock.t); assert.deepEqual(await league.sync([match]), { awarded: 0, closed: 0 });
      const view = await league.view("id-Ana");
      // Ana y Beto empatan en 2.º; dos humanos ⇒ factor 2/4. Beto terminó en modo automático ⇒ 0.
      assert.deepEqual(view.top.map(({ alias, points, position }) => [alias, points, position]), [["Ana", 10, 1], ["Beto", 0, 2]]);
      assert.equal(view.totalPlayers, 2); assert.equal(view.top.some((row) => row.alias.startsWith("Bot")), false);
      assert.deepEqual(league.awardFor(match.matchId, "id-Ana"), { matchId: match.matchId, seasonId: "2026-10", position: 2, basePoints: 20, humans: 2, automatic: false, points: 10,
        previousRank: "DOUBLE_0", newRank: "DOUBLE_0", promoted: false, awardedAt: clock.t });
      assert.equal(league.awardFor(match.matchId, "bot-Bot 1"), null);
      assert.deepEqual(Object.keys(view.top[0]!).sort(), ["alias", "points", "position", "rank", "viewer"]);
    } finally { await close(); }
  });

  test("temporada por mes en America/Bogota: cierre único con archivo, también tras reinicio", async () => {
    assert.equal(seasonIdAt(OCT_31_LATE), "2026-10"); assert.equal(seasonIdAt(NOV_1), "2026-11"); assert.equal(seasonBounds("2026-10").endsAt, NOV_1);
    assert.equal(seasonBounds("2026-12").endsAt, Date.UTC(2027, 0, 1, 5)); assert.equal(DEFAULT_LEAGUE.timeZone, "America/Bogota");
    const { directory, close } = await temp(); try {
      const clock = { t: OCT_31_LATE }; const path = join(directory, "league.json"); let league = await LeagueManager.open(path, () => clock.t);
      const october = [entry(OCT_31_LATE - 3_600_000, [["Ana", 100], ["Beto", 80], ["Cora", 40], ["Dani", 0]]), entry(OCT_31_LATE, [["Beto", 100], ["Ana", 20], ["Cora", 20], ["Dani", 0]])];
      await league.sync(october); const before = await league.view("id-Ana"); assert.equal(before.viewer!.points, 60); assert.equal(before.viewer!.rank, "DOUBLE_1"); assert.equal(before.daysLeft, 1);
      // Una partida que termina ya en noviembre se cuenta en noviembre, después de cerrar octubre.
      clock.t = NOV_1 + 60_000; const november = entry(NOV_1 + 30_000, [["Cora", 100], ["Ana", 0], ["Beto", 0], ["Dani", 0]]);
      league = await LeagueManager.open(path, () => clock.t); assert.deepEqual(await league.sync([...october, november]), { awarded: 1, closed: 1 });
      assert.deepEqual(await league.sync([...october, november]), { awarded: 0, closed: 0 }); league = await LeagueManager.open(path, () => clock.t);
      assert.deepEqual(await league.sync([]), { awarded: 0, closed: 0 }); assert.deepEqual(league.archivedSeasonIds(), ["2026-10"]);
      const now = await league.view("id-Ana"); assert.equal(now.season.id, "2026-11"); assert.equal(now.viewer!.points, 20);
      assert.deepEqual(now.top.map(({ alias, points }) => [alias, points]), [["Cora", 40], ["Ana", 20], ["Beto", 20], ["Dani", 20]]);
      const history = await league.historyFor("id-Beto");
      assert.deepEqual(history.seasons, [{ seasonId: "2026-10", label: "octubre de 2026", points: 60, position: 1, rank: "DOUBLE_1", totalPlayers: 4 }]);
      assert.equal(history.awards.length, 3);
      // Meses sin actividad tras un reinicio prolongado: cada cierre se archiva una vez.
      clock.t = Date.UTC(2027, 1, 10); league = await LeagueManager.open(path, () => clock.t); assert.deepEqual(await league.sync([]), { awarded: 0, closed: 3 });
      assert.deepEqual(league.archivedSeasonIds(), ["2026-10", "2026-11", "2026-12", "2027-01"]); assert.equal((await league.view(null)).totalPlayers, 0);
    } finally { await close(); }
  });

  test("ascenso de rango visible en la concesión", async () => {
    const { directory, close } = await temp(); try {
      const clock = { t: Date.UTC(2026, 9, 5) }; const league = await LeagueManager.open(join(directory, "league.json"), () => clock.t);
      await league.sync([entry(clock.t, [["Ana", 100], ["Beto", 0], ["Cora", 0], ["Dani", 0]])]);
      const second = entry(clock.t + 1, [["Ana", 100], ["Beto", 0], ["Cora", 0], ["Dani", 0]]); await league.sync([second]);
      const award = league.awardFor(second.matchId, "id-Ana")!; assert.equal(award.points, 40); assert.equal(award.previousRank, "DOUBLE_1"); assert.equal(award.newRank, "DOUBLE_1");
      const third = entry(clock.t + 2, [["Ana", 100], ["Beto", 0], ["Cora", 0], ["Dani", 0]]); await league.sync([third]);
      const promoted = league.awardFor(third.matchId, "id-Ana")!; assert.equal(promoted.promoted, true); assert.equal(promoted.newRank, "DOUBLE_2");
    } finally { await close(); }
  });

  test("Jugar ahora concede puntos al terminar; salas privadas (amigos y competición) no dan puntos; reconciliación tras caída", async () => {
    const { directory, close } = await temp(); try {
      const clock = { t: Date.UTC(2026, 9, 12, 15) }; const now = () => clock.t; const store = new JsonFileMatchStore(join(directory, "matches"));
      const identities = await CompetitionManager.open(join(directory, "economy.json"), store, now, undefined, FAST);
      const league = await LeagueManager.open(join(directory, "league.json"), now); identities.attachRanks((id) => league.rankOf(id));
      // Competición completa jugada solo por el reloj.
      const grants: TestIdentityGrant[] = []; for (const name of ["Ana", "Beto", "Cora", "Dani"]) grants.push(await identities.createIdentity(name));
      const code = (await identities.create(grants[0]!.identityToken)).code; for (const grant of grants.slice(1)) await identities.join(code, grant.identityToken);
      for (const grant of grants) await identities.accept(code, grant.identityToken, 1);
      let guard = 50_000; while ((await identities.view(code, grants[0]!.identityToken)).status === "PLAYING" && guard-- > 0) { clock.t += 60; await identities.tick(); await league.sync([]); }
      assert.equal((await identities.view(code, grants[0]!.identityToken)).status, "ENDED"); assert.ok((await identities.view(code, grants[0]!.identityToken)).ranks);
      // Sala entre amigos completa.
      const lobbies = await LobbyManager.open(join(directory, "lobbies.json"), store, now, FAST); const host = await lobbies.create("Eva");
      for (const name of ["Fede", "Gala", "Hugo"]) await lobbies.join(host.code, name);
      guard = 50_000; while ((await lobbies.view(host.code, host.sessionId))!.status === "PLAYING" && guard-- > 0) { clock.t += 60; await lobbies.tick(); }
      assert.equal((await lobbies.view(host.code, host.sessionId))!.status, "ENDED");
      assert.equal((await league.view(null)).totalPlayers, 0, "las salas privadas no puntúan");
      // Jugar ahora sin liga conectada (simula la caída entre ambos guardados) y reconciliación posterior.
      const quick = await QuickPlayManager.open(join(directory, "quick.json"), store, (token) => identities.identify(token), now, FAST);
      for (const grant of grants) await quick.join(grant.identityToken);
      guard = 50_000; while ((await quick.view(grants[0]!.identityToken)).match?.status === "PLAYING" && guard-- > 0) { clock.t += 60; await quick.tick(); }
      assert.equal(quick.historyEntries().length, 1); assert.equal((await league.view(null)).totalPlayers, 0);
      assert.deepEqual(await league.sync(quick.historyEntries()), { awarded: 1, closed: 0 }); assert.deepEqual(await league.sync(quick.historyEntries()), { awarded: 0, closed: 0 });
      assert.equal((await league.view(null)).totalPlayers, 4);
      // Con la liga conectada, la vista del resultado trae el desglose y la mesa el rango de cada humano.
      quick.attachLeague(league); for (const grant of grants) await quick.join(grant.identityToken);
      let view = (await quick.view(grants[0]!.identityToken)).match!; assert.deepEqual(Object.keys(view.ranks).sort(), grants.map((grant) => grant.identityId).sort());
      guard = 50_000; while (view.status === "PLAYING" && guard-- > 0) { clock.t += 60; await quick.tick(); view = (await quick.view(grants[0]!.identityToken)).match!; }
      assert.ok(view.league); assert.equal(view.league!.humans, 4); assert.equal(view.league!.automatic, true); assert.equal(view.league!.points, 0);
      assert.equal(quick.historyEntries().length, 2); assert.deepEqual(await league.sync(quick.historyEntries()), { awarded: 0, closed: 0 });
    } finally { await close(); }
  });

  test("el cliente no puede enviar ni alterar puntos, rango ni posición", async () => {
    const { directory, close } = await temp(); try {
      const store = new JsonFileMatchStore(join(directory, "matches")); const identities = await CompetitionManager.open(join(directory, "economy.json"), store);
      const league = await LeagueManager.open(join(directory, "league.json")); const quick = await QuickPlayManager.open(join(directory, "quick.json"), store, (token) => identities.identify(token));
      quick.attachLeague(league); const server = createDominoHttpServer(new RoomRegistry(), undefined, { competitionManager: identities, quickPlayManager: quick, leagueManager: league });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      try {
        const ana = await identities.createIdentity("Ana"); const auth = { authorization: `Bearer ${ana.identityToken}`, "content-type": "application/json" };
        for (const path of ["/api/league", "/api/league/history"]) assert.equal((await fetch(`${base}${path}`, { method: "POST", headers: auth, body: JSON.stringify({ points: 9_999, rank: "DOUBLE_6", position: 1 }) })).status, 405);
        assert.equal((await fetch(`${base}/api/league`, { headers: { authorization: "Bearer falso" } })).status, 401);
        assert.equal((await fetch(`${base}/api/league/history`)).status, 401);
        await fetch(`${base}/api/quick-play/join`, { method: "POST", headers: auth, body: JSON.stringify({ points: 9_999, rank: "DOUBLE_6", bot: false }) });
        const forged = await fetch(`${base}/api/quick-play/commands`, { method: "POST", headers: auth, body: JSON.stringify({ commandId: "x", expectedRevision: 0, command: { type: "PASS" }, points: 9_999 }) });
        assert.equal(forged.status, 409);
        const view = await (await fetch(`${base}/api/league`, { headers: auth })).json() as { viewer: { points: number; rank: string; position: number | null }; totalPlayers: number };
        assert.deepEqual({ points: view.viewer.points, rank: view.viewer.rank, position: view.viewer.position, total: view.totalPlayers }, { points: 0, rank: "DOUBLE_0", position: null, total: 0 });
        const anonymous = await (await fetch(`${base}/api/league`)).json() as { viewer: unknown }; assert.equal(anonymous.viewer, null);
      } finally { await new Promise((resolve) => server.close(resolve)); }
    } finally { await close(); }
  });
});
