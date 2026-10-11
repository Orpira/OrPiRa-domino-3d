import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CompetitionManager, createDominoHttpServer, DEFAULT_REQUEST_LIMIT, FixedWindowLimiter, JsonFileMatchStore, QuickPlayManager, RoomRegistry, type HttpServerOptions } from "../src/index.ts";
import type { QuickPlayView } from "../../../packages/protocol/src/index.ts";

async function serve(options: Omit<HttpServerOptions, "competitionManager">) {
  const directory = await mkdtemp(join(tmpdir(), "domino-limits-"));
  const manager = await CompetitionManager.open(join(directory, "economy.json"), new JsonFileMatchStore(join(directory, "matches")));
  const server = createDominoHttpServer(new RoomRegistry(), undefined, { ...options, competitionManager: manager });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const close = async () => { await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); };
  return { base, close };
}
const createIdentity = (base: string, displayName: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/test-identities`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ displayName }) });

describe("límites por origen configurables", () => {
  test("la ventana fija bloquea al superar el máximo y se reabre al vencer", () => {
    let clock = 0; const limiter = new FixedWindowLimiter({ max: 2, windowMs: 10_000 }, () => clock);
    assert.equal(limiter.take("a").allowed, true); assert.equal(limiter.take("a").allowed, true);
    assert.deepEqual(limiter.take("a"), { allowed: false, retryAfterSeconds: 10 }); assert.equal(limiter.take("b").allowed, true);
    clock = 9_500; assert.deepEqual(limiter.check("a"), { allowed: false, retryAfterSeconds: 1 });
    clock = 10_000; assert.equal(limiter.take("a").allowed, true);
  });

  test("el límite por defecto no corta una partida normal: cuatro clientes tras la misma IP consultando cada segundo", () => {
    // Cada cliente: consulta de mesa cada 1 s, cuenta cada 15 s, una jugada cada 4 s y algún reintento.
    let clock = 0; const limiter = new FixedWindowLimiter(DEFAULT_REQUEST_LIMIT, () => clock); let requests = 0;
    for (clock = 0; clock < 10 * 60_000; clock += 250) {
      const perTick = (clock % 1_000 === 0 ? 4 : 0) + (clock % 15_000 === 0 ? 4 : 0) + (clock % 4_000 === 0 ? 4 : 0) + (clock % 30_000 === 0 ? 2 : 0);
      for (let index = 0; index < perTick; index++) { requests++; assert.equal(limiter.take("203.0.113.5").allowed, true, `bloqueada en t=${clock}`); }
    }
    assert.ok(requests > 3_000); assert.ok(requests / 10 < DEFAULT_REQUEST_LIMIT.max / 1.5, "margen holgado por minuto");
  });

  test("responde 429 con Retry-After al superar el límite de peticiones y no limita /health", async () => {
    let clock = 0; const { base, close } = await serve({ requestLimit: { max: 3, windowMs: 60_000 }, now: () => clock });
    try {
      for (let index = 0; index < 3; index++) assert.equal((await fetch(`${base}/api/simulated-conditions`)).status, 200);
      const blocked = await fetch(`${base}/api/simulated-conditions`); assert.equal(blocked.status, 429); assert.equal(blocked.headers.get("retry-after"), "60");
      assert.deepEqual(await blocked.json(), { code: "RATE_LIMITED", retryAfterSeconds: 60 });
      assert.equal((await fetch(`${base}/health`)).status, 200);
      clock = 60_000; assert.equal((await fetch(`${base}/api/simulated-conditions`)).status, 200);
    } finally { await close(); }
  });

  test("limita identidades creadas por origen sin contar intentos fallidos", async () => {
    const { base, close } = await serve({ identityLimit: { max: 2, windowMs: 86_400_000 } });
    try {
      assert.equal((await createIdentity(base, "  ")).status, 400);
      assert.equal((await createIdentity(base, "Ana")).status, 201); assert.equal((await createIdentity(base, "Beto")).status, 201);
      const blocked = await createIdentity(base, "Cora"); assert.equal(blocked.status, 429);
      assert.equal((await blocked.json() as { code: string }).code, "IDENTITY_LIMIT_REACHED"); assert.ok(Number(blocked.headers.get("retry-after")) > 86_000);
      // Sin proxy de confianza, una cabecera X-Forwarded-For falsa no abre otro cupo.
      assert.equal((await createIdentity(base, "Dani", { "x-forwarded-for": "203.0.113.9" })).status, 429);
    } finally { await close(); }
  });

  test("detrás de un proxy de confianza cuenta por el cliente que informa el proxy", async () => {
    const { base, close } = await serve({ identityLimit: { max: 1, windowMs: 86_400_000 }, trustProxy: true });
    try {
      assert.equal((await createIdentity(base, "Ana", { "x-forwarded-for": "203.0.113.1" })).status, 201);
      assert.equal((await createIdentity(base, "Beto", { "x-forwarded-for": "203.0.113.1" })).status, 429);
      assert.equal((await createIdentity(base, "Cora", { "x-forwarded-for": "198.51.100.7, 203.0.113.2" })).status, 201);
      assert.equal((await createIdentity(base, "Dani", { "x-forwarded-for": "203.0.113.1, 203.0.113.2" })).status, 429);
    } finally { await close(); }
  });
  test("una partida completa de cuatro jugadores por HTTP, tras la misma IP y consultando cada segundo, nunca recibe 429", async (context) => {
    const directory = await mkdtemp(join(tmpdir(), "domino-limits-match-")); const clock = { t: 1_000_000 }; const now = () => clock.t;
    const store = new JsonFileMatchStore(join(directory, "matches")); const identities = await CompetitionManager.open(join(directory, "economy.json"), store, now);
    const quick = await QuickPlayManager.open(join(directory, "quick.json"), store, (token) => identities.identify(token), now);
    const server = createDominoHttpServer(new RoomRegistry(), undefined, { competitionManager: identities, quickPlayManager: quick, requestLimit: DEFAULT_REQUEST_LIMIT, now });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const tokens: string[] = []; for (const name of ["Ana", "Beto", "Cora", "Dani"]) tokens.push((await identities.createIdentity(name)).identityToken);
      const perMinute = new Map<number, number>(); let total = 0; let limited = 0; let moves = 0;
      const call = async (path: string, token: string, body?: unknown) => {
        total++; const minute = Math.floor(clock.t / 60_000); perMinute.set(minute, (perMinute.get(minute) ?? 0) + 1);
        const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (response.status === 429) limited++; return response.json();
      };
      for (const token of tokens) await call("/api/quick-play/join", token, {});
      const thinkingSince = new Map<string, number>(); let ended = false;
      for (let second = 0; second < 7_200 && !ended; second++) {
        clock.t += 1_000; await quick.tick();
        for (const [index, token] of tokens.entries()) {
          const view = await call("/api/quick-play", token) as QuickPlayView; const match = view.match; if (!match) continue;
          if (match.status === "ENDED") { ended = true; continue; }
          if (second % 15 === index) await call("/api/test-account", token);
          const action = match.legalActions[0];
          if (!action) { thinkingSince.delete(token); continue; }
          const since = thinkingSince.get(token) ?? clock.t; thinkingSince.set(token, since);
          if (clock.t - since >= 2_000) {
            await call("/api/quick-play/commands", token, { commandId: `h-${moves++}`, expectedRevision: match.game.revision, command: action.type === "PASS" ? { type: "PASS" } : { type: "PLACE", tileId: action.tileId!, ...(action.side ? { side: action.side } : {}) } });
            thinkingSince.delete(token);
          }
        }
      }
      const peak = Math.max(...perMinute.values());
      context.diagnostic(`partida terminada: ${ended}; ${moves} jugadas, ${total} peticiones en ${perMinute.size} minutos; máximo ${peak} por minuto frente a ${DEFAULT_REQUEST_LIMIT.max}`);
      assert.equal(ended, true); assert.equal(limited, 0); assert.ok(peak < DEFAULT_REQUEST_LIMIT.max / 2, `pico ${peak} demasiado cerca del límite`);
    } finally { await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
  });
});
