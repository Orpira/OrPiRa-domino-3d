import { useEffect, useId, useState } from "react";
import type { LeagueHistoryView, QuickPlayHistoryEntry } from "../../../packages/protocol/src/index.ts";
import { leagueApi, quickPlayApi } from "./competition-api.ts";
import { RANK_NAMES } from "./league-presentation.ts";
import { competitionErrorMessage, competitionRecords, formatCop, formatDateTime, formatSignedCop, MOVEMENT_LABELS, RECORD_LABELS } from "./competition-presentation.ts";
import type { Conditions, TestAccount } from "./use-test-account.ts";
import { BalanceSummary, DominoArt, IdentityForm, RankTile, SimulatedNotice, StateCard } from "./ui.tsx";
import { useConfirm } from "./confirm-dialog.tsx";
import { useSocial } from "./invite-ui.tsx";
import { CompetitionApiError, socialApi } from "./competition-api.ts";

export const APP_VERSION = "1.9-rc1";

interface HomeProps { readonly account: TestAccount; readonly conditions: Conditions; readonly onQuickPlay: () => void; readonly onPractice: () => void; readonly onOnline: () => void; readonly onTables: () => void }
export function HomeView({ account, conditions, onQuickPlay, onPractice, onOnline, onTables }: HomeProps) {
  return <main className="view home-view">
    <header className="home-hero">
      <img className="brand-mark" src="/domino3d-orpira-brand.png" width="132" height="132" alt="Icono de Domino3D-OrPiRa: dos fichas, órbita dorada y símbolo π"/>
      <div><h1 className="brand-title">Domino3D-<span>OrPiRa</span></h1><p className="lede">Dominó en mesa 3D para cuatro jugadores: cada uno por su cuenta hasta <strong>100 puntos</strong> o por parejas hasta <strong>200</strong>.</p></div>
    </header>
    <section className="rule-chips" aria-label="Reglas principales"><span>Individual a 100</span><span>Parejas a 200</span><span>Dominada +20</span><span>Cierre +0</span><span>Abre el 6–6</span></section>
    <section className="quick-hero" aria-labelledby="quick-title"><div><p className="chip">Práctica gratuita</p><h2 id="quick-title">Jugar ahora</h2><p>Te sentamos en una mesa pública con otras tres personas. Sin entrada, sin saldo y sin premio; si faltan jugadores, completan bots del servidor identificados como «Bot».</p></div>
      <button className="primary quick-cta" onClick={onQuickPlay}>Jugar ahora <span aria-hidden="true">›</span></button></section>
    <p className="section-label">Más formas de jugar</p>
    <div className="mode-grid">
      <article className="mode-card"><DominoArt/><div><h2>Practicar</h2><p>Sin conexión: tú contra tres bots, o cuatro personas en el mismo dispositivo con relevo privado.</p><button className="primary wide" onClick={onPractice}>Practicar <span aria-hidden="true">›</span></button></div></article>
      <article className="mode-card"><DominoArt variant="trio"/><div><h2>Partida online</h2><p>Mesa entre amigos por código privado. Sin saldo ni importes.</p><button className="secondary wide" onClick={onOnline}>Jugar online <span aria-hidden="true">›</span></button></div></article>
      <article className="mode-card featured"><DominoArt/><div><p className="chip">Competición de prueba</p><h2>Mesas con saldo simulado</h2><p>Entrada, bolsa y premio en {conditions.data ? "COP simulados" : "saldo simulado"}, sin valor monetario. Requiere aceptación expresa de los cuatro.</p><button className="primary wide" onClick={onTables}>Ver mesas <span aria-hidden="true">›</span></button></div></article>
    </div>
    {/* La tarjeta de saldo ya lleva el aviso; sin cuenta se muestra suelto para la tarjeta de competición. */}
    {account.identity ? <><p className="section-label">Tu cuenta de prueba</p><BalanceSummary account={account.account} compact/></> : <SimulatedNotice/>}
  </main>;
}

export function HistoryView({ account, onAccount }: { account: TestAccount; onAccount: () => void }) {
  const data = account.account.data;
  if (!account.identity) return <main className="view"><header className="view-header"><p className="chip">Competición de prueba</p><h1>Historial</h1></header>
    <StateCard title="Todavía no tienes cuenta de prueba" action={<button className="primary" onClick={onAccount}>Ir a Cuenta</button>}>El historial muestra los movimientos registrados por el servidor para tu cuenta de prueba.</StateCard></main>;
  const records = data ? competitionRecords(data.movements) : [];
  const automaticById = new Map((data?.results ?? []).map((result) => [result.competitionId, result]));
  return <main className="view history-view"><header className="view-header"><h1>Historial</h1></header>
    {!data && account.account.status === "LOADING" && <div className="skeleton-block" role="status" aria-busy="true"><span className="skeleton wide"/><span className="skeleton wide"/><span className="sr-only">Cargando historial…</span></div>}
    {!data && account.account.status !== "LOADING" && <StateCard tone="error" title="No se pudo cargar el historial" action={<button className="secondary" onClick={() => void account.refresh()}>Reintentar</button>}>{account.account.error}</StateCard>}
    <LeagueHistory token={account.identity.identityToken}/>
    <PublicHistory token={account.identity.identityToken}/>
    {data && <>
      <section className="panel"><h2>Competición de prueba</h2><SimulatedNotice compact/>{records.length === 0 ? <p className="muted">Aún no has participado en ninguna competición de prueba.</p> :
        <ul className="record-list">{records.map((record) => <li key={record.competitionId}><div><strong>{RECORD_LABELS[record.state]}</strong><small>{formatDateTime(record.updatedAt)} · ref. {record.competitionId.slice(-6)}</small>{automaticById.get(record.competitionId)?.automaticNames.length ? <small className="auto-record">Terminaron en modo automático: {automaticById.get(record.competitionId)!.automaticNames.join(", ")}{automaticById.get(record.competitionId)!.viewerAutomatic ? " (incluido tu asiento)" : ""}</small> : null}</div><span className={`amount ${record.net === null ? "pending" : record.net > 0 ? "positive" : record.net < 0 ? "negative" : ""}`}>{record.net === null ? "Pendiente" : formatSignedCop(record.net)}</span></li>)}</ul>}</section>
      <section className="panel"><h2>Movimientos</h2><p className="muted">Disponible y reservado se muestran por separado. Todos los movimientos están confirmados por el servidor.</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Movimientos de la cuenta de prueba"><table className="movements"><thead><tr><th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">Tipo</th><th scope="col">Disponible</th><th scope="col">Reservado</th><th scope="col">Estado</th></tr></thead>
          <tbody>{data.movements.map((movement) => <tr key={movement.movementId}><td data-label="Fecha">{formatDateTime(movement.createdAt)}</td><td data-label="Concepto">{MOVEMENT_LABELS[movement.kind].concept}</td><td data-label="Tipo"><span className={`badge kind-${movement.kind.toLowerCase()}`}>{MOVEMENT_LABELS[movement.kind].category}</span></td><td className="num" data-label="Disponible">{movement.availableDelta ? formatSignedCop(movement.availableDelta) : "—"}</td><td className="num" data-label="Reservado">{movement.reservedDelta ? formatSignedCop(movement.reservedDelta) : "—"}</td><td data-label="Estado">Confirmado</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}

export function AccountView({ account }: { account: TestAccount }) {
  const [showCode, setShowCode] = useState(false); const [recovery, setRecovery] = useState(""); const recoveryId = useId(); const confirm = useConfirm();
  const data = account.account.data;
  const explainer = <section className="panel test-explainer"><h2>Esta es una cuenta de prueba</h2><ul>
    <li>Los importes son <strong>COP simulados · sin valor monetario</strong>. No se compran, no se retiran, no se transfieren entre usuarios y no se canjean por premios.</li>
    <li>No hay depósitos, retiradas ni compra de saldo. El crédito inicial se concede una sola vez por cuenta.</li>
    <li>La cuenta no es una identidad verificada. Esta fase no está preparada para dinero real ni autorizada por Coljuegos.</li>
    <li>Saldo y movimientos los controla el servidor; este dispositivo solo guarda tu código de acceso.</li></ul></section>;
  if (!account.identity) return <main className="view"><header className="view-header"><p className="chip">Competición de prueba</p><h1>Cuenta</h1></header>
    <section className="panel"><IdentityForm account={account}/></section>
    <section className="panel"><h2>Recuperar una cuenta</h2><form className="identity-form" onSubmit={(event) => { event.preventDefault(); if (recovery.trim()) void account.recover(recovery); }}><label htmlFor={recoveryId}>Código de recuperación</label><div className="inline-field"><input id={recoveryId} autoComplete="off" spellCheck={false} value={recovery} onChange={(event) => setRecovery(event.target.value)}/><button className="secondary" disabled={!recovery.trim() || account.creating}>Recuperar</button></div></form></section>
    {explainer}</main>;
  return <main className="view account-view"><header className="view-header"><p className="chip">Competición de prueba</p><h1>Cuenta</h1></header>
    <section className="panel profile"><span className="avatar" aria-hidden="true">{account.identity.displayName.slice(0, 1).toUpperCase()}</span><div><h2>{account.identity.displayName}</h2><p className="muted">Cuenta de prueba · ref. {account.identity.identityId.slice(-8)}</p></div></section>
    <BalanceSummary account={account.account} compact/>
    {data && <dl className="panel amounts"><div className="amount-row"><dt>Disponible</dt><dd>{formatCop(data.available)}</dd></div><div className="amount-row"><dt>Reservado en salas</dt><dd>{formatCop(data.reserved)}</dd></div><div className="amount-row strong"><dt>Total simulado</dt><dd>{formatCop(data.available + data.reserved)}</dd></div></dl>}
    {explainer}
    <ProfileSection token={account.identity.identityToken}/>
    <section className="panel"><h2>Acceso en otros dispositivos</h2><p className="muted">Guarda este código para recuperar la cuenta si borras los datos del navegador. Quien lo tenga puede usar tu cuenta de prueba.</p>
      {showCode ? <code className="recovery-code">{account.identity.identityToken}</code> : <button className="secondary" onClick={() => setShowCode(true)}>Mostrar código de recuperación</button>}
      <button className="danger" onClick={() => confirm({ title: "¿Olvidar la cuenta en este dispositivo?", message: "Sin el código de recuperación no podrás volver a ella.", confirmLabel: "Olvidar cuenta", tone: "danger", onConfirm: account.forget })}>Olvidar cuenta en este dispositivo</button></section>
    <p className="meta">Domino3D-OrPiRa {APP_VERSION} · cuenta y saldo de prueba</p>
  </main>;
}

function PublicHistory({ token }: { token: string }) {
  const [entries, setEntries] = useState<readonly QuickPlayHistoryEntry[] | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => { let alive = true; quickPlayApi.history(token).then((value) => { if (alive) setEntries(value); }, () => { if (alive) setFailed(true); }); return () => { alive = false; }; }, [token]);
  return <section className="panel"><h2>Jugar ahora · partidas públicas</h2>
    {failed ? <p className="muted">Historial de partidas públicas no disponible en este servidor.</p> : !entries ? <p className="muted" role="status">Cargando…</p> : entries.length === 0 ? <p className="muted">Aún no has jugado partidas públicas.</p> :
      <ul className="record-list">{entries.map((entry) => { const champion = entry.participants.find((participant) => participant.playerId === entry.championPlayerId);
        return <li key={entry.matchId}><div><strong>Campeón: {champion?.displayName ?? "—"}{champion?.bot ? " (bot)" : ""}</strong><small>{formatDateTime(entry.endedAt)} · {entry.participants.map((participant) => `${participant.displayName}${participant.bot ? " [Bot]" : ""} ${participant.score}`).join(" · ")}</small>
          {entry.participants.some((participant) => participant.endedAutomatic) && <small className="auto-record">Terminaron en modo automático: {entry.participants.filter((participant) => participant.endedAutomatic).map((participant) => participant.displayName).join(", ")}</small>}</div>
          <span className="amount">Sin saldo</span></li>; })}</ul>}</section>;
}

function LeagueHistory({ token }: { token: string }) {
  const [history, setHistory] = useState<LeagueHistoryView | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => { let alive = true; leagueApi.history(token).then((value) => { if (alive) setHistory(value); }, () => { if (alive) setFailed(true); }); return () => { alive = false; }; }, [token]);
  return <section className="panel"><h2>Liga</h2>
    {failed ? <p className="muted">Historial de liga no disponible en este servidor.</p> : !history ? <p className="muted" role="status">Cargando…</p> : <>
      <h3>Temporadas anteriores</h3>
      {history.seasons.length === 0 ? <p className="muted">Todavía no ha cerrado ninguna temporada en la que hayas puntuado.</p> :
        <ul className="record-list">{history.seasons.map((season) => <li key={season.seasonId}><div><strong className="rank-cell"><RankTile rank={season.rank} decorative/>{season.label}</strong><small>{RANK_NAMES[season.rank]} · posición {season.position} de {season.totalPlayers}</small></div><span className="amount">{season.points} pts</span></li>)}</ul>}
      <h3>Puntos por partida</h3>
      {history.awards.length === 0 ? <p className="muted">Aún no has puntuado en la liga.</p> :
        <ul className="record-list">{history.awards.map((award) => <li key={award.matchId}><div><strong>{award.position}.º puesto · {award.humans} de 4 humanos{award.automatic ? " · modo automático" : ""}</strong><small>{formatDateTime(award.awardedAt)} · temporada {award.seasonId}{award.promoted ? ` · ascenso a ${RANK_NAMES[award.newRank]}` : ""}</small></div><span className={`amount ${award.points > 0 ? "positive" : ""}`}>+{award.points} pts</span></li>)}</ul>}
    </>}</section>;
}

/** Nombre de usuario (se elige una vez) y amigos aceptados. */
function ProfileSection({ token }: { token: string }) {
  const { social, error, setSocial } = useSocial(token); const [username, setUsername] = useState(""); const [saving, setSaving] = useState(false); const [claimError, setClaimError] = useState(""); const inputId = useId();
  const claim = async () => {
    if (saving || !username.trim()) return; setSaving(true); setClaimError("");
    try { setSocial(await socialApi.claimUsername(token, username)); }
    catch (failure) { setClaimError(competitionErrorMessage(failure instanceof CompetitionApiError ? failure.code : "NETWORK")); } finally { setSaving(false); }
  };
  if (!social) return error ? <section className="panel"><h2>Perfil y amigos</h2><p className="muted">{error}</p></section> : null;
  return <section className="panel profile-social"><h2>Perfil y amigos</h2>
    {social.username ? <p>Tu nombre de usuario: <strong>@{social.username}</strong></p>
      : <form className="identity-form" onSubmit={(event) => { event.preventDefault(); void claim(); }}><p>Elige un nombre de usuario único. Va en tus enlaces de invitación para que quien entre quede como tu amigo. No se puede cambiar.</p>
          <label htmlFor={inputId}>Nombre de usuario</label><div className="inline-field"><input id={inputId} maxLength={21} autoCapitalize="none" autoComplete="username" spellCheck={false} placeholder="ej. ana_92" value={username} onChange={(event) => setUsername(event.target.value)}/>
          <button className="primary" disabled={!username.trim() || saving}>{saving ? "Guardando…" : "Guardar"}</button></div>{claimError && <p className="field-error" role="alert">{claimError}</p>}</form>}
    <h3>Amigos {social.friends.length > 0 && <small>({social.friends.length})</small>}</h3>
    {social.friends.length ? <ul className="friend-list">{social.friends.map((friend) => <li key={`${friend.username}-${friend.displayName}-${friend.since}`}><strong>{friend.displayName}</strong>{friend.username && <span>@{friend.username}</span>}</li>)}</ul>
      : <p className="muted">Todavía no tienes amigos. Invita a alguien a una sala con código: al entrar con su cuenta quedaréis como amigos.</p>}
  </section>;
}
