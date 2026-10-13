import { useCallback, useEffect, useState } from "react";
import type { QuickPlayView } from "../../../packages/protocol/src/index.ts";
import { CompetitionApiError, QUICK_PLAY_COMMANDS, quickPlayApi } from "./competition-api.ts";
import { competitionErrorMessage } from "./competition-presentation.ts";
import { persistentStorage } from "./device-storage.ts";
import { GameBoard } from "./GameBoard.tsx";
import { formatCountdown } from "./turn-clock-presentation.ts";
import { useCommandChannel } from "./use-command-channel.ts";
import { useReducedMotion } from "./use-reduced-motion.ts";
import type { TestAccount } from "./use-test-account.ts";
import { DominoArt, IdentityForm, RankTile, StateCard, TableSetup } from "./ui.tsx";
import { choiceLabel, type TableChoice } from "./modes-presentation.ts";
import { awardBreakdown, RANK_NAMES } from "./league-presentation.ts";
import type { QuickPlayMatchView } from "../../../packages/protocol/src/index.ts";

type Connection = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
const codeOf = (error: unknown) => error instanceof CompetitionApiError ? error.code : "NETWORK";

export function QuickPlayApp({ account, onHome }: { account: TestAccount; onHome: () => void }) {
  const identity = account.identity;
  if (!identity) return <main className="view quick-view"><QuickHeader/><section className="panel"><IdentityForm account={account} intro="Elige el nombre que verán los demás jugadores. Se crea una cuenta de prueba en el servidor; Jugar ahora no usa saldo."/></section><FreePlayNote/></main>;
  return <QuickPlaySession key={identity.identityId} token={identity.identityToken} identityId={identity.identityId} onHome={onHome}/>;
}

function QuickHeader() { return <header className="view-header"><p className="chip">Práctica gratuita</p><h1>Jugar ahora</h1></header>; }
function FreePlayNote() { return <p className="muted free-note">Sin entrada, sin saldo y sin premio. Si faltan personas tras la espera, la mesa se completa con bots del servidor, siempre identificados como «Bot».</p>; }

function QuickPlaySession({ token, identityId, onHome }: { token: string; identityId: string; onHome: () => void }) {
  const [view, setView] = useState<QuickPlayView | null>(null); const [connection, setConnection] = useState<Connection>("CONNECTING");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [now, setNow] = useState(() => Date.now()); const [received, setReceived] = useState(() => Date.now());
  const reducedMotion = useReducedMotion(); const [choice, setChoice] = useState<TableChoice>({ rules: "LATINO", mode: "INDIVIDUAL" });
  const accept = useCallback((next: QuickPlayView) => { setView(next); setReceived(Date.now()); setConnection("CONNECTED"); }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { accept(await quickPlayApi.view(token, signal)); }
    catch (failure) { if ((failure as Error).name === "AbortError") return; const code = codeOf(failure); setConnection("DISCONNECTED"); if (code !== "NETWORK") setError(competitionErrorMessage(code)); }
  }, [accept, token]);
  const active = Boolean(view?.ticket || view?.match?.status === "PLAYING");
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => { if (!active) return; const controller = new AbortController(); const timer = window.setInterval(() => void refresh(controller.signal), 1_000); return () => { controller.abort(); clearInterval(timer); }; }, [active, refresh]);
  useEffect(() => { if (!view?.ticket) return; const timer = window.setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, [view?.ticket]);
  const refreshNow = useCallback(() => refresh(), [refresh]); const disconnect = useCallback(() => setConnection("DISCONNECTED"), []);
  const channel = useCommandChannel({ path: QUICK_PLAY_COMMANDS, token, pendingKey: `orpira-domino-3d:quick-pending:v1:${identityId}`, storage: persistentStorage(),
    revision: view?.match?.game.revision ?? null, connected: connection === "CONNECTED", refresh: refreshNow, onDisconnect: disconnect });
  const run = async (operation: () => Promise<QuickPlayView>) => {
    if (busy) return; setBusy(true); setError("");
    try { accept(await operation()); } catch (failure) { setError(competitionErrorMessage(codeOf(failure))); } finally { setBusy(false); }
  };
  const connectionBadge = connection !== "CONNECTED" && <div className={`connection ${connection.toLowerCase()}`} role="status">{connection === "CONNECTING" ? "Conectando…" : "Sin conexión · reconectando"}</div>;

  if (!view) return <main className="view quick-view"><QuickHeader/>{connectionBadge}
    {error ? <StateCard tone="warning" title="Jugar ahora no disponible" action={<button className="secondary" onClick={() => void refresh()}>Reintentar</button>}>{error}</StateCard>
      : <StateCard title="Conectando con el servidor…"/>}</main>;

  const match = view.match;
  if (match) {
    const names = Object.fromEntries(match.seats.map((seat) => [seat.playerId, seat.displayName]));
    const bots = match.seats.filter((seat) => seat.bot).length;
    const context = <p className="quick-strip"><span>Práctica gratuita · sin saldo · {choiceLabel({ rules: match.rules ?? "LATINO", mode: match.mode ?? "INDIVIDUAL" })}</span>{bots > 0 && <span>{bots} {bots === 1 ? "bot" : "bots"} del servidor en la mesa</span>}</p>;
    const finaleActions = <div className="finale-actions"><button className="primary" disabled={busy} onClick={() => void run(() => quickPlayApi.join(token, { mode: match.mode ?? "INDIVIDUAL", rules: match.rules ?? "LATINO" }))}>{busy ? "Buscando…" : "Jugar otra igual"}</button>
      <button className="secondary" disabled={busy} onClick={() => void run(() => quickPlayApi.dismiss(token)).then(onHome)}>Volver al inicio</button></div>;
    const decorations = Object.fromEntries(Object.entries(match.ranks).map(([playerId, rank]) => [playerId, <RankTile key={playerId} rank={rank}/>]));
    return <main className="view online-shell quick-game">{connectionBadge}
      <GameBoard game={match.game} actions={match.legalActions} names={names} viewerId={match.viewerPlayerId} sending={channel.sending} message={channel.message} reducedMotion={reducedMotion}
        celebrationStorage={persistentStorage()} onCommand={(command) => void channel.send(command)} onLeave={onHome} context={context} clock={match.clock} finaleActions={finaleActions} nameDecorations={decorations} finaleDetails={<LeagueAward match={match}/>}/>
      {error && <p className="field-error" role="alert">{error}</p>}</main>;
  }

  const ticket = view.ticket;
  if (ticket) {
    const elapsed = Math.max(0, now - received); const untilBots = Math.max(0, ticket.botsFillAt - (ticket.serverNow + elapsed));
    return <main className="view quick-view"><QuickHeader/>{connectionBadge}
      <section className="panel searching" aria-live="polite"><div className="search-pulse" aria-hidden="true"><DominoArt/></div>
        <h2>{`Buscando jugadores · ${choiceLabel({ rules: ticket.rules ?? "LATINO", mode: ticket.mode ?? "INDIVIDUAL" })}`}</h2><p className="progress-head"><span>Jugadores encontrados</span><strong>{ticket.waiting.length} de 4</strong></p>
        <ul className="member-list">{Array.from({ length: 4 }, (_, index) => { const name = ticket.waiting[index];
          return <li key={index}><span className={`presence ${name ? "online" : "empty"}`} aria-hidden="true"/><div><strong>{name ?? "Buscando…"}</strong><small>{name ? (index === (ticket.position - 1) % 4 ? "Tú" : "En espera") : "Plaza libre"}</small></div></li>; })}</ul>
        <p className="muted">{untilBots > 0 ? `Si faltan jugadores, completamos la mesa con bots en ${formatCountdown(untilBots)}.` : "Completando la mesa con bots…"}</p>
        <button className="secondary wide" disabled={busy} onClick={() => void run(() => quickPlayApi.cancel(token))}>{busy ? "Cancelando…" : "Cancelar búsqueda"}</button>
        {error && <p className="field-error" role="alert">{error}</p>}</section><FreePlayNote/></main>;
  }

  return <main className="view quick-view"><QuickHeader/>{connectionBadge}
    <section className="panel quick-start"><DominoArt variant="trio"/><h2>{`Partida rápida · ${choiceLabel(choice)}`}</h2>
      <TableSetup choice={choice} onChange={setChoice} label="Modalidad de la partida" showTarget={false}/>
      <p className="muted">{choice.mode === "PAIRS" ? "Te emparejamos por orden de llegada con otras tres personas; juegas con quien se sienta enfrente. " : "Te emparejamos por orden de llegada con otras tres personas. "}Cada turno tiene un tiempo límite; si se agota, el servidor juega por ti.{choice.rules === "LATINO" ? "" : " Esta modalidad no puntúa en la liga."}</p>
      <button className="primary wide" disabled={busy} onClick={() => void run(() => quickPlayApi.join(token, { mode: choice.mode, rules: choice.rules }))}>{busy ? "Entrando en la cola…" : "Buscar partida"} <span aria-hidden="true">›</span></button>
      {error && <p className="field-error" role="alert">{error}</p>}</section><FreePlayNote/></main>;
}

function LeagueAward({ match }: { match: QuickPlayMatchView }) {
  const award = match.league;
  if ((match.rules ?? "LATINO") !== "LATINO") return <section className="league-award" aria-label="Puntos de liga"><h3>Puntos de liga</h3><p className="muted">Las partidas con robo son casuales: no puntúan en la liga.</p></section>;
  if (!award) return <section className="league-award" aria-label="Puntos de liga"><h3>Puntos de liga</h3><StateCard tone="warning" title="Puntos de liga pendientes">El servidor todavía no ha confirmado la concesión de esta partida.</StateCard></section>;
  return <section className="league-award" aria-label="Puntos de liga"><h3>Puntos de liga</h3>
    {award.promoted && <div className="promotion" role="status"><RankTile rank={award.newRank} size="medium"/><div><strong>¡Asciendes a {RANK_NAMES[award.newRank]}!</strong><span>Antes: {RANK_NAMES[award.previousRank]}</span></div></div>}
    <dl className="amounts">{awardBreakdown(award).map((line, index, lines) => <div key={line.label} className={`amount-row ${index === lines.length - 1 ? "strong" : ""}`}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>
    <p className="muted">Temporada {award.seasonId}. Los puntos de liga no son saldo y no se canjean.</p></section>;
}
