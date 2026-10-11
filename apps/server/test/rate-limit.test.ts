import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CompetitionManager, createDominoHttpServer, FixedWindowLimiter, JsonFileMatchStore, RoomRegistry, type HttpServerOptions } from "../src/index.ts";

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
});
