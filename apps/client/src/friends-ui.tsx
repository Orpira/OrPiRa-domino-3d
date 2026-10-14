import { useEffect, useId, useState } from "react";
import type { RoomInvitation, SocialPerson, SocialSearchResult, SocialView } from "../../../packages/protocol/src/index.ts";
import { CompetitionApiError, socialApi } from "./competition-api.ts";
import { competitionErrorMessage } from "./competition-presentation.ts";
import { useConfirm } from "./confirm-dialog.tsx";
import { choiceLabel } from "./modes-presentation.ts";
import { useSocialState } from "./social-context.tsx";
import type { TargetScore } from "../../../packages/rules/src/index.ts";

const codeOf = (error: unknown) => error instanceof CompetitionApiError ? error.code : "NETWORK";
const handle = (person: { readonly username: string | null }) => person.username ? `@${person.username}` : "sin usuario";
export const invitationLabel = (invitation: RoomInvitation) => choiceLabel({ rules: invitation.rules, mode: invitation.mode, targetScore: invitation.targetScore as TargetScore });

/** Ejecuta una acción social y aplica la vista que devuelve; los errores se muestran en `setError`. */
function useSocialAction() {
  const { token, apply } = useSocialState(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const run = async (action: (token: string) => Promise<SocialView>) => {
    if (!token || busy) return false; setBusy(true); setError("");
    try { apply(await action(token)); return true; } catch (failure) { setError(competitionErrorMessage(codeOf(failure))); return false; } finally { setBusy(false); }
  };
  return { token, busy, error, run };
}

/** Buscar por nombre de usuario, solicitudes, amigos (con presencia) y bloqueados. */
export function FriendsPanel() {
  const { social } = useSocialState(); const { token, busy, error, run } = useSocialAction(); const confirm = useConfirm(); const searchId = useId();
  const [query, setQuery] = useState(""); const [results, setResults] = useState<readonly SocialSearchResult[] | null>(null);
  useEffect(() => {
    const text = query.trim().replace(/^@/, ""); if (!token || text.length < 2) { setResults(null); return; }
    const controller = new AbortController(); const timer = window.setTimeout(() => {
      socialApi.search(token, text, controller.signal).then(setResults).catch((failure) => { if ((failure as Error).name !== "AbortError") setResults([]); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, token, social]);
  if (!social) return null;
  const act = (person: SocialPerson, action: "accept" | "decline" | "remove" | "block" | "unblock") => run((key) => socialApi.act(key, person.friendshipId, action));
  const askBlock = (person: SocialPerson) => confirm({ title: `¿Bloquear a ${person.displayName}?`, message: "Dejaréis de ser amigos, no podrá encontrarte ni enviarte solicitudes ni invitaciones. Puedes desbloquear cuando quieras.", confirmLabel: "Bloquear", tone: "danger", onConfirm: () => void act(person, "block") });
  const askRemove = (person: SocialPerson) => confirm({ title: `¿Eliminar a ${person.displayName} de tus amigos?`, message: "Podréis volver a enviaros una solicitud más adelante.", confirmLabel: "Eliminar", tone: "danger", onConfirm: () => void act(person, "remove") });
  const resultAction = (result: SocialSearchResult) => {
    if (result.relation === "NONE") return <button className="primary small" disabled={busy} onClick={() => void run((key) => socialApi.request(key, result.username))}>Añadir</button>;
    if (result.relation === "PENDING_IN" && result.friendshipId) return <button className="primary small" disabled={busy} onClick={() => void run((key) => socialApi.act(key, result.friendshipId!, "accept"))}>Aceptar</button>;
    return <span className="relation">{result.relation === "FRIEND" ? "Amigos" : result.relation === "PENDING_OUT" ? "Solicitud enviada" : result.relation === "BLOCKED" ? "Bloqueado" : ""}</span>;
  };
  return <div className="friends-panel">
    <label htmlFor={searchId}>Buscar por nombre de usuario</label>
    <input id={searchId} type="search" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="@usuario" value={query} onChange={(event) => setQuery(event.target.value)}/>
    {results && <ul className="friend-list search-results" aria-label="Resultados">{results.length ? results.map((result) => <li key={result.username}><div><strong>{result.displayName}</strong><span>@{result.username}</span></div>{resultAction(result)}</li>)
      : <li className="muted">Nadie con ese nombre de usuario.</li>}</ul>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {social.incoming.length > 0 && <><h3>Solicitudes recibidas <small>({social.incoming.length})</small></h3><ul className="friend-list">{social.incoming.map((person) => <li key={person.friendshipId}>
      <div><strong>{person.displayName}</strong><span>{handle(person)}</span></div><div className="friend-actions"><button className="primary small" disabled={busy} onClick={() => void act(person, "accept")}>Aceptar</button><button className="secondary small" disabled={busy} onClick={() => void act(person, "decline")}>Rechazar</button></div></li>)}</ul></>}
    <h3>Amigos {social.friends.length > 0 && <small>({social.friends.filter((friend) => friend.online).length} en línea de {social.friends.length})</small>}</h3>
    {social.friends.length ? <ul className="friend-list">{social.friends.map((friend) => <li key={friend.friendshipId}>
      <div><strong><span className={`presence ${friend.online ? "online" : "offline"}`} aria-hidden="true"/>{friend.displayName}</strong><span>{handle(friend)} · {friend.online ? "en línea" : "desconectado"}</span></div>
      <div className="friend-actions"><button className="ghost small" disabled={busy} onClick={() => askRemove(friend)}>Eliminar</button><button className="ghost small danger-text" disabled={busy} onClick={() => askBlock(friend)}>Bloquear</button></div></li>)}</ul>
      : <p className="muted">Todavía no tienes amigos. Búscalos por su usuario o invítalos a una sala con código.</p>}
    {social.outgoing.length > 0 && <><h3>Solicitudes enviadas</h3><ul className="friend-list">{social.outgoing.map((person) => <li key={person.friendshipId}>
      <div><strong>{person.displayName}</strong><span>{handle(person)} · pendiente</span></div><button className="ghost small" disabled={busy} onClick={() => void act(person, "remove")}>Cancelar</button></li>)}</ul></>}
    {social.blocked.length > 0 && <details className="blocked-list"><summary>Bloqueados ({social.blocked.length})</summary><ul className="friend-list">{social.blocked.map((person) => <li key={person.friendshipId}>
      <div><strong>{person.displayName}</strong><span>{handle(person)}</span></div><button className="ghost small" disabled={busy} onClick={() => void act(person, "unblock")}>Desbloquear</button></li>)}</ul></details>}
  </div>;
}

/** Aviso dentro de la app cuando un amigo te invita a su sala. */
export function InvitationBanner({ onJoin }: { onJoin: (invitation: RoomInvitation) => void }) {
  const { social } = useSocialState(); const { run, busy } = useSocialAction();
  const invitation = social?.invitations[0]; if (!invitation) return null;
  const dismiss = () => run((key) => socialApi.dismissInvitation(key, invitation.invitationId));
  return <aside className="invitation-banner" role="status" aria-live="polite">
    <div><strong>{invitation.fromName} te invita a su sala</strong><span>{invitationLabel(invitation)} · código {invitation.code}</span></div>
    <div className="friend-actions"><button className="primary small" disabled={busy} onClick={() => { void dismiss(); onJoin(invitation); }}>Unirme</button><button className="ghost small" disabled={busy} onClick={() => void dismiss()}>Ahora no</button></div>
  </aside>;
}

/** En la sala de espera: invitar a amigos (los conectados primero). */
export function InviteFriends({ code }: { code: string }) {
  const { social } = useSocialState(); const { busy, error, run } = useSocialAction(); const [sent, setSent] = useState<readonly string[]>([]);
  if (!social || social.friends.length === 0) return null;
  const invite = async (friendshipId: string) => { if (await run((key) => socialApi.invite(key, friendshipId, code))) setSent((current) => [...current, friendshipId]); };
  return <div className="invite-friends"><h4>Invitar a un amigo</h4>
    <ul className="friend-list">{social.friends.map((friend) => <li key={friend.friendshipId}>
      <div><strong><span className={`presence ${friend.online ? "online" : "offline"}`} aria-hidden="true"/>{friend.displayName}</strong><span>{friend.online ? "en línea" : "desconectado"}</span></div>
      <button className={sent.includes(friend.friendshipId) ? "ghost small" : "primary small"} disabled={busy} onClick={() => void invite(friend.friendshipId)}>{sent.includes(friend.friendshipId) ? "Invitado · reenviar" : "Invitar"}</button></li>)}</ul>
    {error && <p className="field-error" role="alert">{error === competitionErrorMessage("ROOM_NOT_FOUND") ? "Para invitar a amigos, crea la sala o entra en ella con tu cuenta de prueba." : error}</p>}
    <p className="muted">Les llega un aviso dentro de la app durante 10 minutos.</p></div>;
}
