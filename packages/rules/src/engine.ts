import { DOUBLE_SIX_SET, TILE_BY_ID, pipTotal } from "./tiles.ts";
import {
  RULES_VERSION,
  type Command, type DomainEvent, type GameState, type LegalAction, type Player,
  type PlayerView, type RuleError, type Seat, type Side, type TileId, type Transition,
} from "./types.ts";

export interface PlayerInput { readonly playerId: string; readonly seat: Seat }
export type Deal = Readonly<Record<string, readonly TileId[]>>;

const fail = (state: GameState, code: RuleError["code"], message: string): Transition =>
  ({ ok: false, state, error: { code, message }, events: [] });

function validatePlayers(inputs: readonly PlayerInput[]): void {
  if (inputs.length !== 4 || new Set(inputs.map((p) => p.playerId)).size !== 4 ||
      new Set(inputs.map((p) => p.seat)).size !== 4 || inputs.some((p) => p.seat < 0 || p.seat > 3)) {
    throw Object.assign(new Error("Exactly four unique players and seats are required"), { code: "INVALID_CONFIGURATION" });
  }
}

export function validateDeal(players: readonly { playerId: string }[], deal: Deal): void {
  if (Object.keys(deal).length !== 4 || players.some((p) => !deal[p.playerId] || deal[p.playerId]!.length !== 7)) {
    throw Object.assign(new Error("Deal must contain seven tiles for every player"), { code: "INVALID_DEAL" });
  }
  const all = players.flatMap((p) => deal[p.playerId]!);
  const canonical = new Set(DOUBLE_SIX_SET.map((tile) => tile.id));
  if (all.length !== 28 || new Set(all).size !== 28 || all.some((id) => !canonical.has(id))) {
    throw Object.assign(new Error("Deal must be an exact double-six partition"), { code: "INVALID_DEAL" });
  }
}

function makeRound(base: { matchId: string; roundNumber: number; revision: number; players: readonly Player[] }, deal: Deal): GameState {
  validateDeal(base.players, deal);
  const opener = base.players.find((p) => deal[p.playerId]!.includes("6-6"));
  if (!opener) throw Object.assign(new Error("The opening tile is missing"), { code: "INVALID_DEAL" });
  const hands = Object.fromEntries(base.players.map((p) => [p.playerId, [...deal[p.playerId]!] as readonly TileId[]]));
  return {
    rulesVersion: RULES_VERSION, matchId: base.matchId, roundId: `${base.matchId}:r${base.roundNumber}`,
    roundNumber: base.roundNumber, revision: base.revision, phase: "ROUND_ACTIVE", players: base.players,
    hands, chain: [], leftEnd: null, rightEnd: null, openingPlayerId: opener.playerId,
    currentPlayerId: opener.playerId, consecutivePasses: 0, roundResult: null, matchResult: null,
  };
}

export function startMatch(matchId: string, inputs: readonly PlayerInput[], deal: Deal): { state: GameState; events: readonly DomainEvent[] } {
  validatePlayers(inputs);
  if (!matchId) throw Object.assign(new Error("matchId is required"), { code: "INVALID_CONFIGURATION" });
  const players = [...inputs].sort((a, b) => a.seat - b.seat).map((p) => ({ ...p, score: 0 }));
  const state = makeRound({ matchId, roundNumber: 1, revision: 1, players }, deal);
  return { state, events: [{ type: "MATCH_STARTED", matchId }, { type: "ROUND_STARTED", roundId: state.roundId, openingPlayerId: state.openingPlayerId }] };
}

export function nextRound(state: GameState, deal: Deal): { state: GameState; events: readonly DomainEvent[] } | { error: RuleError; state: GameState } {
  if (state.phase !== "ROUND_ENDED") return { state, error: { code: "WRONG_PHASE", message: "A new round requires ROUND_ENDED" } };
  try {
    const next = makeRound({ matchId: state.matchId, roundNumber: state.roundNumber + 1, revision: state.revision + 1, players: state.players }, deal);
    return { state: next, events: [{ type: "ROUND_STARTED", roundId: next.roundId, openingPlayerId: next.openingPlayerId }] };
  } catch (error) {
    return { state, error: { code: (error as { code?: RuleError["code"] }).code ?? "INVALID_DEAL", message: (error as Error).message } };
  }
}

export function nextSeat(seat: Seat): Seat { return ((seat + 3) % 4) as Seat; }
function nextPlayer(state: GameState, actorId: string): string {
  const actor = state.players.find((p) => p.playerId === actorId)!;
  return state.players.find((p) => p.seat === nextSeat(actor.seat))!.playerId;
}
function matches(id: TileId, end: number): boolean { const tile = TILE_BY_ID.get(id)!; return tile.a === end || tile.b === end; }

export function legalActions(state: GameState, actorId: string): readonly LegalAction[] {
  if (state.phase !== "ROUND_ACTIVE" || state.currentPlayerId !== actorId) return [];
  const hand = state.hands[actorId] ?? [];
  if (state.chain.length === 0) return hand.includes("6-6") ? [{ type: "PLACE", tileId: "6-6" }] : [];
  const actions: LegalAction[] = [];
  for (const id of hand) {
    if (matches(id, state.leftEnd!)) actions.push({ type: "PLACE", tileId: id, side: "LEFT" });
    if (matches(id, state.rightEnd!)) actions.push({ type: "PLACE", tileId: id, side: "RIGHT" });
  }
  return actions.length ? actions : [{ type: "PASS" }];
}

function totalsAndDeltas(state: GameState, winnerId: string | null, points: number) {
  return {
    totals: Object.fromEntries(state.players.map((p) => [p.playerId, pipTotal(state.hands[p.playerId]!)])),
    deltas: Object.fromEntries(state.players.map((p) => [p.playerId, p.playerId === winnerId ? points : 0])),
  };
}

function endRound(state: GameState, reason: "DOMINO" | "BLOCKED", winnerId: string | null, tiedPlayerIds: readonly string[]): { state: GameState; events: DomainEvent[] } {
  const points = reason === "DOMINO" ? 20 : 0;
  const { totals, deltas } = totalsAndDeltas(state, winnerId, points);
  const players = state.players.map((p) => ({ ...p, score: p.score + deltas[p.playerId]! }));
  const champion = players.find((p) => p.score >= 100);
  const roundResult = { reason, winnerId, tiedPlayerIds, handPipTotals: totals, scoreDeltas: deltas } as const;
  const finalScores = Object.fromEntries(players.map((p) => [p.playerId, p.score]));
  const ended: GameState = { ...state, players, phase: champion ? "MATCH_ENDED" : "ROUND_ENDED", currentPlayerId: null, roundResult,
    matchResult: champion ? { championId: champion.playerId, finalScores } : null };
  const events: DomainEvent[] = [
    { type: "ROUND_ENDED", roundId: state.roundId, reason, winnerId, tiedPlayerIds },
    { type: "SCORE_APPLIED", roundId: state.roundId, scoreDeltas: deltas },
  ];
  if (champion) events.push({ type: "MATCH_ENDED", championId: champion.playerId, finalScores });
  return { state: ended, events };
}

export function transition(state: GameState, command: Command): Transition {
  if (command.expectedRevision !== undefined && command.expectedRevision !== state.revision) return fail(state, "STALE_REVISION", "Revision does not match");
  if (state.phase !== "ROUND_ACTIVE") return fail(state, "WRONG_PHASE", "Round is not active");
  if (command.actorId !== state.currentPlayerId) return fail(state, "NOT_YOUR_TURN", "Actor does not own the turn");
  if (command.type === "PASS") {
    if (state.chain.length === 0 || legalActions(state, command.actorId).some((a) => a.type === "PLACE")) return fail(state, "PASS_FORBIDDEN", "A legal placement exists");
    const passes = state.consecutivePasses + 1;
    const passed: GameState = { ...state, consecutivePasses: passes, revision: state.revision + 1 };
    const events: DomainEvent[] = [{ type: "TURN_PASSED", actorId: command.actorId, consecutivePasses: passes }];
    if (passes === 4) {
      const totals = Object.fromEntries(state.players.map((p) => [p.playerId, pipTotal(state.hands[p.playerId]!) ]));
      const minimum = Math.min(...Object.values(totals));
      const tied = state.players.filter((p) => totals[p.playerId] === minimum).map((p) => p.playerId);
      const ended = endRound(passed, "BLOCKED", tied.length === 1 ? tied[0]! : null, tied.length > 1 ? tied : []);
      return { ok: true, state: ended.state, events: [...events, ...ended.events] };
    }
    const currentPlayerId = nextPlayer(state, command.actorId);
    return { ok: true, state: { ...passed, currentPlayerId }, events: [...events, { type: "TURN_CHANGED", currentPlayerId }] };
  }

  const hand = state.hands[command.actorId]!;
  if (!hand.includes(command.tileId)) return fail(state, "TILE_NOT_OWNED", "Tile is not in actor hand");
  if (state.chain.length === 0) {
    if (command.tileId !== "6-6" || command.side !== undefined) return fail(state, command.side !== undefined ? "INVALID_SIDE" : "INVALID_OPENING", "Opening must be 6-6 without a side");
  } else {
    if (command.side !== "LEFT" && command.side !== "RIGHT") return fail(state, "INVALID_SIDE", "LEFT or RIGHT is required");
    const end = command.side === "LEFT" ? state.leftEnd! : state.rightEnd!;
    if (!matches(command.tileId, end)) return fail(state, "TILE_DOES_NOT_MATCH", "Tile does not match selected end");
  }
  const tile = TILE_BY_ID.get(command.tileId)!;
  let left = tile.a; let right = tile.b;
  if (state.chain.length > 0 && command.side === "LEFT") { right = state.leftEnd!; left = tile.a === right ? tile.b : tile.a; }
  if (state.chain.length > 0 && command.side === "RIGHT") { left = state.rightEnd!; right = tile.a === left ? tile.b : tile.a; }
  const oriented = { id: command.tileId, left, right, playedBy: command.actorId };
  const chain = command.side === "LEFT" ? [oriented, ...state.chain] : [...state.chain, oriented];
  const hands = { ...state.hands, [command.actorId]: hand.filter((id) => id !== command.tileId) };
  const placed: GameState = { ...state, hands, chain, leftEnd: chain[0]!.left, rightEnd: chain[chain.length - 1]!.right,
    consecutivePasses: 0, revision: state.revision + 1 };
  const events: DomainEvent[] = [{ type: "TILE_PLACED", actorId: command.actorId, tile: oriented, side: command.side ?? null }];
  if (hands[command.actorId]!.length === 0) {
    const ended = endRound(placed, "DOMINO", command.actorId, []);
    return { ok: true, state: ended.state, events: [...events, ...ended.events] };
  }
  const currentPlayerId = nextPlayer(state, command.actorId);
  return { ok: true, state: { ...placed, currentPlayerId }, events: [...events, { type: "TURN_CHANGED", currentPlayerId }] };
}

export function getPlayerView(state: GameState, viewerId: string | null): PlayerView {
  const { hands, ...publicState } = state;
  return { ...publicState, ownHand: viewerId && hands[viewerId] ? hands[viewerId] : null,
    handCounts: Object.fromEntries(state.players.map((p) => [p.playerId, hands[p.playerId]!.length])) };
}

export function getRoundResult(state: GameState) { return state.roundResult; }
