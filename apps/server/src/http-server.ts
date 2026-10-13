import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { GameMode } from "../../../packages/rules/src/index.ts";
import type { CommandEnvelope } from "../../../packages/protocol/src/index.ts";
import { AuthoritativeRoom } from "./authoritative-room.ts";
import type { LobbyManager } from "./lobby.ts";
import type { CompetitionManager } from "./competition.ts";
import type { QuickPlayManager } from "./quick-play.ts";
import type { LeagueManager } from "./league.ts";
import { FixedWindowLimiter, requestSource, type WindowLimit } from "./rate-limit.ts";

export interface HttpServerOptions {
  readonly allowedOrigins?: readonly string[]; readonly competitionManager?: CompetitionManager; readonly quickPlayManager?: QuickPlayManager; readonly leagueManager?: LeagueManager;
  // Límites por origen (IP); `max: 0` o ausencia los desactiva. `trustProxy` solo con un proxy propio delante.
  readonly requestLimit?: WindowLimit; readonly identityLimit?: WindowLimit; readonly trustProxy?: boolean; readonly now?: () => number;
}

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
// «Jugar ahora» aceptaba el alta sin cuerpo; los clientes anteriores siguen funcionando.
async function optionalBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8").trim(); return text ? JSON.parse(text) : {};
}
function session(request: IncomingMessage) { const value = request.headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7) : null; }

export function createDominoHttpServer(registry: RoomRegistry, lobbyManager?: LobbyManager, options: HttpServerOptions = {}) {
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const requestLimiter = options.requestLimit?.max ? new FixedWindowLimiter(options.requestLimit, options.now) : null;
  const identityLimiter = options.identityLimit?.max ? new FixedWindowLimiter(options.identityLimit, options.now) : null;
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const corsHeaders = origin && allowedOrigins.has(origin) ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "600", vary: "Origin" } : {};
    const send = (status: number, value: unknown) => json(response, status, value, corsHeaders);
    try {
      if (origin && !allowedOrigins.has(origin)) return json(response, 403, { code: "ORIGIN_NOT_ALLOWED" });
      if (request.method === "OPTIONS") return response.writeHead(204, corsHeaders).end();
      if (request.method === "GET" && request.url === "/health") return send(200, { ok: true });
      const source = requestSource(request, options.trustProxy ?? false);
      const limited = (code: string, retryAfterSeconds: number) => { response.setHeader("retry-after", String(retryAfterSeconds)); return send(429, { code, retryAfterSeconds }); };
      const requestDecision = requestLimiter?.take(source); if (requestDecision && !requestDecision.allowed) return limited("RATE_LIMITED", requestDecision.retryAfterSeconds);
      const competitionManager = options.competitionManager;
      if (competitionManager && request.method === "GET" && request.url === "/api/simulated-conditions") return send(200, competitionManager.conditions());
      if (competitionManager && request.method === "POST" && request.url === "/api/test-identities") {
        const identityDecision = identityLimiter?.check(source); if (identityDecision && !identityDecision.allowed) return limited("IDENTITY_LIMIT_REACHED", identityDecision.retryAfterSeconds);
        const input = await body(request) as { displayName?: string }; const grant = await competitionManager.createIdentity(input.displayName ?? ""); identityLimiter?.record(source); return send(201, grant);
      }
      if (competitionManager && request.method === "GET" && request.url === "/api/test-account") {
        const identityToken = session(request); if (!identityToken) return send(401, { code: "UNAUTHENTICATED" }); return send(200, await competitionManager.account(identityToken));
      }
      if (competitionManager && request.method === "POST" && request.url === "/api/competitions") {
        const identityToken = session(request); if (!identityToken) return send(401, { code: "UNAUTHENTICATED" }); return send(201, await competitionManager.create(identityToken));
      }
      const league = options.leagueManager; const leagueRoute = request.url?.match(/^\/api\/league(?:\/(history))?$/);
      if (league && leagueRoute) {
        // Solo lectura: no existe ninguna ruta que acepte puntos, rangos ni posiciones del cliente.
        if (request.method !== "GET") return send(405, { code: "METHOD_NOT_ALLOWED" });
        const token = session(request); const viewer = token ? options.competitionManager?.identify(token) ?? null : null;
        if (leagueRoute[1] === "history") { if (!viewer) return send(401, { code: "UNAUTHENTICATED" }); return send(200, await league.historyFor(viewer.identityId)); }
        if (token && !viewer) return send(401, { code: "UNAUTHENTICATED" });
        return send(200, await league.view(viewer?.identityId ?? null));
      }
      const quickPlay = options.quickPlayManager; const quickRoute = request.url?.match(/^\/api\/quick-play(?:\/(join|cancel|dismiss|commands|history))?$/);
      if (quickPlay && quickRoute) {
        const action = quickRoute[1]; const identityToken = session(request); if (!identityToken) return send(401, { code: "UNAUTHENTICATED" });
        if (request.method === "GET" && !action) return send(200, await quickPlay.view(identityToken));
        if (request.method === "GET" && action === "history") return send(200, await quickPlay.historyFor(identityToken));
        if (request.method === "POST" && action === "join") { const input = await optionalBody(request) as { mode?: GameMode }; return send(200, await quickPlay.join(identityToken, input.mode ?? "INDIVIDUAL")); }
        if (request.method === "POST" && action === "cancel") return send(200, await quickPlay.cancel(identityToken));
        if (request.method === "POST" && action === "dismiss") return send(200, await quickPlay.dismiss(identityToken));
        if (request.method === "POST" && action === "commands") { const result = await quickPlay.command(identityToken, await body(request) as CommandEnvelope); return send(result.ok ? 200 : 409, result); }
        return send(405, { code: "METHOD_NOT_ALLOWED" });
      }
      const competitionRoute = request.url?.match(/^\/api\/competitions\/([A-Za-z0-9]+)(?:\/(join|accept|leave|cancel|annul|commands))?$/);
      if (competitionManager && competitionRoute) {
        const code = competitionRoute[1]!; const action = competitionRoute[2]; const identityToken = session(request); if (!identityToken) return send(401, { code: "UNAUTHENTICATED" });
        if (request.method === "GET" && !action) return send(200, await competitionManager.view(code, identityToken));
        if (request.method === "POST" && action === "join") return send(200, await competitionManager.join(code, identityToken));
        if (request.method === "POST" && action === "accept") { const input = await body(request) as { conditionsVersion?: number }; return send(200, await competitionManager.accept(code, identityToken, input.conditionsVersion ?? -1)); }
        if (request.method === "POST" && action === "leave") return send(200, await competitionManager.leave(code, identityToken));
        if (request.method === "POST" && action === "cancel") return send(200, await competitionManager.cancel(code, identityToken));
        if (request.method === "POST" && action === "annul") return send(200, await competitionManager.requestAnnulment(code, identityToken));
        if (request.method === "POST" && action === "commands") { const result = await competitionManager.command(code, identityToken, await body(request) as CommandEnvelope); return send(result.ok ? 200 : 409, result); }
      }
      if (lobbyManager && request.method === "POST" && request.url === "/api/lobbies") {
        const input = await body(request) as { name?: string; mode?: GameMode }; return send(201, await lobbyManager.create(input.name ?? "", input.mode ?? "INDIVIDUAL"));
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
