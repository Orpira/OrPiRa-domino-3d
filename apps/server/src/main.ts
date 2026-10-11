import { resolve } from "node:path";
import { CompetitionManager, createDominoHttpServer, DEFAULT_TURN_CLOCK, JsonFileMatchStore, LobbyManager, QuickPlayManager, RoomRegistry } from "./index.ts";

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
// Reloj de turno: el servidor resuelve turnos vencidos, asientos automáticos y bots aunque nadie consulte.
const ticker = setInterval(() => { void Promise.allSettled([lobbies.tick(), competitions.tick(), quickPlay.tick()]).then((results) => {
  for (const result of results) if (result.status === "rejected") console.error("Reloj de turno:", result.reason);
}); }, Number(process.env.DOMINO_CLOCK_TICK_MS ?? 500)); ticker.unref();
const allowedOrigins = (process.env.DOMINO_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const limit = (max: string | undefined, seconds: string | undefined, defaultMax: number, defaultSeconds: number) =>
  ({ max: Number(max ?? defaultMax), windowMs: Number(seconds ?? defaultSeconds) * 1000 });
const requestLimit = limit(process.env.DOMINO_RATE_LIMIT_MAX, process.env.DOMINO_RATE_LIMIT_WINDOW_SECONDS, 600, 60);
const identityLimit = limit(process.env.DOMINO_IDENTITY_LIMIT_MAX, process.env.DOMINO_IDENTITY_LIMIT_WINDOW_SECONDS, 20, 86_400);
const trustProxy = process.env.DOMINO_TRUST_PROXY === "true";
const server = createDominoHttpServer(new RoomRegistry(), lobbies, { allowedOrigins, competitionManager: competitions, quickPlayManager: quickPlay, requestLimit, identityLimit, trustProxy });
server.listen(port, host, () => console.log(`Dominó online local: http://${host}:${port}`));
const shutdown = (signal: string) => server.close(() => { console.log(`Servidor detenido por ${signal}`); process.exit(0); });
process.once("SIGTERM", () => shutdown("SIGTERM")); process.once("SIGINT", () => shutdown("SIGINT"));
