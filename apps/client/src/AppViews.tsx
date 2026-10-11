import { useId, useState } from "react";
import { competitionRecords, formatCop, formatDateTime, formatSignedCop, MOVEMENT_LABELS, RECORD_LABELS } from "./competition-presentation.ts";
import type { Conditions, TestAccount } from "./use-test-account.ts";
import { BalanceSummary, DominoArt, IdentityForm, SimulatedNotice, StateCard } from "./ui.tsx";

export const APP_VERSION = "1.3";

interface HomeProps { readonly account: TestAccount; readonly conditions: Conditions; readonly onPractice: () => void; readonly onOnline: () => void; readonly onTables: () => void }
export function HomeView({ account, conditions, onPractice, onOnline, onTables }: HomeProps) {
  return <main className="view home-view">
    <header className="home-hero">
      <img className="brand-mark" src="/domino3d-orpira-brand.png" width="132" height="132" alt="Icono de Domino3D-OrPiRa: dos fichas, órbita dorada y símbolo π"/>
      <div><h1 className="brand-title">Domino3D-<span>OrPiRa</span></h1><p className="lede">Dominó individual en mesa 3D. Cuatro jugadores, cada uno por su cuenta, compiten por llegar primero a <strong>100 puntos</strong>.</p></div>
    </header>
    <section className="rule-chips" aria-label="Reglas principales"><span>4 jugadores individuales</span><span>Objetivo 100 puntos</span><span>Dominada +20</span><span>Cierre +0</span><span>Abre el 6–6</span></section>
    <p className="section-label">¿Cómo quieres jugar?</p>
    <div className="mode-grid">
      <article className="mode-card"><DominoArt/><div><h2>Practicar</h2><p>Sin conexión: tú contra tres bots, o cuatro personas en el mismo dispositivo con relevo privado.</p><button className="primary wide" onClick={onPractice}>Practicar <span aria-hidden="true">›</span></button></div></article>
      <article className="mode-card"><DominoArt variant="trio"/><div><h2>Partida online</h2><p>Mesa entre amigos por código privado. Sin saldo ni importes.</p><button className="secondary wide" onClick={onOnline}>Jugar online <span aria-hidden="true">›</span></button></div></article>
      <article className="mode-card featured"><DominoArt/><div><p className="chip">Competición de prueba</p><h2>Mesas con saldo simulado</h2><p>Entrada, bolsa y premio en {conditions.data ? "COP simulados" : "saldo simulado"}, sin valor monetario. Requiere aceptación expresa de los cuatro.</p><button className="primary wide" onClick={onTables}>Ver mesas <span aria-hidden="true">›</span></button></div></article>
    </div>
    {account.identity && <><p className="section-label">Tu cuenta de prueba</p><BalanceSummary account={account.account} compact/></>}
    <SimulatedNotice/>
  </main>;
}

export function HistoryView({ account, onAccount }: { account: TestAccount; onAccount: () => void }) {
  const data = account.account.data;
  if (!account.identity) return <main className="view"><header className="view-header"><p className="chip">Competición de prueba</p><h1>Historial</h1></header>
    <StateCard title="Todavía no tienes cuenta de prueba" action={<button className="primary" onClick={onAccount}>Ir a Cuenta</button>}>El historial muestra los movimientos registrados por el servidor para tu cuenta de prueba.</StateCard></main>;
  const records = data ? competitionRecords(data.movements) : [];
  return <main className="view history-view"><header className="view-header"><p className="chip">Competición de prueba</p><h1>Historial</h1></header><SimulatedNotice/>
    {!data && account.account.status === "LOADING" && <div className="skeleton-block" role="status" aria-busy="true"><span className="skeleton wide"/><span className="skeleton wide"/><span className="sr-only">Cargando historial…</span></div>}
    {!data && account.account.status !== "LOADING" && <StateCard tone="error" title="No se pudo cargar el historial" action={<button className="secondary" onClick={() => void account.refresh()}>Reintentar</button>}>{account.account.error}</StateCard>}
    {data && <>
      <section className="panel"><h2>Partidas</h2>{records.length === 0 ? <p className="muted">Aún no has participado en ninguna competición de prueba.</p> :
        <ul className="record-list">{records.map((record) => <li key={record.competitionId}><div><strong>{RECORD_LABELS[record.state]}</strong><small>{formatDateTime(record.updatedAt)} · ref. {record.competitionId.slice(-6)}</small></div><span className={`amount ${record.net === null ? "pending" : record.net > 0 ? "positive" : record.net < 0 ? "negative" : ""}`}>{record.net === null ? "Pendiente" : formatSignedCop(record.net)}</span></li>)}</ul>}</section>
      <section className="panel"><h2>Movimientos</h2><p className="muted">Disponible y reservado se muestran por separado. Todos los movimientos están confirmados por el servidor.</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Movimientos de la cuenta de prueba"><table className="movements"><thead><tr><th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">Tipo</th><th scope="col">Disponible</th><th scope="col">Reservado</th><th scope="col">Estado</th></tr></thead>
          <tbody>{data.movements.map((movement) => <tr key={movement.movementId}><td data-label="Fecha">{formatDateTime(movement.createdAt)}</td><td data-label="Concepto">{MOVEMENT_LABELS[movement.kind].concept}</td><td data-label="Tipo"><span className={`badge kind-${movement.kind.toLowerCase()}`}>{MOVEMENT_LABELS[movement.kind].category}</span></td><td className="num" data-label="Disponible">{movement.availableDelta ? formatSignedCop(movement.availableDelta) : "—"}</td><td className="num" data-label="Reservado">{movement.reservedDelta ? formatSignedCop(movement.reservedDelta) : "—"}</td><td data-label="Estado">Confirmado</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}

export function AccountView({ account }: { account: TestAccount }) {
  const [showCode, setShowCode] = useState(false); const [recovery, setRecovery] = useState(""); const recoveryId = useId();
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
    <section className="panel"><h2>Acceso en otros dispositivos</h2><p className="muted">Guarda este código para recuperar la cuenta si borras los datos del navegador. Quien lo tenga puede usar tu cuenta de prueba.</p>
      {showCode ? <code className="recovery-code">{account.identity.identityToken}</code> : <button className="secondary" onClick={() => setShowCode(true)}>Mostrar código de recuperación</button>}
      <button className="danger" onClick={() => { if (window.confirm("Se olvidará la cuenta en este dispositivo. Sin el código de recuperación no podrás volver a ella. ¿Continuar?")) account.forget(); }}>Olvidar cuenta en este dispositivo</button></section>
    <p className="meta">Domino3D-OrPiRa {APP_VERSION} · cuenta y saldo de prueba</p>
  </main>;
}
