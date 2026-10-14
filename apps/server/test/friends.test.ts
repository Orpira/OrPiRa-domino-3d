import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SocialSearchResult, SocialView, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { CompetitionManager, createDominoHttpServer, INVITATION_TTL_MS, JsonFileMatchStore, JsonSocialRepository, LobbyManager, ONLINE_WINDOW_MS, RoomRegistry, SocialManager } from "../src/index.ts";

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "domino-friends-")); const store = new JsonFileMatchStore(join(directory, "matches")); const clock = { t: 1_000_000 }; const now = () => clock.t;
  const identities = await CompetitionManager.open(join(directory, "economy.json"), store, now);
  const social = new SocialManager(await JsonSocialRepository.open(join(directory, "social.json")), (token) => identities.identify(token), (id) => identities.displayNameOf(id), now);
  const lobbies = await LobbyManager.open(join(directory, "lobbies.json"), store, now); lobbies.attachSocial(social); social.attachRooms((code, id) => lobbies.memberPreview(code, id));
  const people = async (...names: string[]) => { const grants: TestIdentityGrant[] = []; for (const name of names) { const grant = await identities.createIdentity(name); await social.claimUsername(grant.identityToken, name.toLowerCase()); grants.push(grant); } return grants; };
  return { directory, clock, identities, social, lobbies, people, close: () => rm(directory, { recursive: true, force: true }) };
}

describe("Amigos: búsqueda, solicitudes y bloqueos", () => {
  test("buscar por el principio del usuario, sin incluirme y con la relación de cada uno", async () => {
    const state = await setup(); try {
      const [ana] = await state.people("Ana", "Andres", "Andrea", "Beto");
      assert.deepEqual(await state.social.search(ana!.identityToken, "a"), []);
      const found = await state.social.search(ana!.identityToken, "@AND");
      assert.deepEqual(found.map((entry) => [entry.username, entry.displayName, entry.relation]), [["andrea", "Andrea", "NONE"], ["andres", "Andres", "NONE"]]);
    } finally { await state.close(); }
  });

  test("enviar, aceptar, rechazar y eliminar; solicitudes cruzadas se aceptan solas", async () => {
    const state = await setup(); try {
      const [ana, beto, cora] = await state.people("Ana", "Beto", "Cora");
      let anaView = await state.social.request(ana!.identityToken, "beto"); assert.deepEqual(anaView.outgoing.map((entry) => entry.displayName), ["Beto"]);
      let betoView = await state.social.view(beto!.identityToken); assert.deepEqual(betoView.incoming.map((entry) => entry.displayName), ["Ana"]);
      assert.equal((await state.social.search(beto!.identityToken, "ana"))[0]!.relation, "PENDING_IN");
      await assert.rejects(() => state.social.act(ana!.identityToken, anaView.outgoing[0]!.friendshipId, "accept"), /FRIENDSHIP_NOT_FOUND/);
      betoView = await state.social.act(beto!.identityToken, betoView.incoming[0]!.friendshipId, "accept"); assert.deepEqual(betoView.friends.map((entry) => entry.displayName), ["Ana"]);
      // Cora pide a Ana; Ana rechaza: sin relación.
      await state.social.request(cora!.identityToken, "ana"); anaView = await state.social.view(ana!.identityToken);
      anaView = await state.social.act(ana!.identityToken, anaView.incoming[0]!.friendshipId, "decline"); assert.equal(anaView.incoming.length, 0);
      assert.equal((await state.social.search(cora!.identityToken, "ana"))[0]!.relation, "NONE");
      // Solicitudes cruzadas: Cora pide a Beto y Beto pide a Cora → amigos.
      await state.social.request(cora!.identityToken, "beto"); betoView = await state.social.request(beto!.identityToken, "cora");
      assert.deepEqual(betoView.friends.map((entry) => entry.displayName).sort(), ["Ana", "Cora"]);
      betoView = await state.social.act(beto!.identityToken, betoView.friends.find((entry) => entry.displayName === "Ana")!.friendshipId, "remove");
      assert.deepEqual(betoView.friends.map((entry) => entry.displayName), ["Cora"]); assert.equal((await state.social.view(ana!.identityToken)).friends.length, 0);
      await assert.rejects(() => state.social.request(ana!.identityToken, "ana"), /CANNOT_FRIEND_SELF/); await assert.rejects(() => state.social.request(ana!.identityToken, "nadie"), /USER_NOT_FOUND/);
    } finally { await state.close(); }
  });

  test("bloquear: oculta a quien bloquea, impide solicitudes en ambos sentidos y deshace la amistad; desbloquear lo quita", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto");
      await state.social.request(ana!.identityToken, "beto"); const incoming = (await state.social.view(beto!.identityToken)).incoming[0]!;
      await state.social.act(beto!.identityToken, incoming.friendshipId, "accept");
      const blockedView = await state.social.act(ana!.identityToken, (await state.social.view(ana!.identityToken)).friends[0]!.friendshipId, "block");
      assert.deepEqual([blockedView.friends.length, blockedView.blocked.map((entry) => entry.displayName)], [0, ["Beto"]]);
      assert.equal((await state.social.view(beto!.identityToken)).friends.length, 0); assert.equal((await state.social.view(beto!.identityToken)).blocked.length, 0);
      assert.deepEqual(await state.social.search(beto!.identityToken, "ana"), []);
      assert.equal((await state.social.search(ana!.identityToken, "beto"))[0]!.relation, "BLOCKED");
      await assert.rejects(() => state.social.request(beto!.identityToken, "ana"), /USER_NOT_FOUND/);
      await assert.rejects(() => state.social.request(ana!.identityToken, "beto"), /BLOCKED_BY_YOU/);
      await assert.rejects(() => state.social.act(beto!.identityToken, blockedView.blocked[0]!.friendshipId, "unblock"), /FRIENDSHIP_NOT_FOUND/);
      assert.equal((await state.social.act(ana!.identityToken, blockedView.blocked[0]!.friendshipId, "unblock")).blocked.length, 0);
      // Bloquear desde la búsqueda, sin relación previa.
      assert.equal((await state.social.blockUsername(beto!.identityToken, "ana")).blocked[0]!.displayName, "Ana");
    } finally { await state.close(); }
  });
});

describe("Amigos: presencia e invitaciones a la sala", () => {
  test("en línea = visto en el último minuto (cada consulta cuenta)", async () => {
    const state = await setup(); try {
      const [ana, beto] = await state.people("Ana", "Beto");
      await state.social.request(ana!.identityToken, "beto"); await state.social.act(beto!.identityToken, (await state.social.view(beto!.identityToken)).incoming[0]!.friendshipId, "accept");
      assert.equal((await state.social.view(ana!.identityToken)).friends[0]!.online, true);
      state.clock.t += ONLINE_WINDOW_MS; assert.equal((await state.social.view(ana!.identityToken)).friends[0]!.online, false);
      await state.social.view(beto!.identityToken); assert.equal((await state.social.view(ana!.identityToken)).friends[0]!.online, true);
    } finally { await state.close(); }
  });

  test("invitar a un amigo a mi sala: aviso en su vista, sin duplicados, caduca, y no a desconocidos ni a salas ajenas", async () => {
    const state = await setup(); try {
      const [ana, beto, cora] = await state.people("Ana", "Beto", "Cora");
      await state.social.request(ana!.identityToken, "beto"); await state.social.act(beto!.identityToken, (await state.social.view(beto!.identityToken)).incoming[0]!.friendshipId, "accept");
      const friendshipId = (await state.social.view(ana!.identityToken)).friends[0]!.friendshipId;
      const room = await state.lobbies.create("Ana", { rules: "ALL_FIVES", targetScore: 150 }, ana!.identityId);
      await state.social.invite(ana!.identityToken, friendshipId, room.code.toLowerCase()); await state.social.invite(ana!.identityToken, friendshipId, room.code);
      const invitations = (await state.social.view(beto!.identityToken)).invitations; assert.equal(invitations.length, 1);
      assert.deepEqual({ ...invitations[0]!, invitationId: "x", createdAt: 0, expiresAt: 0 }, { invitationId: "x", fromName: "Ana", fromUsername: "ana", code: room.code, mode: "INDIVIDUAL", rules: "ALL_FIVES", targetScore: 150, createdAt: 0, expiresAt: 0 });
      assert.equal(JSON.stringify(invitations).includes(ana!.identityId), false);
      await assert.rejects(() => state.social.invite(ana!.identityToken, "00000000-0000-0000-0000-000000000000", room.code), /FRIENDSHIP_NOT_FOUND/);
      const other = await state.lobbies.create("Cora", {}, cora!.identityId);
      await assert.rejects(() => state.social.invite(ana!.identityToken, friendshipId, other.code), /ROOM_NOT_FOUND/);
      assert.equal((await state.social.dismissInvitation(beto!.identityToken, invitations[0]!.invitationId)).invitations.length, 0);
      await state.social.invite(ana!.identityToken, friendshipId, room.code); state.clock.t += INVITATION_TTL_MS;
      assert.equal((await state.social.view(beto!.identityToken)).invitations.length, 0);
      // Bloquear borra las invitaciones pendientes entre ambos.
      await state.social.invite(ana!.identityToken, friendshipId, room.code); await state.social.act(beto!.identityToken, friendshipId, "block");
      assert.equal((await state.social.view(beto!.identityToken)).invitations.length, 0);
    } finally { await state.close(); }
  });

  test("HTTP: búsqueda, solicitud, aceptar, invitar y errores con código", async () => {
    const state = await setup();
    const server = createDominoHttpServer(new RoomRegistry(), state.lobbies, { competitionManager: state.identities, socialManager: state.social });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const [ana, beto] = await state.people("Ana", "Beto");
      const call = (path: string, token: string, body?: unknown) => fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      assert.deepEqual(((await (await call("/api/social/search?q=be", ana!.identityToken)).json()) as SocialSearchResult[]).map((entry) => entry.username), ["beto"]);
      await call("/api/social/requests", ana!.identityToken, { username: "beto" });
      const incoming = ((await (await call("/api/social", beto!.identityToken)).json()) as SocialView).incoming[0]!;
      const accepted = (await (await call(`/api/social/friendships/${incoming.friendshipId}/accept`, beto!.identityToken, {})).json()) as SocialView; assert.equal(accepted.friends[0]!.displayName, "Ana");
      const room = await (await fetch(`${base}/api/lobbies`, { method: "POST", headers: { authorization: `Bearer ${ana!.identityToken}`, "content-type": "application/json" }, body: JSON.stringify({ name: "Ana" }) })).json() as { code: string };
      await call("/api/social/invitations", ana!.identityToken, { friendshipId: incoming.friendshipId, code: room.code });
      assert.equal(((await (await call("/api/social", beto!.identityToken)).json()) as SocialView).invitations[0]!.code, room.code);
      const missing = await call("/api/social/requests", ana!.identityToken, { username: "nadie" }); assert.equal(missing.status, 404); assert.equal(((await missing.json()) as { code: string }).code, "USER_NOT_FOUND");
      assert.equal((await call(`/api/social/friendships/${incoming.friendshipId}/hack`, ana!.identityToken, {})).status, 404);
      assert.equal((await call("/api/social", "token-falso")).status, 401);
    } finally { server.close(); await state.close(); }
  });
});
