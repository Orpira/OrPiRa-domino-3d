import { DOUBLE_SIX_SET, legalActions, startMatch, transition, type Deal, type GameState, type PlayerInput, type TileId } from "../src/index.ts";

export const PLAYERS: readonly PlayerInput[] = [
  { playerId: "P0", seat: 0 }, { playerId: "P1", seat: 1 },
  { playerId: "P2", seat: 2 }, { playerId: "P3", seat: 3 },
];

export function randomFor(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 0x1_0000_0000; };
}

export function dealFor(seed: number): Deal {
  const ids = DOUBLE_SIX_SET.map((tile) => tile.id);
  const random = randomFor(seed);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  }
  return Object.fromEntries(PLAYERS.map((p, index) => [p.playerId, ids.slice(index * 7, index * 7 + 7)]));
}

export function dealWithHands(hands: readonly (readonly TileId[])[]): Deal {
  return Object.fromEntries(PLAYERS.map((p, index) => [p.playerId, hands[index]!]));
}

export function autoplay(seed: number, chooser: (state: GameState, actions: ReturnType<typeof legalActions>) => number = () => 0): GameState {
  let state = startMatch(`auto-${seed}`, PLAYERS, dealFor(seed)).state;
  let guard = 200;
  while (state.phase === "ROUND_ACTIVE" && guard-- > 0) {
    const actorId = state.currentPlayerId!;
    const actions = legalActions(state, actorId);
    const action = actions[chooser(state, actions)] ?? actions[0]!;
    const result = action.type === "PASS"
      ? transition(state, { type: "PASS", actorId })
      : transition(state, { type: "PLACE", actorId, tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    state = result.state;
  }
  if (guard <= 0) throw new Error("Autoplay guard exhausted");
  return state;
}

export function findFinished(predicate: (state: GameState) => boolean, limit = 20_000): { seed: number; state: GameState } {
  for (let seed = 1; seed <= limit; seed += 1) {
    const state = autoplay(seed);
    if (predicate(state)) return { seed, state };
  }
  throw new Error(`No matching valid game in ${limit} seeds`);
}
