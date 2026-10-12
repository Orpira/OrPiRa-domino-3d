// Comprobaciones posteriores al despliegue (DEPLOY_PLAN.md). Uso:
//   node scripts/production-smoke.mjs https://api-domino.orpira.es [--rate-limit]
// Crea una identidad de prueba «QA MM-DD HH:MM» y juega una partida pública con bots.
const base = (process.argv[2] ?? "").replace(/\/+$/, ""); if (!base) { console.error("Falta la URL base"); process.exit(2); }
const rateLimit = process.argv.includes("--rate-limit"); const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const expected = { currencyLabel: "COP simulados · sin valor monetario", initialCredit: 100000, entry: 5000, playerCount: 4, commissionPercent: 0, prize: 20000, targetScore: 100, expiresAfterMinutes: 15, version: 1 };
async function call(path, { token, body } = {}) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
}
const check = (label, ok, detail = "") => { console.log(`${ok ? "OK  " : "FALLO"} ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) process.exitCode = 1; return ok; };

if (rateLimit) {
  // Envía consultas ligeras en lotes paralelos de 50 hasta recibir 429 (máximo 700), para que caigan dentro de una misma
  // ventana de 60 s aunque la latencia sea alta. Muestra Retry-After; bloquea esta IP como mucho una ventana.
  let sent = 0; let blocked = null; const startedAt = Date.now();
  while (sent < 700 && !blocked) {
    const batch = await Promise.all(Array.from({ length: 50 }, () => call("/api/simulated-conditions"))); sent += batch.length;
    blocked = batch.find((response) => response.status === 429) ?? null;
  }
  console.log(`${sent} peticiones en ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
  check("límite de peticiones responde 429 con Retry-After", Boolean(blocked && blocked.body?.code === "RATE_LIMITED" && Number(blocked.headers.get("retry-after")) > 0),
    blocked ? `429 tras ${sent} peticiones, Retry-After ${blocked.headers.get("retry-after")} s, cuerpo ${JSON.stringify(blocked.body)}` : `sin 429 tras ${sent}`);
  process.exit();
}

const health = await call("/health"); check("GET /health", health.status === 200 && health.body?.ok === true, JSON.stringify(health.body));
const conditions = await call("/api/simulated-conditions"); check("GET /api/simulated-conditions con los importes esperados", JSON.stringify(conditions.body) === JSON.stringify(expected), JSON.stringify(conditions.body));
const grant = (await call("/api/test-identities", { body: { displayName: `QA ${new Date().toISOString().slice(5, 16).replace("T", " ")}` } })).body;
check("identidad de prueba creada", Boolean(grant?.identityToken), grant?.displayName); const token = grant.identityToken;
let view = (await call("/api/quick-play/join", { token, body: {} })).body; const started = Date.now();
check("en cola de Jugar ahora", Boolean(view.ticket || view.match), view.ticket ? `bots en ${Math.round((view.ticket.botsFillAt - view.ticket.serverNow) / 1000)} s` : "mesa inmediata");
let commandId = 0; let lastRevision = -1;
while (Date.now() - started < 25 * 60_000) {
  view = (await call("/api/quick-play", { token })).body; const match = view.match;
  if (match?.status === "ENDED") break;
  const action = match?.legalActions?.[0];
  if (match && action && match.game.revision !== lastRevision) {
    lastRevision = match.game.revision;
    await call("/api/quick-play/commands", { token, body: { commandId: `smoke-${Date.now()}-${commandId++}`, expectedRevision: match.game.revision, command: action.type === "PASS" ? { type: "PASS" } : { type: "PLACE", tileId: action.tileId, ...(action.side ? { side: action.side } : {}) } } });
  } else if (match?.game.phase === "ROUND_ENDED" && match.game.revision !== lastRevision) {
    lastRevision = match.game.revision; await call("/api/quick-play/commands", { token, body: { commandId: `smoke-next-${commandId++}`, expectedRevision: match.game.revision, command: { type: "NEXT_ROUND" } } });
  } else await sleep(1_000);
}
const match = view.match; check("partida de Jugar ahora terminada", match?.status === "ENDED", match ? `${Math.round((Date.now() - started) / 1000)} s, marcador ${match.seats.map((seat) => `${seat.displayName}${seat.bot ? "[Bot]" : ""}=${match.game.players.find((player) => player.playerId === seat.playerId)?.score}`).join(" ")}` : "sin partida");
check("mesa completada con bots identificados", (match?.seats ?? []).filter((seat) => seat.bot).every((seat) => seat.displayName.startsWith("Bot")) && (match?.seats ?? []).some((seat) => seat.bot));
const award = match?.league; check("puntos de liga concedidos en el resultado", Boolean(award), award ? `${award.position}.º, ${award.humans} humano(s), automático ${award.automatic}, +${award.points}` : "sin concesión");
await sleep(3_000); const first = (await call("/api/league/history", { token })).body; await sleep(5_000); const second = (await call("/api/league/history", { token })).body;
const league = (await call("/api/league", { token })).body;
check("concesión única por matchId", first.awards.filter((entry) => entry.matchId === match.matchId).length === 1 && second.awards.filter((entry) => entry.matchId === match.matchId).length === 1 && second.awards.length === 1);
check("puntos de temporada = puntos concedidos", league.viewer?.points === award?.points, `temporada ${league.season?.id}, ${league.viewer?.points} pts, posición ${league.viewer?.position}`);
const history = (await call("/api/quick-play/history", { token })).body; check("partida en el historial público", history.some((entry) => entry.matchId === match.matchId));
