import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ChatView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { CompetitionManager, createDominoHttpServer, DEFAULT_QUICK_PLAY, JsonFileMatchStore, LobbyManager, QuickPlayManager, RoomRegistry } from "../src/index.ts";
import { ChatManager, HALL_HISTORY, maskProfanity, type ChatAccess, type ChatPhase } from "../src/chat.ts";
import { chatResolver } from "../src/chat-access.ts";

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "domino-chat-")); const clock = { t: 1_000_000 }; const now = () => clock.t;
  const store = new JsonFileMatchStore(join(directory, "matches"));
  const identities = await CompetitionManager.open(join(directory, "economy.json"), store, now);
  const lobbies = await LobbyManager.open(join(directory, "lobbies.json"), store, now);
  const quick = await QuickPlayManager.open(join(directory, "quick-play.json"), store, (token) => identities.identify(token), now);
  const chat = await ChatManager.open(join(directory, "chat-reports.json"), chatResolver(identities, lobbies, quick), now);
  const people = async (...names: string[]) => { const grants: TestIdentityGrant[] = []; for (const name of names) grants.push(await identities.createIdentity(name)); return grants; };
  return { directory, clock, identities, lobbies, quick, chat, people, close: () => rm(directory, { recursive: true, force: true }) };
}
/** Resolvedor a medida para probar reglas sin montar partidas: una mesa en la fase indicada. */
function fakeChat(state: { phase: ChatPhase; policy: ChatAccess["policy"]; canSend?: boolean }, clock: { t: number }, directory: string) {
  const mutes = new Map<string, readonly string[]>();
  return ChatManager.open(join(directory, "reports.json"), (channel, token) => ({
    identityId: token, displayName: token.toUpperCase(), mutedIdentityIds: mutes.get(token) ?? [], setMuted: async (ids) => { mutes.set(token, ids); },
    canSend: state.canSend ?? true, policy: state.policy,
    ...(channel.type === "LOBBY" ? {} : { table: { matchId: "m1", identityId: token, playerId: token, displayName: token.toUpperCase(), phase: () => state.phase, closed: () => false } }),
  }), () => clock.t);
}
const TABLE = { type: "PRIVATE", code: "ABC123" } as const; const HALL = { type: "LOBBY" } as const;

describe("Chat: filtro de palabrotas (enmascara, no rechaza)", () => {
  test("palabrotas en español con variantes colombianas, tildes, leet y letras separadas", () => {
    assert.equal(maskProfanity("eres un hijueputa"), "eres un *********");
    assert.equal(maskProfanity("qué GONORREA de jugada"), "qué ******** de jugada");
    assert.equal(maskProfanity("m a l p a r i d o"), "* * * * * * * * *");
    assert.equal(maskProfanity("H1JU3PUT4!"), "**********".slice(0, 9) + "!");
    assert.equal(maskProfanity("ese hp otra vez"), "ese ** otra vez");
    assert.equal(maskProfanity("pirobo y huevón"), "****** y ******");
    // Sin falsos positivos dentro de otras palabras; «chimba» sola es elogio en Colombia.
    assert.equal(maskProfanity("computadora, disputa y ¡qué chimba!"), "computadora, disputa y ¡qué chimba!");
    assert.equal(maskProfanity("¡Bien jugado! 👏"), "¡Bien jugado! 👏");
  });
});

describe("Chat de mesa: reglas del servidor", () => {
  test("durante una mano se rechaza el texto libre; frases y emojis sí; entre manos y al final, texto filtrado", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-chat-rules-")); const clock = { t: 0 }; const state = { phase: "ROUND_ACTIVE" as ChatPhase, policy: "QUICK" as const };
    try {
      const chat = await fakeChat(state, clock, directory);
      assert.throws(() => chat.send(TABLE, "ana", { kind: "TEXT", text: "hola" }), /CHAT_QUICK_ONLY/);
      assert.equal(chat.send(TABLE, "ana", { kind: "PHRASE", id: "good_luck" }).text, "Buena suerte"); clock.t += 2_000;
      assert.equal(chat.send(TABLE, "ana", { kind: "EMOJI", id: "applause" }).text, "👏"); clock.t += 2_000;
      for (const bad of [{ kind: "PHRASE", id: "tengo_el_seis" }, { kind: "EMOJI", id: "🂠" }, { kind: "TEXT" }, null]) assert.throws(() => chat.send(TABLE, "ana", bad), /CHAT_INVALID_CONTENT/);
      (state as { policy: string }).policy = "TEXT"; state.phase = "ROUND_ENDED";
      assert.equal(chat.send(TABLE, "ana", { kind: "TEXT", text: "  buena mano, malparido  " }).text, "buena mano, *********"); clock.t += 2_000;
      assert.throws(() => chat.send(TABLE, "ana", { kind: "TEXT", text: "x".repeat(201) }), /CHAT_INVALID_CONTENT/);
      assert.equal(chat.send(TABLE, "ana", { kind: "TEXT", text: "ñ".repeat(200) }).text.length, 200);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("límite de frecuencia: 1 cada 2 s y 10 por minuto por identidad (entre todos los chats)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-chat-rate-")); const clock = { t: 0 };
    try {
      const chat = await fakeChat({ phase: "ROUND_ENDED", policy: "TEXT" }, clock, directory);
      chat.send(TABLE, "ana", { kind: "TEXT", text: "uno" }); clock.t += 1_999;
      assert.throws(() => chat.send(TABLE, "ana", { kind: "TEXT", text: "dos" }), /CHAT_RATE_LIMITED/);
      assert.throws(() => chat.send(HALL, "ana", { kind: "TEXT", text: "dos" }), /CHAT_RATE_LIMITED/);
      chat.send(TABLE, "beto", { kind: "TEXT", text: "otra identidad" });
      clock.t += 1; for (let i = 2; i <= 10; i++) { chat.send(TABLE, "ana", { kind: "TEXT", text: `m${i}` }); clock.t += 2_000; }
      assert.throws(() => chat.send(TABLE, "ana", { kind: "TEXT", text: "once" }), /CHAT_RATE_LIMITED/);
      clock.t = 62_001; assert.equal(chat.send(TABLE, "ana", { kind: "TEXT", text: "ya" }).text, "ya");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("silenciar: el servidor no envía al silenciador los mensajes del silenciado (los demás sí los ven)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-chat-mute-")); const clock = { t: 0 };
    try {
      const chat = await fakeChat({ phase: "ROUND_ENDED", policy: "TEXT" }, clock, directory);
      chat.send(TABLE, "beto", { kind: "TEXT", text: "hola a todos" }); clock.t += 2_000;
      await chat.mute(TABLE, "ana", { authorId: "beto", muted: true });
      chat.send(TABLE, "beto", { kind: "TEXT", text: "¿me leen?" });
      assert.deepEqual(chat.view(TABLE, "ana").messages.map((message) => message.text), []); assert.deepEqual(chat.view(TABLE, "ana").mutedIdentityIds, ["beto"]);
      assert.deepEqual(chat.view(TABLE, "cora").messages.map((message) => message.text), ["hola a todos", "¿me leen?"]);
      await assert.rejects(() => chat.mute(TABLE, "ana", { authorId: "ana", muted: true }), /CHAT_INVALID_MUTE/);
      await chat.mute(TABLE, "ana", { authorId: "beto", muted: false }); assert.equal(chat.view(TABLE, "ana").messages.length, 2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("reportar: JSON aparte con id, texto, autor, quien reporta y fecha; una vez por persona", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-chat-report-")); const clock = { t: 5 };
    try {
      const chat = await fakeChat({ phase: "ROUND_ENDED", policy: "TEXT" }, clock, directory);
      const message = chat.send(TABLE, "beto", { kind: "TEXT", text: "eres un gonorrea" });
      await chat.report(TABLE, "ana", { messageId: message.messageId }); await chat.report(TABLE, "ana", { messageId: message.messageId });
      const reports = JSON.parse(await readFile(join(directory, "reports.json"), "utf8")) as unknown[];
      assert.deepEqual(reports, [{ messageId: message.messageId, text: "eres un ********", author: { identityId: "beto", name: "BETO" }, reporterId: "ana", at: 5 }]);
      assert.equal((await stat(join(directory, "reports.json"))).mode & 0o777, 0o600);
      await assert.rejects(() => chat.report(TABLE, "ana", { messageId: "no-existe" }), /CHAT_MESSAGE_NOT_FOUND/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("el historial de mesa se descarta al terminar la partida", async () => {
    const directory = await mkdtemp(join(tmpdir(), "domino-chat-end-")); const clock = { t: 0 }; const state = { phase: "ROUND_ENDED" as ChatPhase, policy: "TEXT" as const };
    try {
      const chat = await fakeChat(state, clock, directory); chat.send(TABLE, "ana", { kind: "TEXT", text: "suerte" });
      state.phase = "MATCH_ENDED"; chat.prune(); assert.equal(chat.view(TABLE, "beto").messages.length, 0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe("Chat con las partidas reales", () => {
  test("sala con código en juego: texto rechazado durante la mano; frases rápidas sí", async () => {
    const state = await setup(); try {
      const host = await state.lobbies.create("Ana"); const guests = []; for (const name of ["Beto", "Cora", "Dani"]) guests.push(await state.lobbies.join(host.code, name));
      const channel = { type: "PRIVATE", code: host.code } as const;
      assert.equal(state.chat.view(channel, host.sessionId).policy, "QUICK");
      assert.throws(() => state.chat.send(channel, host.sessionId, { kind: "TEXT", text: "tengo el seis" }), /CHAT_QUICK_ONLY/);
      const sent = state.chat.send(channel, guests[0]!.sessionId, { kind: "PHRASE", id: "good_luck" });
      assert.equal(sent.authorName, "Beto"); assert.equal(sent.playerId, "P1");
      assert.deepEqual(state.chat.view(channel, host.sessionId).messages.map((message) => message.text), ["Buena suerte"]);
      assert.throws(() => state.chat.view(channel, "sesion-falsa"), /UNAUTHENTICATED/);
    } finally { await state.close(); }
  });

  test("Competición de prueba: solo frases rápidas, siempre (ni emojis ni texto, tampoco antes de empezar)", async () => {
    const state = await setup(); try {
      const grants = await state.people("Ana", "Beto", "Cora", "Dani");
      const code = (await state.identities.create(grants[0]!.identityToken)).code; const channel = { type: "COMPETITION", code } as const;
      assert.equal(state.chat.view(channel, grants[0]!.identityToken).policy, "PHRASES");
      assert.throws(() => state.chat.send(channel, grants[0]!.identityToken, { kind: "TEXT", text: "hola" }), /CHAT_PHRASES_ONLY/);
      for (const grant of grants.slice(1)) await state.identities.join(code, grant.identityToken);
      for (const grant of grants) await state.identities.accept(code, grant.identityToken, 1);
      assert.throws(() => state.chat.send(channel, grants[1]!.identityToken, { kind: "EMOJI", id: "applause" }), /CHAT_PHRASES_ONLY/);
      assert.equal(state.chat.send(channel, grants[1]!.identityToken, { kind: "PHRASE", id: "well_played" }).text, "Bien jugado");
      // Mientras juega una Competición, tampoco escribe texto libre en el vestíbulo.
      assert.equal(state.chat.view({ type: "LOBBY" }, grants[1]!.identityToken).policy, "PHRASES");
    } finally { await state.close(); }
  });

  test("vestíbulo: escribir exige una partida terminada; últimos 50; quien entra recibe el historial; los bots no escriben", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto");
      assert.throws(() => state.chat.send({ type: "LOBBY" }, ana!.identityToken, { kind: "TEXT", text: "hola" }), /CHAT_FINISHED_MATCH_REQUIRED/);
      assert.equal(state.chat.view({ type: "LOBBY" }, ana!.identityToken).canSend, false);
      // Ana termina una partida de «Jugar ahora» contra tres bots.
      await state.quick.join(ana!.identityToken); state.clock.t += DEFAULT_QUICK_PLAY.fillAfterMs; await state.quick.tick();
      const matchId = (await state.quick.view(ana!.identityToken)).match!.matchId; const table = { type: "QUICK", matchId } as const;
      state.chat.send(table, ana!.identityToken, { kind: "EMOJI", id: "wave" }); state.clock.t += 2_000;
      for (let guard = 0; guard < 50_000 && (await state.quick.view(ana!.identityToken)).match!.status !== "ENDED"; guard++) { state.clock.t += 40_000; await state.quick.tick(); }
      assert.ok(state.quick.hasFinishedMatch(ana!.identityId));
      assert.throws(() => state.quick.tableChat(matchId, "bot-session-falsa"), /UNAUTHENTICATED/);
      for (let i = 0; i < HALL_HISTORY + 5; i++) { state.chat.send({ type: "LOBBY" }, ana!.identityToken, { kind: "TEXT", text: `m${i}` }); state.clock.t += 7_000; }
      const view = state.chat.view({ type: "LOBBY" }, beto!.identityToken); assert.equal(view.messages.length, HALL_HISTORY);
      assert.equal(view.messages[0]!.text, "m5"); assert.equal(view.canSend, false);
      assert.ok(view.messages.every((message) => message.authorId === ana!.identityId));
    } finally { await state.close(); }
  });

  test("silenciados guardados en la identidad: sobreviven a un reinicio", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto");
      await state.identities.setChatMuted(ana!.identityId, [beto!.identityId]);
      const reopened = await CompetitionManager.open(join(state.directory, "economy.json"), new JsonFileMatchStore(join(state.directory, "matches")));
      assert.deepEqual(reopened.chatMuted(ana!.identityId), [beto!.identityId]);
    } finally { await state.close(); }
  });

  test("HTTP: estados de error del chat sin cambiar los del resto (la Competición sigue respondiendo 400)", async () => {
    const state = await setup();
    const server = createDominoHttpServer(new RoomRegistry(), state.lobbies, { competitionManager: state.identities, quickPlayManager: state.quick, chatManager: state.chat });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const [ana] = await state.people("Ana"); const auth = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
      assert.equal((await fetch(`${base}/api/chat/lobby`)).status, 401);
      const hall = await fetch(`${base}/api/chat/lobby`, { headers: auth(ana!.identityToken) }); assert.equal(hall.status, 200); assert.equal(((await hall.json()) as ChatView).canSend, false);
      const denied = await fetch(`${base}/api/chat/lobby`, { method: "POST", headers: auth(ana!.identityToken), body: JSON.stringify({ kind: "TEXT", text: "hola" }) });
      assert.equal(denied.status, 403); assert.equal(((await denied.json()) as { code: string }).code, "CHAT_FINISHED_MATCH_REQUIRED");
      const competition = await fetch(`${base}/api/competitions/ZZZZZZ/accept`, { method: "POST", headers: auth("token-ajeno"), body: JSON.stringify({ conditionsVersion: 1 }) });
      assert.equal(competition.status, 400);
    } finally { server.close(); await state.close(); }
  });
});
