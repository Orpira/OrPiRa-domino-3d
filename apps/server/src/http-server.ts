import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CommandEnvelope } from "../../../packages/protocol/src/index.ts";
import { AuthoritativeRoom } from "./authoritative-room.ts";
import type { LobbyManager } from "./lobby.ts";

export interface HttpServerOptions { readonly allowedOrigins?: readonly string[] }

export class RoomRegistry {
  private readonly rooms = new Map<string, AuthoritativeRoom>();
  add(room: AuthoritativeRoom) { this.rooms.set(room.state.matchId, room); }
  get(matchId: string) { return this.rooms.get(matchId) ?? null; }
}
function json(response: ServerResponse, status: number, value: unknown, headers: Readonly<Record<string, string>> = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }); response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function session(request: IncomingMessage) { const value = request.headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7) : null; }

export function createDominoHttpServer(registry: RoomRegistry, lobbyManager?: LobbyManager, options: HttpServerOptions = {}) {
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const corsHeaders = origin && allowedOrigins.has(origin) ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "600", vary: "Origin" } : {};
    const send = (status: number, value: unknown) => json(response, status, value, corsHeaders);
    try {
      if (origin && !allowedOrigins.has(origin)) return json(response, 403, { code: "ORIGIN_NOT_ALLOWED" });
      if (request.method === "OPTIONS") return response.writeHead(204, corsHeaders).end();
      if (request.method === "GET" && request.url === "/health") return send(200, { ok: true });
      if (lobbyManager && request.method === "POST" && request.url === "/api/lobbies") {
        const input = await body(request) as { name?: string }; return send(201, await lobbyManager.create(input.name ?? ""));
      }
      const lobbyRoute = request.url?.match(/^\/api\/lobbies\/([A-Za-z0-9]+)(?:\/(join|commands))?$/);
      if (lobbyManager && lobbyRoute) {
        const code = lobbyRoute[1]!; const action = lobbyRoute[2];
        if (request.method === "POST" && action === "join") { const input = await body(request) as { name?: string }; return send(200, await lobbyManager.join(code, input.name ?? "")); }
        const sessionId = session(request); if (!sessionId) return send(401, { code: "UNAUTHENTICATED" });
        if (request.method === "GET" && !action) { const view = await lobbyManager.view(code, sessionId); return view ? send(200, view) : send(401, { code: "UNAUTHENTICATED" }); }
        if (request.method === "POST" && action === "commands") { const result = await lobbyManager.command(code, sessionId, await body(request) as CommandEnvelope); return result ? send(result.ok ? 200 : 409, result) : send(401, { code: "UNAUTHENTICATED" }); }
      }
      const match = request.url?.match(/^\/matches\/([^/]+)(?:\/commands)?$/); if (!match) return send(404, { code: "MATCH_NOT_FOUND" });
      const room = registry.get(decodeURIComponent(match[1]!)); if (!room) return send(404, { code: "MATCH_NOT_FOUND" });
      const sessionId = session(request); if (!sessionId) return send(401, { code: "UNAUTHENTICATED" });
      if (request.method === "GET") { const view = room.connect(sessionId); return view ? send(200, view) : send(401, { code: "UNAUTHENTICATED" }); }
      if (request.method === "POST" && request.url?.endsWith("/commands")) {
        const result = await room.submit(sessionId, await body(request) as CommandEnvelope); return send(result.ok ? 200 : 409, result);
      }
      return send(405, { code: "METHOD_NOT_ALLOWED" });
    } catch (error) { return send(400, { code: (error as Error).message || "INVALID_MESSAGE" }); }
  });
}
