import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { legalActions, type GameState, type LegalAction } from "../../../packages/rules/src/index.ts";
import type { CommandEnvelope, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { dealFor, PLAYERS } from "../../../packages/rules/test/helpers.ts";
import { AuthoritativeRoom, chooseAutomaticAction, CompetitionManager, DEFAULT_TURN_CLOCK, JsonFileMatchStore, MemoryMatchStore, type SessionPlayer } from "../src/index.ts";

const SESSIONS: readonly SessionPlayer[] = PLAYERS.map((player) => ({ ...player, sessionId: `session-${player.playerId}` }));
const sessionOf = (playerId: string) => `session-${playerId}`;
let deals = 0; const nextDeal = () => dealFor(100 + deals++);
const same = (left: LegalAction, right: LegalAction) => left.type === right.type && left.tileId === right.tileId && left.side === right.side;
const commandFor = (action: LegalAction): CommandEnvelope["command"] => action.type === "PASS" ? { type: "PASS" } : { type: "PLACE", tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) };
let ids = 0; const envelope = (state: GameState, command: CommandEnvelope["command"]): CommandEnvelope => ({ commandId: `c-${ids++}`, expectedRevision: state.revision, command });
async function room(clock: { t: number }, store = new MemoryMatchStore(), matchId = `clock-${ids++}`, config = DEFAULT_TURN_CLOCK) {
  return { store, room: await AuthoritativeRoom.create(matchId, SESSIONS, nextDeal, store, { now: () => clock.t, clock: config }), matchId };
}
// Jugada legal del jugador en turno (o NEXT_ROUND), enviada por su propia sesión.
async function playOwnTurn(target: AuthoritativeRoom) {
  const state = target.state;
  if (state.phase === "ROUND_ENDED") return target.submit(sessionOf(PLAYERS[0]!.playerId), envelope(state, { type: "NEXT_ROUND" }));
  const actor = state.currentPlayerId!; return target.submit(sessionOf(actor), envelope(state, commandFor(legalActions(state, actor)[0]!)));
}

describe("reloj de turno autoritativo y jugador automático", () => {
  test("el jugador automático es determinista con la semilla y siempre elige una acción legal", async () => {
    const clock = { t: 0 }; const { room: target } = await room(clock); const state = target.state; const actor = state.currentPlayerId!;
    const first = chooseAutomaticAction(state, actor, "semilla"); assert.ok(same(first, chooseAutomaticAction(state, actor, "semilla")));
    assert.ok(legalActions(state, actor).some((action) => same(action, first)));
    assert.throws(() => chooseAutomaticAction(state, PLAYERS.find((player) => player.playerId !== actor)!.playerId, "semilla"), /NOT_AUTOMATIC_TURN/);
  });

  test("al agotarse el turno el servidor juega una acción legal y la marca como automática; una partida sin nadie termina", async () => {
    const clock = { t: 0 }; const { room: target } = await room(clock);
    const first = target.clockView(); assert.equal(first.turnDeadline, DEFAULT_TURN_CLOCK.turnMs); assert.equal(first.deadlineKind, "TURN");
    clock.t = DEFAULT_TURN_CLOCK.turnMs - 1; assert.equal(await target.advance(), false); assert.equal(target.clockView().automaticMoves.length, 0);
    let automatic = 0; let guard = 20_000;
    while (target.state.phase !== "MATCH_ENDED" && guard-- > 0) {
      const before = target.state; const deadline = target.clockView().turnDeadline!; clock.t = Math.max(clock.t, deadline);
      assert.equal(await target.advance(), true);
      if (before.phase === "ROUND_ACTIVE") {
        const move = target.clockView().automaticMoves.at(-1)!; automatic++;
        assert.equal(move.playerId, before.currentPlayerId); assert.equal(move.revision, before.revision);
        assert.ok(legalActions(before, move.playerId).some((action) => same(action, { type: move.action, ...(move.tileId ? { tileId: move.tileId } : {}), ...(move.side ? { side: move.side } : {}) })), "jugada automática ilegal");
        if (automatic === 1) assert.equal(move.reason, "TIMEOUT");
      }
    }
    assert.ok(guard > 0); assert.equal(target.state.phase, "MATCH_ENDED"); assert.ok(target.state.matchResult); assert.ok(automatic > 20);
    assert.equal(target.clockView().turnDeadline, null); assert.deepEqual([...target.automaticPlayerIds()].sort(), PLAYERS.map((player) => player.playerId).sort());
  });

  test("dos turnos agotados seguidos activan el modo automático y el jugador recupera el control desde su siguiente turno", async () => {
    const clock = { t: 0 }; const { room: target } = await room(clock); const absent = target.state.currentPlayerId!; const seat = () => target.clockView().seats.find((entry) => entry.playerId === absent)!;
    const untilTurnOf = async (playerId: string) => { let guard = 200; while ((target.state.phase !== "ROUND_ACTIVE" || target.state.currentPlayerId !== playerId) && guard-- > 0) { clock.t += 100; target.connect(sessionOf(absent)); assert.equal((await playOwnTurn(target)).ok, true); } };
    for (let timeout = 1; timeout <= 2; timeout++) {
      target.connect(sessionOf(absent)); clock.t = target.clockView().turnDeadline!; await target.advance();
      assert.equal(target.clockView().automaticMoves.at(-1)!.reason, "TIMEOUT"); assert.equal(seat().consecutiveTimeouts, timeout); assert.equal(seat().automatic, timeout === 2);
      await untilTurnOf(absent);
    }
    // En modo automático no espera los 30 s: juega tras la breve pausa configurada.
    assert.ok(target.clockView().turnDeadline! - clock.t <= DEFAULT_TURN_CLOCK.automaticDelayMs);
    const resume = await target.submit(sessionOf(absent), envelope(target.state, { type: "RESUME_CONTROL" })); assert.equal(resume.ok, true);
    assert.equal(seat().resumeRequested, true); assert.equal(seat().automatic, true);
    clock.t = target.clockView().turnDeadline!; await target.advance(); assert.equal(target.clockView().automaticMoves.at(-1)!.reason, "AUTO_MODE");
    await untilTurnOf(absent);
    assert.equal(seat().automatic, false); assert.equal(seat().resumeRequested, false); assert.equal(seat().consecutiveTimeouts, 0);
    assert.equal(target.clockView().turnDeadline! - clock.t, DEFAULT_TURN_CLOCK.turnMs);
    assert.equal((await target.submit(sessionOf(absent), envelope(target.state, { type: "RESUME_CONTROL" }))).ok, false);
  });

  test("la ausencia prolongada activa el modo automático aunque no haya agotado turnos", async () => {
    // Umbral de desconexión menor que el turno para distinguirlo de los dos turnos agotados.
    const clock = { t: 0 }; const config = { ...DEFAULT_TURN_CLOCK, disconnectAutoMs: 10_000 };
    const { room: target } = await room(clock, new MemoryMatchStore(), `clock-${ids++}`, config);
    const absent = PLAYERS.find((player) => player.playerId !== target.state.currentPlayerId)!.playerId; const seat = () => target.clockView().seats.find((entry) => entry.playerId === absent)!;
    clock.t = 9_999; for (const player of PLAYERS) if (player.playerId !== absent) target.connect(sessionOf(player.playerId));
    await target.advance(); assert.equal(seat().automatic, false);
    clock.t = 10_000; for (const player of PLAYERS) if (player.playerId !== absent) target.connect(sessionOf(player.playerId));
    await target.advance(); assert.equal(seat().automatic, true); assert.equal(seat().consecutiveTimeouts, 0); assert.equal(seat().connected, false);
    for (const player of PLAYERS) if (player.playerId !== absent) assert.equal(target.clockView().seats.find((entry) => entry.playerId === player.playerId)!.automatic, false);
    // Volver a conectarse no basta: recuperar el control es una petición explícita.
    target.connect(sessionOf(absent)); assert.equal(seat().automatic, true); assert.equal(seat().connected, true);
  });

  test("el reloj sobrevive a un reinicio y se recalcula desde la hora límite guardada", async () => {
    const clock = { t: 1_000 }; const { room: original, store, matchId } = await room(clock); const deadline = original.clockView().turnDeadline!; const revision = original.state.revision;
    clock.t = 20_000; const restored = (await AuthoritativeRoom.restore(matchId, nextDeal, store, { now: () => clock.t }))!;
    assert.equal(restored.clockView().turnDeadline, deadline); assert.equal(await restored.advance(), false);
    clock.t = deadline - 1; assert.equal(await restored.advance(), false); assert.equal(restored.state.revision, revision);
    clock.t = deadline; assert.equal(await restored.advance(), true); assert.equal(restored.clockView().automaticMoves.at(-1)!.reason, "TIMEOUT");
    // Si el plazo venció durante la caída, la primera pasada juega por ese asiento, una sola vez.
    const second = (await AuthoritativeRoom.restore(matchId, nextDeal, store, { now: () => clock.t }))!; const pending = second.clockView().turnDeadline!;
    clock.t = pending + 120_000; const later = (await AuthoritativeRoom.restore(matchId, nextDeal, store, { now: () => clock.t }))!;
    const beforeRevision = later.state.revision; assert.equal(await later.advance(), true); assert.equal(later.state.revision, beforeRevision + 1);
    assert.equal(later.clockView().seats.every((seat) => seat.connected), true, "el reinicio no cuenta como desconexión");
  });

  test("el cliente no puede alargar su turno ni jugar fuera de él", async () => {
    const clock = { t: 0 }; const { room: target } = await room(clock); const state = target.state; const actor = state.currentPlayerId!; const deadline = target.clockView().turnDeadline!;
    const other = PLAYERS.find((player) => player.playerId !== actor)!.playerId;
    const outOfTurn = await target.submit(sessionOf(other), envelope(state, commandFor(legalActions(state, actor)[0]!))); assert.equal(outOfTurn.ok, false);
    assert.equal(outOfTurn.ok === false && outOfTurn.code, "NOT_YOUR_TURN");
    assert.equal((await target.submit(sessionOf(actor), envelope(state, { type: "RESUME_CONTROL" }))).ok, false);
    assert.equal((await target.submit(sessionOf(actor), { ...envelope(state, { type: "PASS" }), expectedRevision: state.revision + 50 })).ok, false);
    assert.equal(target.clockView().turnDeadline, deadline, "comandos rechazados no cambian la hora límite");
    // Una jugada legal enviada después de la hora límite llega tarde: el servidor ya jugó por ese asiento.
    clock.t = deadline + 1; const late = await target.submit(sessionOf(actor), envelope(state, commandFor(legalActions(state, actor)[0]!)));
    assert.equal(late.ok, false); assert.equal(target.clockView().automaticMoves.at(-1)!.playerId, actor); assert.equal(target.state.revision, state.revision + 1);
  });

  test("competición: un asiento ausente desde el inicio no bloquea, la partida termina y liquida una sola vez", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-clock-competition-")); const clock = { t: 0 };
    try {
      const open = () => CompetitionManager.open(join(directory, "economy.json"), new JsonFileMatchStore(join(directory, "matches")), () => clock.t);
      let manager = await open(); const grants: TestIdentityGrant[] = [];
      for (const name of ["Ana", "Beto", "Cora", "Dani"]) grants.push(await manager.createIdentity(name));
      const code = (await manager.create(grants[0]!.identityToken)).code; for (const grant of grants.slice(1)) await manager.join(code, grant.identityToken);
      for (const grant of grants) await manager.accept(code, grant.identityToken, 1);
      const absent = grants[3]!; const present = grants.slice(0, 3); let restarted = false; let guard = 20_000;
      let view = await manager.view(code, present[0]!.identityToken); assert.ok(view.clock!.seats.every((seat) => !seat.bot), "nunca hay bots en competición");
      while (view.status === "PLAYING" && guard-- > 0) {
        clock.t += 200; const game = view.game!;
        for (const grant of present) await manager.view(code, grant.identityToken);
        const current = present.find((grant) => grant.identityId === game.currentPlayerId);
        if (game.phase === "ROUND_ACTIVE" && current) {
          const own = await manager.view(code, current.identityToken);
          await manager.command(code, current.identityToken, { commandId: `p-${guard}`, expectedRevision: own.game!.revision, command: commandFor(own.legalActions[0]!) });
        } else { clock.t = Math.max(clock.t, view.clock!.turnDeadline!); await manager.tick(); }
        if (!restarted && game.roundNumber >= 2) { manager = await open(); restarted = true; }
        view = await manager.view(code, present[0]!.identityToken);
      }
      assert.ok(guard > 0); assert.equal(view.status, "ENDED"); assert.deepEqual(view.settlement!.automaticIdentityIds, [absent.identityId]); assert.ok(restarted);
      for (let extra = 0; extra < 5; extra++) { clock.t += 60_000; await manager.tick(); }
      manager = await open(); const accounts = await Promise.all(grants.map((grant) => manager.account(grant.identityToken)));
      assert.equal(accounts.flatMap((account) => account.movements).filter((entry) => entry.kind === "PRIZE_AWARDED").length, 1);
      assert.equal(accounts.reduce((total, account) => total + account.available + account.reserved, 0), 400_000);
      for (const account of accounts) assert.equal(account.reserved, 0);
      const absentAccount = accounts[3]!; assert.equal(absentAccount.results[0]!.viewerAutomatic, true); assert.deepEqual(absentAccount.results[0]!.automaticNames, ["Dani"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
