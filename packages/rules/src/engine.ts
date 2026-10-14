import { DOUBLE_SIX_SET, TILE_BY_ID, pipTotal } from "./tiles.ts";
import {
  RULES_VERSION, TARGET_OPTIONS,
  type Command, type DomainEvent, type GameMode, type GameState, type LegalAction, type OrientedTile, type Player,
  type PlayerView, type RuleError, type RulesId, type Seat, type Side, type TargetScore, type TileId, type Transition,
} from "./types.ts";

export interface PlayerInput { readonly playerId: string; readonly seat: Seat }
export type Deal = Readonly<Record<string, readonly TileId[]>>;
export interface MatchOptions { readonly mode?: GameMode; readonly rules?: RulesId; readonly targetScore?: TargetScore }

export const INDIVIDUAL_TARGET = 100; export const PAIRS_TARGET = 200;
export function isPairs(state: Pick<GameState, "mode">): boolean { return state.mode === "PAIRS"; }
export function rulesId(state: Pick<GameState, "rules">): RulesId { return state.rules ?? "LATINO"; }
export function targetScore(state: Pick<GameState, "mode" | "targetScore">): number { return state.targetScore ?? (isPairs(state) ? PAIRS_TARGET : INDIVIDUAL_TARGET); }
/** Pareja de un jugador (él y quien se sienta enfrente), ordenada por asiento. En individual, solo él. */
export function teamOf(state: Pick<GameState, "mode" | "players">, playerId: string): readonly string[] {
  const player = state.players.find((candidate) => candidate.playerId === playerId); if (!player) return [];
  if (!isPairs(state)) return [playerId];
  return state.players.filter((candidate) => candidate.seat % 2 === player.seat % 2).map((candidate) => candidate.playerId);
}
export function partnerOf(state: Pick<GameState, "mode" | "players">, playerId: string): string | null {
  return isPairs(state) ? teamOf(state, playerId).find((id) => id !== playerId) ?? null : null;
}
/** En parejas, desde la segunda mano sale quien ganó la anterior con la ficha que quiera. */
export function freeOpening(state: Pick<GameState, "mode" | "roundNumber">): boolean { return isPairs(state) && state.roundNumber > 1; }

const fail = (state: GameState, code: RuleError["code"], message: string): Transition =>
  ({ ok: false, state, error: { code, message }, events: [] });
type HandEnd = { state: GameState; events: DomainEvent[] };

/**
 * Reglas de una modalidad. El motor común valida turno, revisión y fase, coloca fichas y aplica lo que la modalidad decida.
 * Cada modalidad decide reparto, salida, qué se puede jugar, qué pasa si no se puede, la puntuación y el final de la mano.
 */
export interface RuleSet {
  readonly id: RulesId;
  /** Manos y pozo de una mano a partir de un reparto 4×7 ya barajado. */
  deal(players: readonly Player[], deal: Deal): { readonly hands: Readonly<Record<string, readonly TileId[]>>; readonly boneyard: readonly TileId[] | null };
  /** Quién sale y con qué ficha (`null`: la que quiera). `openerId` es quien ganó la mano anterior, si la hubo. */
  opening(state: Pick<GameState, "mode" | "roundNumber" | "players" | "hands">, openerId?: string): { readonly playerId: string; readonly tileId: TileId | null } | null;
  /** Colocaciones legales con la cadena ya empezada. */
  canPlay(state: GameState, actorId: string): readonly LegalAction[];
  /** Qué hace quien no puede colocar: pasar o robar del pozo. */
  onCannotPlay(state: GameState, actorId: string): "PASS" | "DRAW";
  /** Puntos que se ganan durante la mano tras una colocación (ninguno en Latino ni con robo). */
  scoreDuringHand(state: GameState, actorId: string): Readonly<Record<string, number>> | null;
  /** La mano terminó por dominada (mano vacía) o tranque (cuatro pases seguidos). */
  isHandOver(state: GameState, actorId: string): "DOMINO" | "BLOCKED" | null;
  /** Cierra la mano: puntúa, decide si hay campeón y emite los eventos. */
  scoreEndOfHand(state: GameState, reason: "DOMINO" | "BLOCKED", actorId: string): HandEnd;
  targetScore(state: Pick<GameState, "mode" | "targetScore">): number;
  /** Valores de los extremos abiertos de la cadena. */
  openEnds(state: GameState): readonly number[];
}

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

function matches(id: TileId, end: number): boolean { const tile = TILE_BY_ID.get(id)!; return tile.a === end || tile.b === end; }

/** Tablero: la cadena (izquierda–derecha) y, en All Fives, el spinner con sus brazos UP y DOWN. */
export type Board = Pick<GameState, "chain" | "leftEnd" | "rightEnd" | "spinnerId" | "up" | "down">;
const isDoubleTile = (tile: OrientedTile) => tile.left === tile.right;
/** Los brazos del spinner se abren cuando ya tiene fichas a izquierda y derecha. */
export function armsOpen(board: Pick<Board, "chain" | "spinnerId">): boolean {
  if (!board.spinnerId) return false; const index = board.chain.findIndex((tile) => tile.id === board.spinnerId); return index > 0 && index < board.chain.length - 1;
}
/** Valor del extremo abierto por ese lado; `null` si ese extremo no existe (brazos cerrados o cadena vacía). */
export function endValue(board: Board, side: Side): number | null {
  if (side === "LEFT") return board.leftEnd; if (side === "RIGHT") return board.rightEnd;
  if (!armsOpen(board)) return null;
  const arm = (side === "UP" ? board.up : board.down) ?? []; return arm.length ? arm.at(-1)!.right : TILE_BY_ID.get(board.spinnerId!)!.a;
}
/**
 * Suma de los extremos abiertos (All Fives). Un doble en un extremo cuenta sus dos mitades; un brazo vacío no cuenta.
 * Con una sola ficha en la mesa se suman sus dos mitades (5–5 suma 10; 6–4, también 10).
 */
export function openEndsTotal(board: Board): number {
  const { chain } = board; if (chain.length === 0) return 0;
  if (chain.length === 1) return chain[0]!.left + chain[0]!.right;
  const outer = (tile: OrientedTile, value: number) => isDoubleTile(tile) ? value * 2 : value;
  let total = outer(chain[0]!, chain[0]!.left) + outer(chain.at(-1)!, chain.at(-1)!.right);
  if (armsOpen(board)) for (const arm of [board.up ?? [], board.down ?? []]) if (arm.length) total += outer(arm.at(-1)!, arm.at(-1)!.right);
  return total;
}
/** Puntos de All Fives que da el tablero: la suma de extremos si es múltiplo de 5 (y mayor que 0). */
export function fivesPoints(board: Board): number { const total = openEndsTotal(board); return total > 0 && total % 5 === 0 ? total : 0; }
/**
 * Coloca una ficha ya validada y devuelve solo los campos del tablero que cambian (para combinarlos con el estado).
 * En Latino y con robo son `chain`, `leftEnd` y `rightEnd`, en el mismo orden de siempre. Con `spinners`, el primer doble
 * jugado pasa a ser el spinner.
 */
export function placeOnBoard(board: Board, tileId: TileId, side: Side | undefined, actorId: string, spinners: boolean): { readonly board: Partial<Board>; readonly tile: OrientedTile } {
  const tile = TILE_BY_ID.get(tileId)!; let left = tile.a; let right = tile.b;
  if (board.chain.length > 0 && side === "LEFT") { right = board.leftEnd!; left = tile.a === right ? tile.b : tile.a; }
  if (board.chain.length > 0 && side === "RIGHT") { left = board.rightEnd!; right = tile.a === left ? tile.b : tile.a; }
  if (side === "UP" || side === "DOWN") { left = endValue(board, side)!; right = tile.a === left ? tile.b : tile.a; }
  const oriented = { id: tileId, left, right, playedBy: actorId };
  if (side === "UP" || side === "DOWN") {
    const key = side === "UP" ? "up" : "down";
    return { board: { [key]: [...(board[key] ?? []), oriented] }, tile: oriented };
  }
  const chain = side === "LEFT" ? [oriented, ...board.chain] : [...board.chain, oriented];
  const spinner = spinners && !board.spinnerId && tile.a === tile.b ? { spinnerId: tileId, up: [], down: [] } : {};
  return { board: { chain, leftEnd: chain[0]!.left, rightEnd: chain[chain.length - 1]!.right, ...spinner }, tile: oriented };
}
function placementsAtEnds(state: GameState, actorId: string): LegalAction[] {
  const actions: LegalAction[] = [];
  for (const id of state.hands[actorId] ?? []) {
    if (matches(id, state.leftEnd!)) actions.push({ type: "PLACE", tileId: id, side: "LEFT" });
    if (matches(id, state.rightEnd!)) actions.push({ type: "PLACE", tileId: id, side: "RIGHT" });
  }
  return actions;
}
function handOverByHandOrPasses(state: GameState, actorId: string): "DOMINO" | "BLOCKED" | null {
  return state.hands[actorId]!.length === 0 ? "DOMINO" : state.consecutivePasses === 4 ? "BLOCKED" : null;
}
const twoEnds = (state: GameState): readonly number[] => state.leftEnd === null ? [] : [state.leftEnd, state.rightEnd!];

function totalsAndDeltas(state: GameState, winnerId: string | null, points: number) {
  return {
    totals: Object.fromEntries(state.players.map((p) => [p.playerId, pipTotal(state.hands[p.playerId]!)])),
    deltas: Object.fromEntries(state.players.map((p) => [p.playerId, p.playerId === winnerId ? points : 0])),
  };
}

/** Cierre individual común: suma los puntos al ganador y declara campeón al primero (por asiento) que alcanza el objetivo. */
function endIndividualRound(state: GameState, reason: "DOMINO" | "BLOCKED", winnerId: string | null, tiedPlayerIds: readonly string[], points: number): HandEnd {
  const { totals, deltas } = totalsAndDeltas(state, winnerId, points);
  const players = state.players.map((p) => ({ ...p, score: p.score + deltas[p.playerId]! }));
  const champion = players.find((p) => p.score >= targetScore(state));
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
/** Tranque individual: gana quien tenga menos puntos en mano; si varios empatan en el mínimo, nadie. */
function blockedWinner(state: GameState): { winnerId: string | null; tied: readonly string[] } {
  const totals = Object.fromEntries(state.players.map((p) => [p.playerId, pipTotal(state.hands[p.playerId]!)]));
  const minimum = Math.min(...Object.values(totals));
  const tied = state.players.filter((p) => totals[p.playerId] === minimum).map((p) => p.playerId);
  return { winnerId: tied.length === 1 ? tied[0]! : null, tied: tied.length > 1 ? tied : [] };
}

/**
 * Parejas: la pareja ganadora se lleva los puntos de las cuatro manos. En tranque gana la pareja con menos puntos
 * entre sus dos manos; si empatan, nadie suma. Ambos compañeros llevan siempre el mismo marcador.
 */
function endPairsRound(state: GameState, reason: "DOMINO" | "BLOCKED", actorId: string): HandEnd {
  const totals = Object.fromEntries(state.players.map((p) => [p.playerId, pipTotal(state.hands[p.playerId]!)]));
  const pot = Object.values(totals).reduce((sum, value) => sum + value, 0);
  let winningTeam: readonly string[] | null; let winnerId: string | null;
  if (reason === "DOMINO") { winningTeam = teamOf(state, actorId); winnerId = actorId; }
  else {
    const mine = teamOf(state, actorId); const theirs = state.players.map((p) => p.playerId).filter((id) => !mine.includes(id));
    const sum = (team: readonly string[]) => team.reduce((total, id) => total + totals[id]!, 0);
    winningTeam = sum(mine) === sum(theirs) ? null : sum(mine) < sum(theirs) ? mine : theirs;
    winnerId = winningTeam ? [...winningTeam].sort((a, b) => totals[a]! - totals[b]! || (a === actorId ? -1 : b === actorId ? 1 : 0))[0]! : null;
  }
  const deltas = Object.fromEntries(state.players.map((p) => [p.playerId, winningTeam?.includes(p.playerId) ? pot : 0]));
  const players = state.players.map((p) => ({ ...p, score: p.score + deltas[p.playerId]! }));
  const championTeam = winningTeam && players.find((p) => p.playerId === winningTeam[0])!.score >= targetScore(state) ? winningTeam : null;
  const tiedPlayerIds = winningTeam ? [] : state.players.map((p) => p.playerId);
  const roundResult = { reason, winnerId, tiedPlayerIds, handPipTotals: totals, scoreDeltas: deltas, ...(winningTeam ? { winningTeam } : {}), nextOpenerId: actorId };
  const finalScores = Object.fromEntries(players.map((p) => [p.playerId, p.score]));
  const ended: GameState = { ...state, players, phase: championTeam ? "MATCH_ENDED" : "ROUND_ENDED", currentPlayerId: null, roundResult,
    matchResult: championTeam ? { championId: winnerId!, finalScores, championTeam } : null };
  const events: DomainEvent[] = [
    { type: "ROUND_ENDED", roundId: state.roundId, reason, winnerId, tiedPlayerIds, winningTeam },
    { type: "SCORE_APPLIED", roundId: state.roundId, scoreDeltas: deltas },
  ];
  if (championTeam) events.push({ type: "MATCH_ENDED", championId: winnerId, championTeam, finalScores });
  return { state: ended, events };
}

/**
 * Dominó latino (comportamiento congelado en `test/latino-golden.test.ts`). Doble seis, cuatro jugadores, se reparte todo.
 * Individual a 100: dominada +20, cierre +0. Parejas a 200: la mano ganada suma las cuatro manos. Abre el 6–6;
 * en parejas, desde la segunda mano sale quien ganó la anterior con la ficha que quiera.
 */
export const LATINO_RULES: RuleSet = {
  id: "LATINO",
  deal: (players, deal) => ({ hands: Object.fromEntries(players.map((p) => [p.playerId, [...deal[p.playerId]!] as readonly TileId[]])), boneyard: null }),
  opening(state, openerId) {
    if (freeOpening(state)) { const opener = state.players.find((p) => p.playerId === openerId); return opener ? { playerId: opener.playerId, tileId: null } : null; }
    const holder = state.players.find((p) => state.hands[p.playerId]!.includes("6-6")); return holder ? { playerId: holder.playerId, tileId: "6-6" } : null;
  },
  canPlay: placementsAtEnds,
  onCannotPlay: () => "PASS",
  scoreDuringHand: () => null,
  isHandOver: handOverByHandOrPasses,
  scoreEndOfHand(state, reason, actorId) {
    if (isPairs(state)) return endPairsRound(state, reason, actorId);
    if (reason === "DOMINO") return endIndividualRound(state, reason, actorId, [], 20);
    const { winnerId, tied } = blockedWinner(state); return endIndividualRound(state, reason, winnerId, tied, 0);
  },
  targetScore,
  openEnds: twoEnds,
};

/** Ficha de salida con robo: el doble más alto en mano; si nadie tiene dobles, la ficha de más puntos (y de extremo mayor). */
function highestTileIn(ids: readonly TileId[]): TileId | null {
  const rank = (id: TileId) => { const tile = TILE_BY_ID.get(id)!; return (tile.a === tile.b ? 1_000 : 0) + (tile.a + tile.b) * 10 + Math.max(tile.a, tile.b); };
  return ids.length ? [...ids].sort((left, right) => rank(right) - rank(left))[0]! : null;
}

/**
 * Con robo (solo individual). Cinco fichas por jugador y ocho al pozo. Quien no puede colocar roba de una en una hasta
 * poder; con el pozo vacío, pasa. Sale quien tenga la ficha más alta (doble más alto, o la de más puntos). Al dominar o en
 * tranque (gana quien menos puntos tenga en mano), el ganador suma los puntos en mano de los tres rivales.
 */
export const DRAW_RULES: RuleSet = {
  id: "DRAW",
  // Del reparto 4×7 barajado: las cinco primeras de cada jugador a su mano y las dos últimas, por asiento, al pozo.
  deal: (players, deal) => ({ hands: Object.fromEntries(players.map((p) => [p.playerId, deal[p.playerId]!.slice(0, 5)])), boneyard: players.flatMap((p) => deal[p.playerId]!.slice(5)) }),
  opening(state) {
    const best = highestTileIn(state.players.flatMap((p) => state.hands[p.playerId]!)); if (!best) return null;
    return { playerId: state.players.find((p) => state.hands[p.playerId]!.includes(best))!.playerId, tileId: best };
  },
  canPlay: placementsAtEnds,
  onCannotPlay: (state) => (state.boneyard?.length ?? 0) > 0 ? "DRAW" : "PASS",
  scoreDuringHand: () => null,
  isHandOver: handOverByHandOrPasses,
  scoreEndOfHand(state, reason, actorId) {
    const { winnerId, tied } = reason === "DOMINO" ? { winnerId: actorId, tied: [] } : blockedWinner(state);
    const rivals = winnerId ? state.players.filter((p) => p.playerId !== winnerId).reduce((sum, p) => sum + pipTotal(state.hands[p.playerId]!), 0) : 0;
    return endIndividualRound(state, reason, winnerId, tied, rivals);
  },
  targetScore,
  openEnds: twoEnds,
};

/** Redondeo al múltiplo de 5 más cercano; a mitad de camino, hacia arriba (12 → 10, 13 → 15). */
export function roundToFive(points: number): number { return Math.floor((points + 2.5) / 5) * 5; }

/**
 * All Fives (solo individual, 4 jugadores). Reparto, salida, robo y pase como «con robo». El primer doble jugado es el
 * spinner: cuando tiene fichas a ambos lados abre los brazos UP y DOWN. Tras cada colocación, si la suma de los extremos
 * abiertos es múltiplo de 5, quien colocó suma esos puntos; quien alcanza el objetivo gana en el acto. Al cerrar la mano
 * (dominada, o tranque con el menor total en mano) el ganador suma los puntos en mano de los rivales redondeados a 5.
 */
export const ALL_FIVES_RULES: RuleSet = {
  ...DRAW_RULES,
  id: "ALL_FIVES",
  canPlay(state, actorId) {
    const actions = placementsAtEnds(state, actorId); if (!armsOpen(state)) return actions;
    for (const id of state.hands[actorId] ?? []) for (const side of ["UP", "DOWN"] as const) if (matches(id, endValue(state, side)!)) actions.push({ type: "PLACE", tileId: id, side });
    return actions;
  },
  scoreDuringHand(state, actorId) { const points = fivesPoints(state); return points ? { [actorId]: points } : null; },
  scoreEndOfHand(state, reason, actorId) {
    const { winnerId, tied } = reason === "DOMINO" ? { winnerId: actorId, tied: [] } : blockedWinner(state);
    const rivals = winnerId ? state.players.filter((p) => p.playerId !== winnerId).reduce((sum, p) => sum + pipTotal(state.hands[p.playerId]!), 0) : 0;
    return endIndividualRound(state, reason, winnerId, tied, roundToFive(rivals));
  },
  openEnds(state) { return (["LEFT", "RIGHT", "UP", "DOWN"] as const).map((side) => endValue(state, side)).filter((value): value is number => value !== null); },
};

/** All Fives: alguien alcanzó el objetivo con los puntos de una jugada; la partida termina sin cerrar la mano. */
function endByTarget(state: GameState, actorId: string, gained: Readonly<Record<string, number>>): HandEnd {
  const totals = Object.fromEntries(state.players.map((p) => [p.playerId, pipTotal(state.hands[p.playerId]!)]));
  const deltas = Object.fromEntries(state.players.map((p) => [p.playerId, gained[p.playerId] ?? 0]));
  const finalScores = Object.fromEntries(state.players.map((p) => [p.playerId, p.score]));
  const roundResult = { reason: "TARGET" as const, winnerId: actorId, tiedPlayerIds: [], handPipTotals: totals, scoreDeltas: deltas };
  return { state: { ...state, phase: "MATCH_ENDED", currentPlayerId: null, roundResult, matchResult: { championId: actorId, finalScores } },
    events: [{ type: "ROUND_ENDED", roundId: state.roundId, reason: "TARGET", winnerId: actorId, tiedPlayerIds: [] }, { type: "MATCH_ENDED", championId: actorId, finalScores }] };
}

const RULE_SETS: Readonly<Record<RulesId, RuleSet>> = { LATINO: LATINO_RULES, DRAW: DRAW_RULES, ALL_FIVES: ALL_FIVES_RULES };
export function ruleSetOf(state: Pick<GameState, "rules">): RuleSet { return RULE_SETS[rulesId(state)]; }

function makeRound(base: { matchId: string; roundNumber: number; revision: number; players: readonly Player[]; mode: GameMode; rules: RulesId; targetScore?: TargetScore | undefined; openerId?: string | undefined }, deal: Deal): GameState {
  validateDeal(base.players, deal);
  const rules = RULE_SETS[base.rules]; const { hands, boneyard } = rules.deal(base.players, deal);
  const free = base.mode === "PAIRS" && base.roundNumber > 1;
  const opening = rules.opening({ mode: base.mode, roundNumber: base.roundNumber, players: base.players, hands }, base.openerId);
  if (!opening) throw Object.assign(new Error(free ? "The opener of the round is unknown" : "The opening tile is missing"), { code: free ? "INVALID_CONFIGURATION" : "INVALID_DEAL" });
  return {
    rulesVersion: RULES_VERSION, ...(base.mode === "PAIRS" ? { mode: "PAIRS" as const } : {}), ...(base.rules !== "LATINO" ? { rules: base.rules } : {}),
    ...(base.targetScore !== undefined ? { targetScore: base.targetScore } : {}), matchId: base.matchId, roundId: `${base.matchId}:r${base.roundNumber}`,
    roundNumber: base.roundNumber, revision: base.revision, phase: "ROUND_ACTIVE", players: base.players,
    hands, ...(boneyard ? { boneyard } : {}), chain: [], leftEnd: null, rightEnd: null, openingPlayerId: opening.playerId,
    currentPlayerId: opening.playerId, consecutivePasses: 0, roundResult: null, matchResult: null,
  };
}

export function startMatch(matchId: string, inputs: readonly PlayerInput[], deal: Deal, options: MatchOptions = {}): { state: GameState; events: readonly DomainEvent[] } {
  validatePlayers(inputs);
  if (!matchId) throw Object.assign(new Error("matchId is required"), { code: "INVALID_CONFIGURATION" });
  const mode = options.mode ?? "INDIVIDUAL"; const rules = options.rules ?? "LATINO";
  if (!RULE_SETS[rules]) throw Object.assign(new Error("Unknown rules"), { code: "INVALID_CONFIGURATION" });
  if (rules !== "LATINO" && mode !== "INDIVIDUAL") throw Object.assign(new Error("Only Latino supports pairs"), { code: "INVALID_CONFIGURATION" });
  if (options.targetScore !== undefined && !TARGET_OPTIONS.includes(options.targetScore)) throw Object.assign(new Error("Target score must be 100, 150 or 200"), { code: "INVALID_CONFIGURATION" });
  const players = [...inputs].sort((a, b) => a.seat - b.seat).map((p) => ({ ...p, score: 0 }));
  const state = makeRound({ matchId, roundNumber: 1, revision: 1, players, mode, rules, targetScore: options.targetScore }, deal);
  return { state, events: [{ type: "MATCH_STARTED", matchId }, { type: "ROUND_STARTED", roundId: state.roundId, openingPlayerId: state.openingPlayerId }] };
}

export function nextRound(state: GameState, deal: Deal): { state: GameState; events: readonly DomainEvent[] } | { error: RuleError; state: GameState } {
  if (state.phase !== "ROUND_ENDED") return { state, error: { code: "WRONG_PHASE", message: "A new round requires ROUND_ENDED" } };
  try {
    const next = makeRound({ matchId: state.matchId, roundNumber: state.roundNumber + 1, revision: state.revision + 1, players: state.players,
      mode: state.mode ?? "INDIVIDUAL", rules: rulesId(state), targetScore: state.targetScore, openerId: state.roundResult?.nextOpenerId }, deal);
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
/** Ficha obligatoria de salida en la mano actual (`null`: salida libre). */
function requiredOpening(state: GameState): TileId | null { return ruleSetOf(state).opening(state, state.openingPlayerId)?.tileId ?? null; }

export function legalActions(state: GameState, actorId: string): readonly LegalAction[] {
  if (state.phase !== "ROUND_ACTIVE" || state.currentPlayerId !== actorId) return [];
  const hand = state.hands[actorId] ?? []; const rules = ruleSetOf(state);
  if (state.chain.length === 0) {
    const required = requiredOpening(state);
    if (required === null) return hand.map((tileId) => ({ type: "PLACE", tileId }));
    return hand.includes(required) ? [{ type: "PLACE", tileId: required }] : [];
  }
  const actions = rules.canPlay(state, actorId);
  return actions.length ? actions : [{ type: rules.onCannotPlay(state, actorId) }];
}

function endIfOver(state: GameState, actorId: string, events: DomainEvent[]): Transition | null {
  const reason = ruleSetOf(state).isHandOver(state, actorId); if (!reason) return null;
  const ended = ruleSetOf(state).scoreEndOfHand(state, reason, actorId);
  return { ok: true, state: ended.state, events: [...events, ...ended.events] };
}

export function transition(state: GameState, command: Command): Transition {
  if (command.expectedRevision !== undefined && command.expectedRevision !== state.revision) return fail(state, "STALE_REVISION", "Revision does not match");
  if (state.phase !== "ROUND_ACTIVE") return fail(state, "WRONG_PHASE", "Round is not active");
  if (command.actorId !== state.currentPlayerId) return fail(state, "NOT_YOUR_TURN", "Actor does not own the turn");
  const rules = ruleSetOf(state);
  if (command.type === "DRAW") {
    if (!legalActions(state, command.actorId).some((a) => a.type === "DRAW")) return fail(state, "DRAW_FORBIDDEN", "Drawing requires no legal placement and a non-empty boneyard");
    const [drawn, ...boneyard] = state.boneyard!;
    const hands = { ...state.hands, [command.actorId]: [...state.hands[command.actorId]!, drawn!] };
    // Robar no pasa el turno: quien roba sigue hasta poder colocar o hasta que se vacíe el pozo.
    return { ok: true, state: { ...state, hands, boneyard, revision: state.revision + 1 }, events: [{ type: "TILE_DRAWN", actorId: command.actorId, boneyardCount: boneyard.length }] };
  }
  if (command.type === "PASS") {
    if (state.chain.length === 0 || legalActions(state, command.actorId).some((a) => a.type === "PLACE")) return fail(state, "PASS_FORBIDDEN", "A legal placement exists");
    if (legalActions(state, command.actorId).some((a) => a.type === "DRAW")) return fail(state, "PASS_FORBIDDEN", "Draw from the boneyard before passing");
    const passes = state.consecutivePasses + 1;
    const passed: GameState = { ...state, consecutivePasses: passes, revision: state.revision + 1 };
    const events: DomainEvent[] = [{ type: "TURN_PASSED", actorId: command.actorId, consecutivePasses: passes }];
    // Tras cuatro pases el último en pasar es quien colocó la ficha que cerró: en parejas, es quien sale la mano siguiente.
    const ended = endIfOver(passed, command.actorId, events); if (ended) return ended;
    const currentPlayerId = nextPlayer(state, command.actorId);
    return { ok: true, state: { ...passed, currentPlayerId }, events: [...events, { type: "TURN_CHANGED", currentPlayerId }] };
  }

  const hand = state.hands[command.actorId]!;
  if (!hand.includes(command.tileId)) return fail(state, "TILE_NOT_OWNED", "Tile is not in actor hand");
  const required = state.chain.length === 0 ? requiredOpening(state) : null;
  if (state.chain.length === 0 && required === null) {
    if (command.side !== undefined) return fail(state, "INVALID_SIDE", "The opening tile takes no side");
  } else if (state.chain.length === 0) {
    if (command.tileId !== required || command.side !== undefined) return fail(state, command.side !== undefined ? "INVALID_SIDE" : "INVALID_OPENING", `Opening must be ${required} without a side`);
  } else if (command.side === "UP" || command.side === "DOWN") {
    const end = rules.id === "ALL_FIVES" ? endValue(state, command.side) : null;
    if (end === null) return fail(state, "INVALID_SIDE", "The spinner arms are not open");
    if (!matches(command.tileId, end)) return fail(state, "TILE_DOES_NOT_MATCH", "Tile does not match selected end");
  } else {
    if (command.side !== "LEFT" && command.side !== "RIGHT") return fail(state, "INVALID_SIDE", "LEFT or RIGHT is required");
    const end = command.side === "LEFT" ? state.leftEnd! : state.rightEnd!;
    if (!matches(command.tileId, end)) return fail(state, "TILE_DOES_NOT_MATCH", "Tile does not match selected end");
  }
  const placement = placeOnBoard(state, command.tileId, command.side, command.actorId, rules.id === "ALL_FIVES"); const oriented = placement.tile;
  const hands = { ...state.hands, [command.actorId]: hand.filter((id) => id !== command.tileId) };
  // La mesa centra la cadena en la ficha de salida; solo se guarda cuando no es el 6–6 obligatorio de Latino.
  const opening = state.chain.length === 0 && (required === null || rules.id !== "LATINO") ? { openingTileId: command.tileId } : {};
  let placed: GameState = { ...state, ...opening, hands, ...placement.board, consecutivePasses: 0, revision: state.revision + 1 };
  const events: DomainEvent[] = [{ type: "TILE_PLACED", actorId: command.actorId, tile: oriented, side: command.side ?? null }];
  const gained = rules.scoreDuringHand(placed, command.actorId);
  if (gained && Object.values(gained).some((points) => points !== 0)) {
    placed = { ...placed, players: placed.players.map((p) => ({ ...p, score: p.score + (gained[p.playerId] ?? 0) })) };
    events.push({ type: "SCORE_APPLIED", roundId: state.roundId, scoreDeltas: gained, reason: "FIVES", openEndsTotal: openEndsTotal(placed) });
    if (placed.players.some((p) => p.score >= targetScore(placed))) { const ended = endByTarget(placed, command.actorId, gained); return { ok: true, state: ended.state, events: [...events, ...ended.events] }; }
  }
  const ended = endIfOver(placed, command.actorId, events); if (ended) return ended;
  const currentPlayerId = nextPlayer(state, command.actorId);
  return { ok: true, state: { ...placed, currentPlayerId }, events: [...events, { type: "TURN_CHANGED", currentPlayerId }] };
}

export function getPlayerView(state: GameState, viewerId: string | null): PlayerView {
  const { hands, boneyard, ...publicState } = state;
  return { ...publicState, ownHand: viewerId && hands[viewerId] ? hands[viewerId] : null,
    handCounts: Object.fromEntries(state.players.map((p) => [p.playerId, hands[p.playerId]!.length])), ...(boneyard ? { boneyardCount: boneyard.length } : {}) };
}

export function getRoundResult(state: GameState) { return state.roundResult; }
