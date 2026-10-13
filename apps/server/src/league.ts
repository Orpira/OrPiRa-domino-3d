import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  LeagueArchivedSeason, LeagueAwardView, LeagueHistoryView, LeagueRankId, LeagueRankView, LeagueSeasonView, LeagueStandingRow, LeagueView, QuickPlayHistoryEntry,
} from "../../../packages/protocol/src/index.ts";

// Valores provisionales del prototipo, configurables en el servidor. Los puntos de liga no son COP simulados ni se canjean.
export interface LeagueConfig { readonly positionPoints: readonly number[]; readonly rankThresholds: readonly number[]; readonly timeZone: string }
export const DEFAULT_LEAGUE: LeagueConfig = Object.freeze({ positionPoints: [40, 20, 10, 4], rankThresholds: [0, 40, 120, 250, 450, 700, 1000], timeZone: "America/Bogota" });
const RANKS: readonly { readonly id: LeagueRankId; readonly name: string }[] = [
  { id: "DOUBLE_0", name: "Doble blanca" }, { id: "DOUBLE_1", name: "Doble uno" }, { id: "DOUBLE_2", name: "Doble dos" }, { id: "DOUBLE_3", name: "Doble tres" },
  { id: "DOUBLE_4", name: "Doble cuatro" }, { id: "DOUBLE_5", name: "Doble cinco" }, { id: "DOUBLE_6", name: "Doble seis" },
];

export function validateLeagueConfig(config: LeagueConfig): LeagueConfig {
  const thresholds = config.rankThresholds; const points = config.positionPoints;
  if (thresholds.length !== RANKS.length || thresholds[0] !== 0 || thresholds.some((value, index) => !Number.isSafeInteger(value) || (index > 0 && value <= thresholds[index - 1]!))) throw new Error("INVALID_LEAGUE_RANKS");
  if (points.length !== 4 || points.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("INVALID_LEAGUE_POINTS");
  new Intl.DateTimeFormat("en-US", { timeZone: config.timeZone }); return config;
}

/** Posiciones con el mismo criterio que el resultado final: empatados comparten la mejor posición (1, 2, 2, 4). */
export function finalPositions(scores: Readonly<Record<string, number>>): Record<string, number> {
  const values = Object.values(scores);
  return Object.fromEntries(Object.entries(scores).map(([playerId, score]) => [playerId, 1 + values.filter((other) => other > score).length]));
}
/** Base por posición × humanos/4, redondeando hacia abajo; modo automático 0. */
export function leaguePoints(position: number, humans: number, automatic: boolean, config: LeagueConfig = DEFAULT_LEAGUE): number {
  if (automatic) return 0; const base = config.positionPoints[position - 1] ?? 0; return Math.floor(base * humans / 4);
}
export function rankFor(points: number, config: LeagueConfig = DEFAULT_LEAGUE): LeagueRankId {
  let index = 0; config.rankThresholds.forEach((threshold, candidate) => { if (points >= threshold) index = candidate; }); return RANKS[index]!.id;
}

function zoneParts(timestamp: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(timestamp).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return parts as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}
function offsetAt(timestamp: number, timeZone: string) { const p = zoneParts(timestamp, timeZone); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(timestamp / 1000) * 1000; }
function zonedMonthStart(year: number, month: number, timeZone: string) { const guess = Date.UTC(year, month - 1, 1); return guess - offsetAt(guess - offsetAt(guess, timeZone), timeZone); }
/** Temporada = mes natural en la zona configurada, con identificador «AAAA-MM». */
export function seasonIdAt(timestamp: number, timeZone = DEFAULT_LEAGUE.timeZone): string { const p = zoneParts(timestamp, timeZone); return `${p.year}-${String(p.month).padStart(2, "0")}`; }
export function nextSeasonId(seasonId: string): string { const [year, month] = seasonId.split("-").map(Number) as [number, number]; return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`; }
export function seasonBounds(seasonId: string, timeZone = DEFAULT_LEAGUE.timeZone) {
  const [year, month] = seasonId.split("-").map(Number) as [number, number]; const [nextYear, nextMonth] = nextSeasonId(seasonId).split("-").map(Number) as [number, number];
  return { startsAt: zonedMonthStart(year, month, timeZone), endsAt: zonedMonthStart(nextYear, nextMonth, timeZone) };
}
function seasonLabel(seasonId: string, timeZone: string) { const { startsAt } = seasonBounds(seasonId, timeZone); return new Intl.DateTimeFormat("es-CO", { timeZone, month: "long", year: "numeric" }).format(startsAt); }

interface AwardEntry { readonly identityId: string; readonly alias: string; readonly position: number; readonly basePoints: number; readonly humans: number; readonly automatic: boolean; readonly points: number; readonly previousPoints: number }
interface AwardRecord { readonly matchId: string; readonly seasonId: string; readonly awardedAt: number; readonly entries: readonly AwardEntry[] }
interface Standing { readonly identityId: string; alias: string; points: number; matches: number }
interface ArchivedResult { readonly identityId: string; readonly alias: string; readonly points: number; readonly position: number; readonly rank: LeagueRankId }
interface ArchivedSeason { readonly seasonId: string; readonly closedAt: number; readonly results: readonly ArchivedResult[] }
interface Snapshot { readonly currentSeasonId: string; readonly standings: readonly Standing[]; readonly awards: readonly AwardRecord[]; readonly archive: readonly ArchivedSeason[] }

export class LeagueManager {
  private currentSeasonId: string; private standings = new Map<string, Standing>(); private readonly awards = new Map<string, AwardRecord>(); private readonly archive = new Map<string, ArchivedSeason>();
  private chain: Promise<void> = Promise.resolve();
  private readonly path: string; private readonly now: () => number; private readonly config: LeagueConfig;
  private constructor(path: string, now: () => number, config: LeagueConfig) { this.path = path; this.now = now; this.config = config; this.currentSeasonId = seasonIdAt(now(), config.timeZone); }

  static async open(path: string, now: () => number = Date.now, config: LeagueConfig = DEFAULT_LEAGUE) {
    const manager = new LeagueManager(path, now, validateLeagueConfig(config));
    try {
      const saved = JSON.parse(await readFile(path, "utf8")) as Snapshot; manager.currentSeasonId = saved.currentSeasonId;
      for (const standing of saved.standings) manager.standings.set(standing.identityId, standing);
      for (const award of saved.awards) manager.awards.set(award.matchId, award);
      for (const season of saved.archive) manager.archive.set(season.seasonId, season);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return manager;
  }

  /**
   * Concede los puntos de las partidas públicas terminadas (única por matchId: repetirla no cambia nada) y cierra temporadas vencidas.
   * Se recorren por orden de final: antes de conceder una partida se cierran las temporadas que terminaron antes que ella.
   */
  sync(entries: readonly QuickPlayHistoryEntry[]): Promise<{ readonly awarded: number; readonly closed: number }> { return this.serial(async () => {
    let awarded = 0; let closed = 0;
    for (const entry of [...entries].sort((left, right) => left.endedAt - right.endedAt)) {
      if (this.awards.has(entry.matchId)) continue;
      while (seasonIdAt(entry.endedAt, this.config.timeZone) > this.currentSeasonId) { this.closeCurrent(); closed++; }
      if (this.award(entry)) awarded++;
    }
    while (this.now() >= seasonBounds(this.currentSeasonId, this.config.timeZone).endsAt) { this.closeCurrent(); closed++; }
    if (awarded || closed) await this.persist(); return { awarded, closed };
  }); }

  view(viewerIdentityId: string | null): Promise<LeagueView> { return this.serial(async () => {
    const rows = this.ranked(); const { endsAt } = seasonBounds(this.currentSeasonId, this.config.timeZone); const now = this.now();
    const viewerRow = viewerIdentityId ? rows.find((row) => row.identityId === viewerIdentityId) ?? null : null;
    const standing = viewerIdentityId ? this.standings.get(viewerIdentityId) ?? null : null;
    const points = standing?.points ?? 0; const rank = rankFor(points, this.config); const nextIndex = RANKS.findIndex((entry) => entry.id === rank) + 1;
    return { season: this.seasonView(this.currentSeasonId), serverNow: now, daysLeft: Math.max(0, Math.ceil((endsAt - now) / 86_400_000)), ranks: this.rankViews(), positionPoints: this.config.positionPoints,
      top: rows.slice(0, 50).map((row) => this.publicRow(row, viewerIdentityId)), totalPlayers: rows.length,
      viewer: viewerIdentityId && standing ? { alias: standing.alias, points, rank, nextRank: RANKS[nextIndex]?.id ?? null, pointsToNext: nextIndex < RANKS.length ? this.config.rankThresholds[nextIndex]! - points : null, position: viewerRow?.position ?? null, matches: standing.matches }
        : viewerIdentityId ? { alias: "", points: 0, rank: "DOUBLE_0", nextRank: "DOUBLE_1", pointsToNext: this.config.rankThresholds[1]!, position: null, matches: 0 } : null };
  }); }
  historyFor(identityId: string): Promise<LeagueHistoryView> { return this.serial(async () => ({
    awards: [...this.awards.values()].filter((award) => award.entries.some((entry) => entry.identityId === identityId)).sort((left, right) => right.awardedAt - left.awardedAt).map((award) => this.awardView(award, identityId)!),
    seasons: [...this.archive.values()].sort((left, right) => right.seasonId.localeCompare(left.seasonId)).flatMap((season): LeagueArchivedSeason[] => {
      const result = season.results.find((entry) => entry.identityId === identityId); if (!result) return [];
      return [{ seasonId: season.seasonId, label: seasonLabel(season.seasonId, this.config.timeZone), points: result.points, position: result.position, rank: result.rank, totalPlayers: season.results.length }];
    }),
  })); }
  /** Lecturas síncronas para componer otras vistas (rango en la mesa y puntos del resultado). */
  awardFor(matchId: string, identityId: string): LeagueAwardView | null { const award = this.awards.get(matchId); return award ? this.awardView(award, identityId) : null; }
  rankOf(identityId: string): LeagueRankId { return rankFor(this.standings.get(identityId)?.points ?? 0, this.config); }
  archivedSeasonIds(): readonly string[] { return [...this.archive.keys()].sort(); }

  private award(entry: QuickPlayHistoryEntry): boolean {
    // Solo Latino (individual y parejas) puntúa; las modalidades casuales (con robo) no dan puntos de liga.
    if (this.awards.has(entry.matchId) || (entry.rules ?? "LATINO") !== "LATINO") return false;
    const seasonId = seasonIdAt(entry.endedAt, this.config.timeZone);
    // Una partida terminada antes del inicio de la temporada abierta (por ejemplo, tras una larga caída) no reabre un archivo.
    const target = seasonId < this.currentSeasonId ? this.currentSeasonId : seasonId;
    const humans = entry.participants.filter((participant) => !participant.bot); const positions = finalPositions(Object.fromEntries(entry.participants.map((participant) => [participant.playerId, participant.score])));
    const entries = humans.map((participant): AwardEntry => {
      const position = positions[participant.playerId]!; const standing = this.standings.get(participant.playerId);
      return { identityId: participant.playerId, alias: participant.displayName, position, basePoints: this.config.positionPoints[position - 1] ?? 0, humans: humans.length,
        automatic: participant.endedAutomatic, points: leaguePoints(position, humans.length, participant.endedAutomatic, this.config), previousPoints: standing?.points ?? 0 };
    });
    for (const awardEntry of entries) {
      const standing = this.standings.get(awardEntry.identityId) ?? { identityId: awardEntry.identityId, alias: awardEntry.alias, points: 0, matches: 0 };
      standing.alias = awardEntry.alias; standing.points += awardEntry.points; standing.matches += 1; this.standings.set(awardEntry.identityId, standing);
    }
    this.awards.set(entry.matchId, { matchId: entry.matchId, seasonId: target, awardedAt: this.now(), entries }); return true;
  }
  private closeCurrent() {
    if (!this.archive.has(this.currentSeasonId)) {
      this.archive.set(this.currentSeasonId, { seasonId: this.currentSeasonId, closedAt: this.now(),
        results: this.ranked().map(({ identityId, alias, points, position }) => ({ identityId, alias, points, position, rank: rankFor(points, this.config) })) });
    }
    this.standings = new Map(); this.currentSeasonId = nextSeasonId(this.currentSeasonId);
  }
  private ranked() {
    const rows = [...this.standings.values()].sort((left, right) => right.points - left.points || left.alias.localeCompare(right.alias, "es") || left.identityId.localeCompare(right.identityId));
    return rows.map((row) => ({ ...row, position: 1 + rows.filter((other) => other.points > row.points).length }));
  }
  private publicRow(row: Standing & { position: number }, viewerIdentityId: string | null): LeagueStandingRow {
    return { position: row.position, alias: row.alias, rank: rankFor(row.points, this.config), points: row.points, viewer: row.identityId === viewerIdentityId };
  }
  private awardView(award: AwardRecord, identityId: string): LeagueAwardView | null {
    const entry = award.entries.find((candidate) => candidate.identityId === identityId); if (!entry) return null;
    const previousRank = rankFor(entry.previousPoints, this.config); const newRank = rankFor(entry.previousPoints + entry.points, this.config);
    return { matchId: award.matchId, seasonId: award.seasonId, position: entry.position, basePoints: entry.basePoints, humans: entry.humans, automatic: entry.automatic, points: entry.points,
      previousRank, newRank, promoted: newRank !== previousRank, awardedAt: award.awardedAt };
  }
  private rankViews(): LeagueRankView[] { return RANKS.map((rank, index) => ({ ...rank, pips: index, minPoints: this.config.rankThresholds[index]! })); }
  private seasonView(seasonId: string): LeagueSeasonView { return { id: seasonId, label: seasonLabel(seasonId, this.config.timeZone), ...seasonBounds(seasonId, this.config.timeZone), timeZone: this.config.timeZone }; }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const result = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    const run = async () => { try { resolve(await operation()); } catch (error) { reject(error); } }; this.chain = this.chain.then(run, run); return result;
  }
  private async persist() {
    await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.tmp`;
    const snapshot: Snapshot = { currentSeasonId: this.currentSeasonId, standings: [...this.standings.values()], awards: [...this.awards.values()], archive: [...this.archive.values()] };
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.path);
  }
}
