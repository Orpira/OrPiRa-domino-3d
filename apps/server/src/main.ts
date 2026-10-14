import { resolve } from "node:path";
import { ChatManager } from "./chat.ts";
import { chatResolver } from "./chat-access.ts";
import { CompetitionManager, createDominoHttpServer, DEFAULT_IDENTITY_LIMIT, DEFAULT_LEAGUE, LeagueManager, DEFAULT_REQUEST_LIMIT, DEFAULT_TURN_CLOCK, JsonFileMatchStore, JsonSocialRepository, LobbyManager, SocialManager, QuickPlayManager, RoomRegistry } from "./index.ts";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const dataDirectory = resolve(process.env.DOMINO_DATA_DIR ?? ".data");
const store = new JsonFileMatchStore(resolve(dataDirectory, "matches"));
const seconds = (value: string | undefined, fallback: number) => (value === undefined ? fallback : Number(value)) * 1000;
const clock = { ...DEFAULT_TURN_CLOCK, turnMs: seconds(process.env.DOMINO_TURN_SECONDS, DEFAULT_TURN_CLOCK.turnMs / 1000),
  automaticDelayMs: seconds(process.env.DOMINO_AUTOMATIC_DELAY_SECONDS, DEFAULT_TURN_CLOCK.automaticDelayMs / 1000),
  roundBreakMs: seconds(process.env.DOMINO_ROUND_BREAK_SECONDS, DEFAULT_TURN_CLOCK.roundBreakMs / 1000) };
const lobbies = await LobbyManager.open(resolve(dataDirectory, "lobbies.json"), store, Date.now, clock);
const competitions = await CompetitionManager.open(resolve(dataDirectory, "simulated-competition.json"), store, Date.now, undefined, clock);
const quickPlay = await QuickPlayManager.open(resolve(dataDirectory, "quick-play.json"), store, (token) => competitions.identify(token), Date.now, clock,
  { fillAfterMs: seconds(process.env.DOMINO_QUICK_PLAY_FILL_SECONDS, 45) });
const numbers = (value: string | undefined, fallback: readonly number[]) => value ? value.split(",").map((entry) => Number(entry.trim())) : fallback;
const league = await LeagueManager.open(resolve(dataDirectory, "league.json"), Date.now, { ...DEFAULT_LEAGUE,
  positionPoints: numbers(process.env.DOMINO_LEAGUE_POSITION_POINTS, DEFAULT_LEAGUE.positionPoints),
  rankThresholds: numbers(process.env.DOMINO_LEAGUE_RANK_THRESHOLDS, DEFAULT_LEAGUE.rankThresholds), timeZone: process.env.DOMINO_LEAGUE_TIME_ZONE ?? DEFAULT_LEAGUE.timeZone });
const social = new SocialManager(await JsonSocialRepository.open(resolve(dataDirectory, "social.json")), (token) => competitions.identify(token), (identityId) => competitions.displayNameOf(identityId));
lobbies.attachSocial(social); social.attachRooms((code, identityId) => lobbies.memberPreview(code, identityId));
quickPlay.attachLeague(league); competitions.attachRanks((identityId) => league.rankOf(identityId));
const chat = await ChatManager.open(resolve(dataDirectory, "chat-reports.json"), chatResolver(competitions, lobbies, quickPlay));
// Reconciliación al arrancar: puntos de partidas terminadas que no llegaron a concederse y cierres de temporada vencidos.
await league.sync(quickPlay.historyEntries());
// Reloj de turno: el servidor resuelve turnos vencidos, asientos automáticos y bots aunque nadie consulte.
const ticker = setInterval(() => { void Promise.allSettled([lobbies.tick(), competitions.tick(), quickPlay.tick(), league.sync([])]).then((results) => {
  chat.prune();
  for (const result of results) if (result.status === "rejected") console.error("Reloj de turno:", result.reason);
}); }, Number(process.env.DOMINO_CLOCK_TICK_MS ?? 500)); ticker.unref();
const allowedOrigins = (process.env.DOMINO_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const limit = (max: string | undefined, seconds: string | undefined, defaultMax: number, defaultSeconds: number) =>
  ({ max: Number(max ?? defaultMax), windowMs: Number(seconds ?? defaultSeconds) * 1000 });
const requestLimit = limit(process.env.DOMINO_RATE_LIMIT_MAX, process.env.DOMINO_RATE_LIMIT_WINDOW_SECONDS, DEFAULT_REQUEST_LIMIT.max, DEFAULT_REQUEST_LIMIT.windowMs / 1000);
const identityLimit = limit(process.env.DOMINO_IDENTITY_LIMIT_MAX, process.env.DOMINO_IDENTITY_LIMIT_WINDOW_SECONDS, DEFAULT_IDENTITY_LIMIT.max, DEFAULT_IDENTITY_LIMIT.windowMs / 1000);
const trustProxy = process.env.DOMINO_TRUST_PROXY === "true";
const server = createDominoHttpServer(new RoomRegistry(), lobbies, { allowedOrigins, competitionManager: competitions, quickPlayManager: quickPlay, leagueManager: league, socialManager: social, chatManager: chat, requestLimit, identityLimit, trustProxy });
server.listen(port, host, () => console.log(`Dominó online local: http://${host}:${port}`));
const shutdown = (signal: string) => server.close(() => { console.log(`Servidor detenido por ${signal}`); process.exit(0); });
process.once("SIGTERM", () => shutdown("SIGTERM")); process.once("SIGINT", () => shutdown("SIGINT"));
