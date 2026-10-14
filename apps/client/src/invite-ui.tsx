import { useCallback, useEffect, useState } from "react";
import type { TargetScore } from "../../../packages/rules/src/index.ts";
import type { LobbyPreview, SocialView } from "../../../packages/protocol/src/index.ts";
import { CompetitionApiError, lobbyApi, socialApi } from "./competition-api.ts";
import { competitionErrorMessage } from "./competition-presentation.ts";
import { deviceStorage, readJson, writeJson } from "./device-storage.ts";
import { inviteMessage, inviteUrl, shareInvite, shareOrigin, whatsappUrl, type Invitation } from "./invite-link.ts";
import { choiceLabel, rulesSummary, type TableChoice } from "./modes-presentation.ts";
import { useConfirm } from "./confirm-dialog.tsx";
import { IdentityForm, StateCard } from "./ui.tsx";
import type { TestAccount } from "./use-test-account.ts";
import type { SessionGrant } from "../../../packages/protocol/src/index.ts";
import { ONLINE_SESSION_KEY } from "./online-session.ts";

const codeOf = (error: unknown) => error instanceof CompetitionApiError ? error.code : "NETWORK";

/** Perfil social de la cuenta de prueba (nombre de usuario y amigos); `null` sin cuenta o si el servidor no lo ofrece. */
export function useSocial(token: string | null) {
  const [social, setSocial] = useState<SocialView | null>(null); const [error, setError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!token) { setSocial(null); return; }
    try { setSocial(await socialApi.view(token, signal)); setError(""); }
    catch (failure) { if ((failure as Error).name !== "AbortError") { setSocial(null); setError(competitionErrorMessage(codeOf(failure))); } }
  }, [token]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  return { social, error, refresh, setSocial };
}

/** Botones para invitar a una sala con código: menú de compartir del sistema (o copiar), WhatsApp y el enlace a la vista. */
export function InvitePanel({ code, choice, username }: { code: string; choice: TableChoice; username: string | null }) {
  const [status, setStatus] = useState("");
  const url = inviteUrl(shareOrigin(window.location), code, username); const text = inviteMessage(code, url, choiceLabel(choice));
  const share = async () => {
    const result = await shareInvite(url, text);
    setStatus(result === "COPIED" ? "Enlace copiado. Pégalo donde quieras." : result === "UNAVAILABLE" ? "No se pudo copiar: selecciona el enlace y cópialo." : result === "SHARED" ? "Invitación enviada." : "");
  };
  return <section className="invite-panel" aria-labelledby="invite-title"><h3 id="invite-title">Invitar a la sala</h3>
    <div className="invite-actions"><button className="primary" onClick={() => void share()}>Invitar</button>
      <a className="secondary" href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
    <input className="invite-url" readOnly value={url} aria-label="Enlace de invitación" onFocus={(event) => event.currentTarget.select()}/>
    <p className="muted" role="status">{status || (username ? "Quien entre con tu enlace y su cuenta de prueba quedará como tu amigo." : "Ponte un nombre de usuario en Cuenta para que quien entre con tu enlace quede como tu amigo.")}</p>
  </section>;
}

/** Página de `/invitar/:codigo`: muestra la sala, pide una cuenta de prueba si no hay y entra con ella. */
export function InviteView({ invitation, account, onJoined, onCancel }: { invitation: Invitation; account: TestAccount; onJoined: (friendWith: string | null) => void; onCancel: () => void }) {
  const [preview, setPreview] = useState<LobbyPreview | null>(null); const [error, setError] = useState(""); const [joining, setJoining] = useState(false);
  const confirm = useConfirm(); const identity = account.identity;
  const load = useCallback(async (signal?: AbortSignal) => {
    try { setPreview(await lobbyApi.preview(invitation.code, invitation.inviter, signal)); setError(""); }
    catch (failure) { if ((failure as Error).name !== "AbortError") setError(competitionErrorMessage(codeOf(failure))); }
  }, [invitation]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const join = async () => {
    if (!identity || joining) return; setJoining(true); setError("");
    try {
      const grant = await lobbyApi.joinByInvitation(invitation.code, identity.identityToken, invitation.inviter);
      writeJson(deviceStorage(), ONLINE_SESSION_KEY, { code: grant.code, sessionId: grant.sessionId, playerId: grant.playerId } satisfies SessionGrant);
      onJoined(grant.friendWith ?? null);
    } catch (failure) { setError(competitionErrorMessage(codeOf(failure))); void load(); } finally { setJoining(false); }
  };
  const current = readJson<SessionGrant>(deviceStorage(), ONLINE_SESSION_KEY);
  const askJoin = () => current && current.code !== invitation.code
    ? confirm({ title: `¿Dejar la sala ${current.code}?`, message: "Este dispositivo solo sigue una sala con código a la vez. Tu plaza en la otra sala no se libera.", confirmLabel: "Entrar en la nueva", cancelLabel: "Quedarme", onConfirm: () => void join() })
    : void join();
  const choice: TableChoice | null = preview ? { rules: preview.rules, mode: preview.mode, targetScore: preview.targetScore as TargetScore } : null;
  const open = preview?.status === "WAITING" && preview.freeSeats > 0;
  return <main className="view invite-view"><header className="view-header"><p className="chip">Invitación</p><h1>{preview?.inviter ? `${preview.inviter} te invita a jugar` : "Te invitan a jugar"}</h1></header>
    {!preview && !error && <StateCard title="Buscando la sala…"/>}
    {preview && choice && <section className="panel invite-room"><p className="eyebrow">Sala {preview.code}</p><h2>{choiceLabel(choice)}</h2><p className="muted">{rulesSummary(choice)}</p>
      <ul className="member-list">{Array.from({ length: 4 }, (_, index) => <li key={index}><span className={`presence ${preview.players[index] ? "online" : "empty"}`} aria-hidden="true"/><div><strong>{preview.players[index] ?? "Plaza libre"}</strong></div></li>)}</ul>
      {!open && <StateCard tone="warning" title="Ya no hay sitio">{preview.status === "WAITING" ? "La sala está completa." : "La partida de esta sala ya empezó."}</StateCard>}</section>}
    {error && <StateCard tone="error" title="No se pudo entrar" action={<button className="secondary" onClick={() => void load()}>Reintentar</button>}>{error}</StateCard>}
    {open && (identity
      ? <section className="panel"><p>Entrarás como <strong>{identity.displayName}</strong>{preview.inviter ? ` y quedarás como amigo de ${preview.inviter}` : ""}.</p>
          <button className="primary wide" disabled={joining} onClick={askJoin}>{joining ? "Entrando…" : "Entrar en la sala"}</button></section>
      : <section className="panel"><IdentityForm account={account} intro="Para entrar, crea tu cuenta de prueba con el nombre que verán los demás. No usa saldo ni datos personales."/></section>)}
    <button className="ghost" onClick={onCancel}>Ir al inicio</button>
  </main>;
}
