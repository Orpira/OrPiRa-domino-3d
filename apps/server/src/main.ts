import { resolve } from "node:path";
import { createDominoHttpServer, JsonFileMatchStore, LobbyManager, RoomRegistry } from "./index.ts";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const dataDirectory = resolve(process.env.DOMINO_DATA_DIR ?? ".data");
const store = new JsonFileMatchStore(resolve(dataDirectory, "matches"));
const lobbies = await LobbyManager.open(resolve(dataDirectory, "lobbies.json"), store);
const allowedOrigins = (process.env.DOMINO_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const server = createDominoHttpServer(new RoomRegistry(), lobbies, { allowedOrigins });
server.listen(port, host, () => console.log(`Dominó online local: http://${host}:${port}`));
const shutdown = (signal: string) => server.close(() => { console.log(`Servidor detenido por ${signal}`); process.exit(0); });
process.once("SIGTERM", () => shutdown("SIGTERM")); process.once("SIGINT", () => shutdown("SIGINT"));
