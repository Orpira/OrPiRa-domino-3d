import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { LobbyPreview, SessionGrant, SocialView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { CompetitionManager, createDominoHttpServer, JsonFileMatchStore, JsonSocialRepository, LobbyManager, normalizeUsername, RoomRegistry, SocialManager } from "../src/index.ts";

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "domino-invites-")); const store = new JsonFileMatchStore(join(directory, "matches"));
  const identities = await CompetitionManager.open(join(directory, "economy.json"), store);
  const open = async () => new SocialManager(await JsonSocialRepository.open(join(directory, "social.json")), (token) => identities.identify(token), (id) => identities.displayNameOf(id));
  const social = await open(); const lobbies = await LobbyManager.open(join(directory, "lobbies.json"), store); lobbies.attachSocial(social);
  const people = async (...names: string[]) => { const grants: TestIdentityGrant[] = []; for (const name of names) grants.push(await identities.createIdentity(name)); return grants; };
  return { directory, identities, social, lobbies, open, people, close: () => rm(directory, { recursive: true, force: true }) };
}

describe("Nombres de usuario", () => {
  test("formato: 3–20 caracteres, minúsculas, números, punto y guion bajo; se acepta «@» y mayúsculas", () => {
    assert.equal(normalizeUsername(" @Ana_Pérez".replace("é", "e")), "ana_perez");
    for (const bad of ["ab", "ñandu", "a b c", ".ana", "x".repeat(21), ""]) assert.throws(() => normalizeUsername(bad), /INVALID_USERNAME/);
  });

  test("único sin distinguir mayúsculas, uno por cuenta, y el token de la cuenta no cambia", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto");
      const view = await state.social.claimUsername(ana!.identityToken, "AnaRaad"); assert.equal(view.username, "anaraad"); assert.equal(view.displayName, "Ana");
      await assert.rejects(() => state.social.claimUsername(beto!.identityToken, "anaraad"), /USERNAME_TAKEN/);
      await assert.rejects(() => state.social.claimUsername(ana!.identityToken, "otra"), /USERNAME_ALREADY_SET/);
      assert.equal(state.identities.identify(ana!.identityToken)!.identityId, ana!.identityId);
      // Persistencia atómica, archivo privado y relectura tras reinicio.
      assert.equal((await stat(join(state.directory, "social.json"))).mode & 0o777, 0o600);
      assert.equal((await (await state.open()).view(ana!.identityToken)).username, "anaraad");
    } finally { await state.close(); }
  });

  test("con peticiones simultáneas por el mismo nombre solo una lo consigue y el archivo queda íntegro", async () => {
    const state = await setup(); try {
      const grants = await state.people(...Array.from({ length: 12 }, (_, index) => `J${index}`));
      const results = await Promise.allSettled(grants.map((grant) => state.social.claimUsername(grant.identityToken, "mesa")));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const distinct = await Promise.allSettled(grants.map((grant, index) => state.social.claimUsername(grant.identityToken, `jugador${index}`)));
      assert.equal(distinct.filter((result) => result.status === "fulfilled").length, 11);
      const saved = JSON.parse(await readFile(join(state.directory, "social.json"), "utf8")) as { profiles: unknown[] }; assert.equal(saved.profiles.length, 12);
    } finally { await state.close(); }
  });
});

describe("Invitaciones a salas con código", () => {
  test("vista previa pública: modalidad, jugadores y quien invita; sin sesiones ni identidades", async () => {
    const state = await setup(); try {
      const [ana] = await state.people("Ana"); await state.social.claimUsername(ana!.identityToken, "ana");
      const host = await state.lobbies.create("Ana", { mode: "PAIRS" }, ana!.identityId);
      const preview = (await state.lobbies.preview(host.code.toLowerCase(), "ana"))!;
      assert.deepEqual(preview, { code: host.code, mode: "PAIRS", rules: "LATINO", targetScore: 200, status: "WAITING", players: ["Ana"], freeSeats: 3, inviter: "Ana" });
      assert.equal(JSON.stringify(preview).includes(host.sessionId), false); assert.equal(JSON.stringify(preview).includes(ana!.identityId), false);
      assert.equal((await state.lobbies.preview(host.code, "desconocido"))!.inviter, null);
      assert.equal(await state.lobbies.preview("ZZZZZZ"), null);
    } finally { await state.close(); }
  });

  test("entrar por invitación con cuenta crea la amistad con quien invitó; sin invitación o sin cuenta, no", async () => {
    const state = await setup(); try {
      const [ana, beto, cora, dani] = await state.people("Ana", "Beto", "Cora", "Dani");
      await state.social.claimUsername(ana!.identityToken, "ana"); await state.social.claimUsername(beto!.identityToken, "beto");
      const host = await state.lobbies.create("Ana", {}, ana!.identityId);
      const betoGrant = await state.lobbies.join(host.code, "Beto", beto!.identityId, { inviter: "ana" }); assert.equal(betoGrant.friendWith, "Ana");
      // Cora entra con el enlace que compartió Beto: amiga de Beto, no de Ana.
      const coraGrant = await state.lobbies.join(host.code, "Cora", cora!.identityId, { inviter: "beto" }); assert.equal(coraGrant.friendWith, "Beto");
      const anonymous = await state.lobbies.join(host.code, "Eva", undefined, { inviter: "ana" }); assert.equal(anonymous.friendWith, undefined);
      const friendsOf = async (grant: TestIdentityGrant) => (await state.social.view(grant.identityToken)).friends.map((friend) => friend.displayName);
      assert.deepEqual(await friendsOf(ana!), ["Beto"]); assert.deepEqual(await friendsOf(beto!), ["Ana", "Cora"]); assert.deepEqual(await friendsOf(cora!), ["Beto"]);
      assert.deepEqual((await state.social.view(ana!.identityToken)).friends[0], { username: "beto", displayName: "Beto", since: (await state.social.view(ana!.identityToken)).friends[0]!.since });
      // Sala nueva sin invitación: no crea amistad.
      const other = await state.lobbies.create("Ana", {}, ana!.identityId); await state.lobbies.join(other.code, "Dani", dani!.identityId); assert.deepEqual(await friendsOf(dani!), []);
    } finally { await state.close(); }
  });

  test("enlace sin «de»: amistad con quien creó la sala; nunca consigo mismo ni dos veces la misma cuenta en una sala", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto");
      const host = await state.lobbies.create("Ana", {}, ana!.identityId);
      assert.equal((await state.lobbies.join(host.code, "Beto", beto!.identityId, {})).friendWith, "Ana");
      await assert.rejects(() => state.lobbies.join(host.code, "Beto otra vez", beto!.identityId, {}), /ALREADY_IN_ROOM/);
      const solo = await state.lobbies.create("Beto", {}, beto!.identityId);
      const anonymousHost = await state.lobbies.create("Nadie"); assert.equal((await state.lobbies.join(anonymousHost.code, "Ana", ana!.identityId, {})).friendWith, undefined);
      assert.ok(solo.code);
    } finally { await state.close(); }
  });

  test("una relación bloqueada no se convierte en amistad; una pendiente queda aceptada", async () => {
    const state = await setup(); try {
      const [ana, beto, cora] = await state.people("Ana", "Beto", "Cora"); const repository = await JsonSocialRepository.open(join(state.directory, "social-2.json"));
      const social = new SocialManager(repository, (token) => state.identities.identify(token), (id) => state.identities.displayNameOf(id));
      await repository.saveFriendship({ friendshipId: "f1", requesterId: beto!.identityId, addresseeId: ana!.identityId, status: "BLOCKED", createdAt: 1, updatedAt: 1 });
      await repository.saveFriendship({ friendshipId: "f2", requesterId: cora!.identityId, addresseeId: ana!.identityId, status: "PENDING", createdAt: 1, updatedAt: 1 });
      assert.equal(await social.befriendByInvitation(ana!.identityId, beto!.identityId), false);
      assert.equal((await repository.friendshipBetween(ana!.identityId, beto!.identityId))!.status, "BLOCKED");
      assert.equal(await social.befriendByInvitation(ana!.identityId, cora!.identityId), true);
      assert.equal((await repository.friendshipBetween(ana!.identityId, cora!.identityId))!.friendshipId, "f2");
      assert.equal(await social.befriendByInvitation(ana!.identityId, ana!.identityId), false);
    } finally { await state.close(); }
  });

  test("HTTP: nombre de usuario, vista previa, crear y entrar con cuenta por invitación", async () => {
    const state = await setup();
    const server = createDominoHttpServer(new RoomRegistry(), state.lobbies, { competitionManager: state.identities, socialManager: state.social });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const [ana, beto] = await state.people("Ana", "Beto");
      const call = (path: string, init: { token?: string; body?: unknown } = {}) => fetch(`${base}${path}`, { method: init.body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) }, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
      assert.equal((await call("/api/social")).status, 401);
      assert.equal(((await (await call("/api/social/username", { token: ana!.identityToken, body: { username: "ana" } })).json()) as SocialView).username, "ana");
      const taken = await call("/api/social/username", { token: beto!.identityToken, body: { username: "ANA" } }); assert.equal(taken.status, 409); assert.equal(((await taken.json()) as { code: string }).code, "USERNAME_TAKEN");
      assert.equal((await call("/api/social/username", { token: beto!.identityToken, body: { username: "a" } })).status, 400);
      const host = await (await call("/api/lobbies", { token: ana!.identityToken, body: { name: "Ana", rules: "DRAW" } })).json() as SessionGrant;
      const preview = await (await call(`/api/lobbies/${host.code}/preview?de=ana`)).json() as LobbyPreview; assert.deepEqual([preview.rules, preview.inviter, preview.freeSeats], ["DRAW", "Ana", 3]);
      assert.equal((await call("/api/lobbies/ZZZZZZ/preview")).status, 404);
      const joined = await (await call(`/api/lobbies/${host.code}/join`, { token: beto!.identityToken, body: { invitation: { inviter: "ana" } } })).json() as SessionGrant;
      assert.equal(joined.friendWith, "Ana"); assert.equal(joined.playerId, "P1");
      assert.deepEqual(((await (await call("/api/social", { token: beto!.identityToken })).json()) as SocialView).friends.map((friend) => friend.username), ["ana"]);
      assert.equal((await call(`/api/lobbies/${host.code}/join`, { token: "token-falso", body: { name: "X" } })).status, 401);
      // Sin cuenta sigue funcionando como antes.
      assert.equal((await call(`/api/lobbies/${host.code}/join`, { body: { name: "Invitado" } })).status, 200);
    } finally { server.close(); await state.close(); }
  });
});
