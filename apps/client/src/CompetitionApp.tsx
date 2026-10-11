import { useCallback, useEffect, useRef, useState } from "react";
import type { CompetitionView, SimulatedConditions, TestIdentityGrant } from "../../../packages/protocol/src/index.ts";
import { CompetitionApiError, competitionApi, competitionCommandUrl } from "./competition-api.ts";
import { acceptanceSummary, competitionErrorMessage, conditionsBreakdown, economicOutcome, formatCop, formatDateTime, formatSignedCop } from "./competition-presentation.ts";
import { persistentStorage, readJson, removeKey, writeJson } from "./device-storage.ts";
import { GameBoard } from "./GameBoard.tsx";
import { useCommandChannel } from "./use-command-channel.ts";
import { useReducedMotion } from "./use-reduced-motion.ts";
import type { Conditions, TestAccount } from "./use-test-account.ts";
import { AmountRow, BalanceSummary, DominoArt, IdentityForm, SimulatedNotice, StateCard } from "./ui.tsx";

const roomKey = (identityId: string) => `orpira-domino-3d:competition-room:v1:${identityId}`;
const pendingKey = (identityId: string) => `orpira-domino-3d:competition-pending:v1:${identityId}`;
const ROOM_GONE = new Set(["UNAUTHENTICATED", "NOT_A_PARTICIPANT", "COMPETITION_NOT_FOUND"]);
type Connection = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
const codeOf = (error: unknown) => error instanceof CompetitionApiError ? error.code : "NETWORK";

interface TablesProps { readonly account: TestAccount; readonly conditions: Conditions; readonly onOpenOnline: () => void; readonly onOpenPractice: () => void }

export function TablesView({ account, conditions, onOpenOnline, onOpenPractice }: TablesProps) {
  const identity = account.identity;
  const [room, setRoom] = useState<string | null>(() => identity ? readJson<string>(persistentStorage(), roomKey(identity.identityId)) : null);
  useEffect(() => { setRoom(identity ? readJson<string>(persistentStorage(), roomKey(identity.identityId)) : null); }, [identity]);
  const [showConditions, setShowConditions] = useState(false);
  const [busy, setBusy] = useState<"create" | "join" | null>(null); const [notice, setNotice] = useState(""); const [code, setCode] = useState("");
  const { refresh: refreshAccount } = account;
  const openRoom = (next: CompetitionView) => { if (identity) writeJson(persistentStorage(), roomKey(identity.identityId), next.code); setRoom(next.code); setShowConditions(false); setNotice(""); };
  const closeRoom = useCallback((message = "") => { if (identity) { removeKey(persistentStorage(), roomKey(identity.identityId)); removeKey(persistentStorage(), pendingKey(identity.identityId)); } setRoom(null); setNotice(message); void refreshAccount(); }, [identity, refreshAccount]);
  const enter = async (kind: "create" | "join") => {
    if (!identity || busy) return; setBusy(kind); setNotice("");
    try { openRoom(kind === "create" ? await competitionApi.create(identity.identityToken) : await competitionApi.join(code.trim().toUpperCase(), identity.identityToken)); }
    catch (error) { setNotice(competitionErrorMessage(codeOf(error))); }
    finally { setBusy(null); }
  };

  if (room && identity) return <CompetitionRoom code={room} identity={identity} account={account} onClose={closeRoom}/>;
  const data = conditions.data;
  const header = <header className="view-header"><p className="chip">Competición de prueba</p><h1>{showConditions ? "Condiciones" : "Elige tu mesa"}</h1></header>;
  const joinForm = identity && <div className="join-code">
    <form className="inline-field" onSubmit={(event) => { event.preventDefault(); void enter("join"); }}><label className="sr-only" htmlFor="competition-code">Código de sala</label><input id="competition-code" placeholder="Código de 6 caracteres" maxLength={6} autoCapitalize="characters" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())}/><button className="secondary" disabled={code.trim().length !== 6 || busy !== null || !data}>{busy === "join" ? "Entrando…" : "Entrar con código"}</button></form>
    <button className="primary" disabled={busy !== null || !data} onClick={() => void enter("create")}>{busy === "create" ? "Creando sala…" : "Crear sala privada"}</button>
  </div>;

  if (showConditions && data) return <main className="view tables-view">{header}<ConditionsDetail conditions={data}/>
    <section className="panel"><h2>Participar</h2>{identity ? <><p className="muted">Crear o entrar en una sala no reserva saldo. La entrada solo se reserva cuando aceptas expresamente dentro de la sala.</p>{joinForm}</> : <IdentityForm account={account}/>}{notice && <p className="field-error" role="alert">{notice}</p>}</section>
    <button className="ghost back" onClick={() => setShowConditions(false)}>← Volver a mesas</button></main>;

  return <main className="view tables-view">{header}
    {identity ? <BalanceSummary account={account.account}/> : <section className="panel"><SimulatedNotice/><IdentityForm account={account}/></section>}
    {notice && <StateCard tone="warning" title="Aviso">{notice}</StateCard>}
    <p className="section-label">Mesas disponibles</p>
    <article className="table-card">
      <div className="table-card-art"><DominoArt variant="trio"/></div>
      <div className="table-card-body"><h2>Mesa Esmeralda</h2><p className="muted">Cuatro jugadores individuales · objetivo 100 puntos</p>
        {conditions.status === "LOADING" && <div className="skeleton-block" role="status" aria-busy="true"><span className="skeleton wide"/><span className="skeleton"/><span className="sr-only">Cargando condiciones…</span></div>}
        {conditions.status !== "LOADING" && !data && <StateCard tone={conditions.status === "UNAVAILABLE" ? "warning" : "error"} title={conditions.status === "UNAVAILABLE" ? "Competición no disponible" : "No se pudieron cargar las condiciones"} action={<button className="secondary" onClick={conditions.reload}>Reintentar</button>}>{conditions.error}</StateCard>}
        {data && <><dl className="table-facts"><div><dt>Entrada individual</dt><dd>{formatCop(data.entry)}</dd></div><div><dt>Bolsa</dt><dd>{formatCop(conditionsBreakdown(data).pool)}</dd></div><div><dt>Premio al campeón</dt><dd>{formatCop(data.prize)}</dd></div><div><dt>Comisión</dt><dd>{data.commissionPercent} %</dd></div></dl>
          <p className="seats-note"><span aria-hidden="true">👥</span> Plazas: {data.playerCount} por sala privada. La ocupación real se muestra dentro de cada sala; no hay mesas públicas abiertas.</p>
          <button className="primary wide" onClick={() => setShowConditions(true)}>Ver condiciones <span aria-hidden="true">›</span></button></>}
      </div>
    </article>
    {identity && data && <section className="panel"><h2>Sala privada de competición</h2><p className="muted">Comparte el código con otras tres personas. Cada una acepta las condiciones por separado.</p>{joinForm}</section>}
    <article className="table-card secondary-card">
      <div className="table-card-art"><DominoArt/></div>
      <div className="table-card-body"><h2>Mesa entre amigos</h2><p className="muted">Sala privada por código, sin saldo simulado.</p><button className="secondary wide" onClick={onOpenOnline}>Crear o entrar a sala <span aria-hidden="true">›</span></button></div>
    </article>
    <div className="practice-strip"><span>También puedes jugar sin conexión</span><button className="secondary" onClick={onOpenPractice}>Practicar <span aria-hidden="true">›</span></button></div>
  </main>;
}

export function ConditionsDetail({ conditions, compact = false }: { conditions: SimulatedConditions; compact?: boolean }) {
  const breakdown = conditionsBreakdown(conditions);
  return <section className={`panel conditions ${compact ? "compact" : ""}`} aria-labelledby="conditions-title">
    <h2 id="conditions-title">{compact ? "Condiciones aceptadas en esta sala" : "Desglose económico"}</h2><SimulatedNotice compact/>
    <dl className="amounts">{breakdown.entries.map((entry, index) => <AmountRow key={index} label={`Entrada jugador ${index + 1}`} value={formatCop(entry)}/>)}
      <AmountRow label="Bolsa total" value={formatCop(breakdown.pool)} strong/><AmountRow label={`Comisión (${conditions.commissionPercent} %)`} value={formatCop(breakdown.commissionAmount)}/>
      <AmountRow label="Premio al campeón" value={formatCop(breakdown.prize)} strong hint="Resultado neto del campeón: premio − su entrada"/></dl>
    {!breakdown.consistent && <StateCard tone="error" title="Condiciones inconsistentes">Los importes recibidos no cuadran. No se permite participar hasta que el servidor los corrija.</StateCard>}
    {!compact && <div className="rules-grid">
      <div><h3>Reglas</h3><ul><li>{conditions.playerCount} jugadores individuales, sin equipos.</li><li>Gana quien llega primero a {conditions.targetScore} puntos.</li><li>Dominada +20 · cierre con ganador único +0 · empate sin ganador.</li><li>Apertura con 6–6 y turnos antihorarios.</li></ul></div>
      <div><h3>Cancelación</h3><ul><li>Antes de empezar puedes salir: tu entrada reservada se devuelve completa.</li><li>Si la sala no reúne cuatro aceptaciones en {conditions.expiresAfterMinutes} minutos, caduca y se devuelven todas las reservas.</li><li>Una vez iniciada, solo se anula si los cuatro lo aceptan; entonces se devuelven las entradas y no hay campeón.</li></ul></div>
      <div><h3>Desconexiones</h3><ul><li>Una desconexión no es un pase, ni una derrota, ni una penalización.</li><li>La partida espera y puedes reconectarte con el mismo asiento y la misma mano.</li><li>El resultado económico solo se aplica con la liquidación confirmada por el servidor.</li></ul></div>
    </div>}
  </section>;
}

function CompetitionRoom({ code, identity, account, onClose }: { code: string; identity: TestIdentityGrant; account: TestAccount; onClose: (message?: string) => void }) {
  const [view, setView] = useState<CompetitionView | null>(null); const [connection, setConnection] = useState<Connection>("CONNECTING");
  const [operation, setOperation] = useState<null | "accept" | "leave" | "cancel" | "annul">(null); const [operationError, setOperationError] = useState("");
  const [agreed, setAgreed] = useState(false); const [copied, setCopied] = useState(false);
  const reducedMotion = useReducedMotion(); const lastStatus = useRef<string | null>(null);
  const { refresh: refreshAccount } = account; const closeRef = useRef(onClose); closeRef.current = onClose;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const next = await competitionApi.view(code, identity.identityToken, signal); setView(next); setConnection("CONNECTED"); }
    catch (error) { if ((error as Error).name === "AbortError") return; const failure = codeOf(error); if (ROOM_GONE.has(failure)) closeRef.current(competitionErrorMessage(failure)); else setConnection("DISCONNECTED"); }
  }, [code, identity.identityToken]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); const timer = window.setInterval(() => void refresh(controller.signal), 1_500); return () => { controller.abort(); clearInterval(timer); }; }, [refresh]);
  const viewerAccepted = view?.members.find((member) => member.identityId === view.viewerIdentityId)?.accepted ?? false;
  const statusKey = view ? `${view.status}:${viewerAccepted}:${view.settlement ? "settled" : ""}` : null;
  useEffect(() => { if (statusKey && statusKey !== lastStatus.current) { lastStatus.current = statusKey; void refreshAccount(); } }, [refreshAccount, statusKey]);
  const refreshView = useCallback(() => refresh(), [refresh]); const disconnect = useCallback(() => setConnection("DISCONNECTED"), []);
  const channel = useCommandChannel({ path: competitionCommandUrl(code), token: identity.identityToken, pendingKey: pendingKey(identity.identityId), storage: persistentStorage(),
    revision: view?.game?.revision ?? null, connected: connection === "CONNECTED", refresh: refreshView, onDisconnect: disconnect });

  const run = async (kind: "accept" | "leave" | "cancel" | "annul") => {
    if (operation || !view) return; setOperation(kind); setOperationError("");
    try {
      if (kind === "accept") setView(await competitionApi.accept(code, identity.identityToken, view.conditions.version));
      if (kind === "cancel") setView(await competitionApi.cancel(code, identity.identityToken));
      if (kind === "annul") setView(await competitionApi.annul(code, identity.identityToken));
      if (kind === "leave") { account.replace(await competitionApi.leave(code, identity.identityToken)); onClose("Has salido de la sala. Si tenías la entrada reservada, se ha devuelto."); return; }
      await refreshAccount();
    } catch (error) {
      const failure = codeOf(error);
      setOperationError(failure === "NETWORK" ? "No hay confirmación del servidor. La operación queda pendiente: la sala se actualizará al reconectar y puedes reintentarla sin duplicar reservas." : competitionErrorMessage(failure));
      if (failure === "NETWORK") setConnection("DISCONNECTED");
    } finally { setOperation(null); }
  };
  const copyCode = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1_800); } catch { setCopied(false); } };

  const connectionBadge = <div className={`connection ${connection.toLowerCase()}`} role="status">{connection === "CONNECTED" ? "Conectado al servidor" : connection === "CONNECTING" ? "Conectando…" : "Sin conexión · reconectando"}</div>;
  if (!view) return <main className="view"><header className="view-header"><p className="chip">Competición de prueba</p><h1>Sala {code}</h1></header>{connectionBadge}
    <StateCard tone={connection === "DISCONNECTED" ? "warning" : "neutral"} title={connection === "DISCONNECTED" ? "Reconectando con la sala…" : "Cargando la sala…"} action={<button className="secondary" onClick={() => onClose()}>Volver a mesas</button>}>Tu asiento y cualquier reserva se conservan en el servidor.</StateCard></main>;

  const conditions = view.conditions; const breakdown = conditionsBreakdown(conditions); const summary = acceptanceSummary(view.members, conditions.playerCount);
  const me = view.members.find((member) => member.identityId === view.viewerIdentityId);
  const available = account.account.data?.available ?? null; const insufficient = available !== null && available < conditions.entry && !viewerAccepted;
  const names = Object.fromEntries(view.members.map((member) => [member.identityId, member.displayName]));
  const myMovements = (account.account.data?.movements ?? []).filter((movement) => movement.competitionId === view.competitionId);
  const header = <header className="view-header room-header"><div><p className="chip">Competición de prueba</p><h1>Sala {view.code}</h1></div>
    {view.status === "WAITING" && <button className="secondary" onClick={() => void copyCode()} aria-live="polite">{copied ? "Código copiado" : "Copiar código"}</button>}</header>;

  if (view.status === "CANCELLED" || view.status === "EXPIRED") {
    const released = myMovements.some((movement) => movement.kind === "ENTRY_RELEASED"); const reserved = myMovements.some((movement) => movement.kind === "ENTRY_RESERVED");
    return <main className="view">{header}<StateCard tone="warning" title={view.status === "EXPIRED" ? "Sala caducada" : "Competición cancelada"} action={<button className="primary" onClick={() => onClose()}>Volver a mesas</button>}>
      <p>{view.cancellationReason}</p><p>{!reserved ? "No llegaste a reservar entrada en esta sala." : released ? `Devolución confirmada: ${formatCop(conditions.entry)} vuelven a tu saldo disponible.` : "Devolución pendiente de confirmar en tu historial."}</p></StateCard><SimulatedNotice/></main>;
  }

  if (view.status === "WAITING") return <main className="view room-view">{header}{connectionBadge}
    <section className="panel"><div className="progress-head"><h2>Aceptaciones</h2><strong>{summary.accepted} de {conditions.playerCount}</strong></div>
      <progress max={conditions.playerCount} value={summary.accepted} aria-label={`${summary.accepted} de ${conditions.playerCount} aceptaciones`}/>
      <ul className="member-list">{Array.from({ length: conditions.playerCount }, (_, seat) => { const member = view.members.find((candidate) => candidate.seat === seat);
        return <li key={seat} className={member?.identityId === view.viewerIdentityId ? "me" : ""}><span className={`presence ${member ? (member.connected ? "online" : "offline") : "empty"}`} aria-hidden="true"/>
          <div><strong>{member ? `${member.displayName}${member.identityId === view.viewerIdentityId ? " (tú)" : ""}` : "Plaza libre"}</strong><small>{member ? (member.connected ? "Conectado" : "Sin conexión reciente") : "Esperando jugador"}</small></div>
          {member && <span className={`badge ${member.accepted ? "ok" : "pending"}`}>{member.accepted ? "Aceptó · entrada reservada" : "Pendiente de aceptar"}</span>}</li>; })}</ul>
      <p className="muted">{summary.missingSeats ? `Faltan ${summary.missingSeats} ${summary.missingSeats === 1 ? "jugador" : "jugadores"}. ` : ""}{summary.pendingNames.length ? `Pendientes de aceptar: ${summary.pendingNames.join(", ")}. ` : ""}La partida empieza automáticamente al confirmarse las cuatro aceptaciones y reservas.</p>
      <p className="muted">Si no se completa, la sala caduca a las {new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(view.expiresAt)} y se devuelven las reservas.</p>
    </section>
    <ConditionsDetail conditions={conditions}/>
    <section className="panel accept-panel" aria-live="polite">
      {viewerAccepted ? <StateCard tone="success" title="Has aceptado">Tu entrada de {formatCop(conditions.entry)} está reservada. Esperando al resto de jugadores.</StateCard> : <>
        <h2>Tu aceptación</h2>
        {insufficient && <StateCard tone="error" title="Saldo insuficiente">Necesitas {formatCop(conditions.entry)} disponibles; tienes {formatCop(available!)}.</StateCard>}
        <label className="check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)}/><span>He leído las reglas, la cancelación y el tratamiento de desconexiones, y acepto reservar {formatCop(conditions.entry)} simulados de mi saldo.</span></label>
        <button className="primary wide" disabled={!agreed || operation !== null || insufficient || !breakdown.consistent || connection !== "CONNECTED"} onClick={() => void run("accept")}>{operation === "accept" ? "Reservando entrada…" : `Aceptar y reservar ${formatCop(conditions.entry)}`}</button></>}
      {operation && operation !== "accept" && <p className="muted" role="status">Operación pendiente de confirmación…</p>}
      {operationError && <p className="field-error" role="alert">{operationError}</p>}
      <div className="room-actions"><button className="secondary" disabled={operation !== null} onClick={() => { if (window.confirm(viewerAccepted ? "Saldrás de la sala y se devolverá tu entrada reservada. ¿Continuar?" : "¿Salir de la sala?")) void run("leave"); }}>Salir de la sala</button>
        {me?.seat === 0 && <button className="danger" disabled={operation !== null} onClick={() => { if (window.confirm("Se cancelará la sala para todos y se devolverán las reservas. ¿Continuar?")) void run("cancel"); }}>Cancelar sala para todos</button>}</div>
    </section></main>;

  const game = view.game;
  if (!game) return <main className="view">{header}{connectionBadge}<StateCard title="Preparando la partida…">El servidor está repartiendo las fichas.</StateCard></main>;
  const outcome = economicOutcome(view.settlement, view.viewerIdentityId); const annulments = view.members.filter((member) => member.annulmentAccepted).length;
  const context = <div className="competition-strip"><div><span>Bolsa</span><strong>{formatCop(breakdown.pool)}</strong></div><div><span>Premio</span><strong>{formatCop(conditions.prize)}</strong></div><div><span>Tu entrada</span><strong>{formatCop(conditions.entry)} {view.settlement ? "aplicada a la bolsa" : "reservada"}</strong></div><SimulatedNotice compact/>
    {view.status === "PLAYING" && view.members.some((member) => !member.connected) && <p className="waiting-note" role="status">Esperando a {view.members.filter((member) => !member.connected).map((member) => member.displayName).join(", ")}: sin conexión reciente. La partida queda pendiente, sin pases ni derrotas automáticas, hasta que vuelva.</p>}
    {view.status === "PLAYING" && <details className="annul"><summary>Problemas con la partida</summary><p>Una desconexión no es un pase ni una derrota: la partida espera. Solo se anula si los cuatro lo aceptan; entonces se devuelven las entradas y no hay campeón. Acuerdos: {annulments} de {conditions.playerCount}.</p>
      <button className="secondary" disabled={me?.annulmentAccepted || operation !== null} onClick={() => { if (window.confirm("¿Proponer o aceptar la anulación? Solo se aplica con el acuerdo de los cuatro.")) void run("annul"); }}>{me?.annulmentAccepted ? "Has aceptado anular" : "Proponer o aceptar anulación"}</button>{operationError && <p className="field-error" role="alert">{operationError}</p>}</details>}</div>;
  const finale = <section className="settlement" aria-label="Liquidación simulada"><h3>Liquidación simulada</h3>
    {outcome ? <><dl className="amounts"><AmountRow label="Campeón" value={names[view.settlement!.championIdentityId] ?? "—"}/><AmountRow label="Premio bruto de la mesa" value={formatCop(outcome.grossPrize)}/><AmountRow label="Comisión" value={formatSignedCop(-outcome.commission)}/><AmountRow label="Tu entrada" value={formatSignedCop(-outcome.entry)}/><AmountRow label="Premio recibido por ti" value={formatCop(outcome.prizeReceived)}/><AmountRow label="Tu resultado neto" value={formatSignedCop(outcome.net)} strong hint="Premio recibido − tu entrada"/></dl>
      <p className="muted">Confirmada por el servidor. {outcome.isChampion ? "El premio recibido incluye la devolución de tu propia entrada; tu beneficio neto es el premio menos la entrada." : "La entrada se aplicó a la bolsa del campeón."}</p></>
      : <StateCard tone="warning" title="Liquidación pendiente">El servidor todavía no ha confirmado la liquidación. No se muestra ningún importe hasta entonces.</StateCard>}<SimulatedNotice compact/></section>;
  return <main className="view online-shell competition-game">{connectionBadge}
    <GameBoard game={game} actions={view.legalActions} names={names} viewerId={view.viewerIdentityId} sending={channel.sending} message={channel.message} reducedMotion={reducedMotion}
      celebrationStorage={persistentStorage()} onCommand={(command) => void channel.send(command)} onLeave={() => onClose()} context={context} finaleDetails={finale}/>
    {view.status === "ENDED" && game.phase !== "MATCH_ENDED" && <StateCard title="Competición finalizada" action={<button className="primary" onClick={() => onClose()}>Volver al lobby</button>}/>}
    <p className="meta">Sala creada {formatDateTime(view.createdAt)}</p>
  </main>;
}
