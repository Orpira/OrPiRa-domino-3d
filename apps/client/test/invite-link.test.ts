import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inviteMessage, inviteUrl, parseInvitation, shareInvite, shareOrigin, whatsappUrl } from "../src/invite-link.ts";

describe("enlaces de invitación", () => {
  it("construye y lee /invitar/:codigo con quien invita", () => {
    const url = inviteUrl("https://domino-3d.orpira.es/", "abc123", "ana.r");
    assert.equal(url, "https://domino-3d.orpira.es/invitar/ABC123?de=ana.r");
    const parsed = new URL(url); assert.deepEqual(parseInvitation(parsed.pathname, parsed.search), { code: "ABC123", inviter: "ana.r" });
    assert.deepEqual(parseInvitation("/invitar/xyz789/", ""), { code: "XYZ789", inviter: null });
    for (const path of ["/", "/invitar/", "/invitar/ABC", "/invitar/ABC12345", "/invitar/AB C12", "/otra/ABC123"]) assert.equal(parseInvitation(path, ""), null);
  });
  it("la APK y el desarrollo local comparten el dominio público", () => {
    assert.equal(shareOrigin({ protocol: "https:", hostname: "localhost", origin: "https://localhost" }), "https://domino-3d.orpira.es");
    assert.equal(shareOrigin({ protocol: "http:", hostname: "127.0.0.1", origin: "http://127.0.0.1:5173" }), "https://domino-3d.orpira.es");
    assert.equal(shareOrigin({ protocol: "https:", hostname: "orpira-domino-3d.vercel.app", origin: "https://orpira-domino-3d.vercel.app" }), "https://orpira-domino-3d.vercel.app");
  });
  it("mensaje y enlace de WhatsApp", () => {
    const text = inviteMessage("abc123", "https://x/invitar/ABC123", "Latino · individual a 100");
    assert.match(text, /código ABC123: https:\/\/x\/invitar\/ABC123$/); assert.equal(whatsappUrl("a b&c"), "https://wa.me/?text=a%20b%26c");
  });
  it("comparte con el sistema, copia si no hay menú y respeta la cancelación", async () => {
    const copied: string[] = []; const clipboard = { writeText: async (value: string) => { copied.push(value); } } as unknown as Clipboard;
    assert.equal(await shareInvite("u", "t", { share: async () => {} }), "SHARED");
    assert.equal(await shareInvite("u", "t", { share: async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); }, clipboard }), "CANCELLED");
    assert.equal(await shareInvite("u", "t", { clipboard }), "COPIED"); assert.deepEqual(copied, ["u"]);
    assert.equal(await shareInvite("u", "t", {}), "UNAVAILABLE");
  });
});
