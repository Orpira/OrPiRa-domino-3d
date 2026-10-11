import { resolve } from "node:path";
import { CompetitionManager, createDominoHttpServer, JsonFileMatchStore, LobbyManager, RoomRegistry } from "./index.ts";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const dataDirectory = resolve(process.env.DOMINO_DATA_DIR ?? ".data");
const store = new JsonFileMatchStore(resolve(dataDirectory, "matches"));
const lobbies = await LobbyManager.open(resolve(dataDirectory, "lobbies.json"), store);
const competitions = await CompetitionManager.open(resolve(dataDirectory, "simulated-competition.json"), store);
const allowedOrigins = (process.env.DOMINO_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const limit = (max: string | undefined, seconds: string | undefined, defaultMax: number, defaultSeconds: number) =>
  ({ max: Number(max ?? defaultMax), windowMs: Number(seconds ?? defaultSeconds) * 1000 });
const requestLimit = limit(process.env.DOMINO_RATE_LIMIT_MAX, process.env.DOMINO_RATE_LIMIT_WINDOW_SECONDS, 600, 60);
const identityLimit = limit(process.env.DOMINO_IDENTITY_LIMIT_MAX, process.env.DOMINO_IDENTITY_LIMIT_WINDOW_SECONDS, 20, 86_400);
const trustProxy = process.env.DOMINO_TRUST_PROXY === "true";
const server = createDominoHttpServer(new RoomRegistry(), lobbies, { allowedOrigins, competitionManager: competitions, requestLimit, identityLimit, trustProxy });
server.listen(port, host, () => console.log(`Dominó online local: http://${host}:${port}`));
const shutdown = (signal: string) => server.close(() => { console.log(`Servidor detenido por ${signal}`); process.exit(0); });
process.once("SIGTERM", () => shutdown("SIGTERM")); process.once("SIGINT", () => shutdown("SIGINT"));
