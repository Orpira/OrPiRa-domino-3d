/** Dominio público de la web: la APK (origen https://localhost) comparte siempre enlaces a la web. */
export const PUBLIC_WEB_URL = "https://domino-3d.orpira.es";
const CODE = /^[A-Za-z0-9]{6}$/;

export interface Invitation { readonly code: string; readonly inviter: string | null }

/** Origen para los enlaces: el de la página si es una web pública; la APK y el desarrollo local usan el dominio público. */
export function shareOrigin(location: { readonly protocol: string; readonly hostname: string; readonly origin: string }): string {
  return location.protocol === "https:" && location.hostname !== "localhost" ? location.origin : PUBLIC_WEB_URL;
}
/** `https://…/invitar/ABC123?de=ana`. */
export function inviteUrl(origin: string, code: string, inviter?: string | null): string {
  return `${origin.replace(/\/+$/, "")}/invitar/${encodeURIComponent(code.toUpperCase())}${inviter ? `?de=${encodeURIComponent(inviter)}` : ""}`;
}
/** Lee `/invitar/:codigo` (con `?de=usuario` opcional); `null` si la ruta no es una invitación válida. */
export function parseInvitation(pathname: string, search: string): Invitation | null {
  const match = pathname.match(/^\/invitar\/([^/]+)\/?$/); if (!match) return null;
  const code = decodeURIComponent(match[1]!).trim(); if (!CODE.test(code)) return null;
  const inviter = new URLSearchParams(search).get("de")?.trim() || null;
  return { code: code.toUpperCase(), inviter };
}
export function inviteMessage(code: string, url: string, gameLabel: string): string {
  return `¡Juega dominó conmigo en Domino3D-OrPiRa! Mesa ${gameLabel}, código ${code.toUpperCase()}: ${url}`;
}
export function whatsappUrl(text: string): string { return `https://wa.me/?text=${encodeURIComponent(text)}`; }

export type ShareResult = "SHARED" | "COPIED" | "CANCELLED" | "UNAVAILABLE";
/** Menú de compartir del sistema si existe; si no, copia el enlace. La cancelación del usuario no es un error. */
export async function shareInvite(url: string, text: string, nav: Partial<Pick<Navigator, "share" | "clipboard">> = navigator): Promise<ShareResult> {
  if (typeof nav.share === "function") {
    try { await nav.share({ title: "Domino3D-OrPiRa", text, url }); return "SHARED"; }
    catch (error) { if ((error as Error).name === "AbortError") return "CANCELLED"; }
  }
  try { await nav.clipboard!.writeText(url); return "COPIED"; } catch { return "UNAVAILABLE"; }
}
