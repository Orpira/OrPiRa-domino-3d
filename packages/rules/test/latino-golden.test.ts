import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  DOUBLE_SIX_SET, legalActions, nextRound, startMatch, transition,
  type Command, type Deal, type GameMode, type GameState, type TileId,
} from "../src/index.ts";
import { PLAYERS, randomFor } from "./helpers.ts";

/**
 * Comportamiento congelado del dominó latino (individual y parejas) antes de separar las reglas por modalidad.
 * Cada partida es determinista: reparto, elección de jugada e intentos inválidos salen de una semilla.
 * Se compara una huella SHA-256 de cada estado, evento y error. Regenerar solo a propósito: UPDATE_GOLDEN=1.
 */
const FIXTURE = new URL("./fixtures/latino-golden.json", import.meta.url);
const SEEDS = 30;

function deal(seed: number): Deal {
  const ids = DOUBLE_SIX_SET.map((tile) => tile.id); const random = randomFor(seed);
  for (let index = ids.length - 1; index > 0; index--) { const target = Math.floor(random() * (index + 1)); [ids[index], ids[target]] = [ids[target]!, ids[index]!]; }
  return Object.fromEntries(PLAYERS.map((player, index) => [player.playerId, ids.slice(index * 7, index * 7 + 7)]));
}

function play(seed: number, mode: GameMode) {
  const random = randomFor(seed * 7919 + (mode === "PAIRS" ? 1 : 0)); const hash = createHash("sha256");
  const record = (label: string, value: unknown) => hash.update(`${label}:${JSON.stringify(value)}\n`);
  let round = 0; let state: GameState = startMatch(`golden-${mode}-${seed}`, PLAYERS, deal(seed * 100), { mode }).state; record("start", state);
  const errors: Record<string, number> = {}; let steps = 0;
  const attempt = (command: Command) => {
    const result = transition(state, command); record("command", command);
    if (!result.ok) { errors[result.error.code] = (errors[result.error.code] ?? 0) + 1; record("error", result.error); assert.equal(result.state, state); return; }
    record("events", result.events); record("state", result.state); state = result.state;
  };
  while (state.phase !== "MATCH_ENDED" && steps++ < 5_000) {
    if (state.phase === "ROUND_ENDED") { const next = nextRound(state, deal(seed * 100 + ++round)); assert.ok(!("error" in next)); record("round", next.state); state = next.state; continue; }
    const actor = state.currentPlayerId!; const actions = legalActions(state, actor); record("legal", actions);
    // Intentos inválidos intercalados: turno ajeno, ficha ajena, lado que no encaja, pase prohibido y revisión vieja.
    const probe = Math.floor(random() * 10);
    const other = PLAYERS.find((player) => player.playerId !== actor)!.playerId; const foreign = state.hands[other]![0];
    if (probe === 0) attempt({ type: "PASS", actorId: other, expectedRevision: state.revision });
    if (probe === 1 && foreign) attempt({ type: "PLACE", actorId: actor, tileId: foreign, side: "LEFT" });
    if (probe === 2) for (const tileId of state.hands[actor]!) for (const side of ["LEFT", "RIGHT"] as const) if (!actions.some((action) => action.tileId === tileId && action.side === side)) { attempt({ type: "PLACE", actorId: actor, tileId, side }); break; }
    if (probe === 3 && actions.some((action) => action.type === "PLACE")) attempt({ type: "PASS", actorId: actor });
    if (probe === 4) attempt({ type: "PLACE", actorId: actor, tileId: state.hands[actor]![0] as TileId, expectedRevision: state.revision - 1 });
    if (probe === 6 && state.chain.length === 0) { const wrong = state.hands[actor]!.find((tileId) => tileId !== "6-6"); if (wrong) attempt({ type: "PLACE", actorId: actor, tileId: wrong }); }
    if (probe === 5 && state.chain.length === 0) attempt({ type: "PLACE", actorId: actor, tileId: state.hands[actor]![0] as TileId, side: "RIGHT" });
    const action = actions[Math.floor(random() * actions.length)]!;
    attempt(action.type === "PASS" ? { type: "PASS", actorId: actor, expectedRevision: state.revision }
      : { type: "PLACE", actorId: actor, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}), expectedRevision: state.revision });
  }
  assert.equal(state.phase, "MATCH_ENDED");
  return { mode, seed, rounds: state.roundNumber, finalScores: state.matchResult!.finalScores, champion: state.matchResult!.championId, errors, digest: hash.digest("hex") };
}

describe("Latino congelado (golden master)", () => {
  test(`${SEEDS} partidas individuales y ${SEEDS} por parejas reproducen exactamente estados, eventos y errores`, () => {
    const runs = (["INDIVIDUAL", "PAIRS"] as const).flatMap((mode) => Array.from({ length: SEEDS }, (_, index) => play(index + 1, mode)));
    if (process.env.UPDATE_GOLDEN === "1") { writeFileSync(FIXTURE, `${JSON.stringify(runs, null, 1)}\n`); return; }
    const golden = JSON.parse(readFileSync(FIXTURE, "utf8")) as typeof runs;
    assert.equal(runs.length, golden.length);
    runs.forEach((run, index) => assert.deepEqual(run, golden[index], `${run.mode} semilla ${run.seed}`));
    // La muestra cubre los finales y errores que importan.
    const codes = new Set(runs.flatMap((run) => Object.keys(run.errors)));
    for (const code of ["INVALID_OPENING", "INVALID_SIDE", "NOT_YOUR_TURN", "TILE_NOT_OWNED", "TILE_DOES_NOT_MATCH", "PASS_FORBIDDEN", "STALE_REVISION"]) assert.ok(codes.has(code), code);
  });
});
