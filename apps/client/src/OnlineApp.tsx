import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { TILE_BY_ID, type Side, type TileId } from "../../../packages/rules/src/index.ts";
import type { ClientCommand, CommandEnvelope, LobbyView, SessionGrant } from "../../../packages/protocol/src/index.ts";
import { commandErrorMessage, createCommandId } from "./online-interaction.ts";
import { dominationsRemaining, finalRanking, roundHeadline, shouldShowMatchFinale, TARGET_SCORE } from "./online-presentation.ts";
import { currentSelection, placementDecision, SubmissionGate, type PlacementSelection } from "./placement-interaction.ts";
import { apiUrl } from "./api.ts";
import { Capacitor } from "@capacitor/core";
const Table3D = lazy(() => import("./Table3D.tsx").then((module) => ({ default: module.Table3D })));

const ONLINE_SESSION_KEY = "orpira-domino-3d:online-session:v1";
type Connection = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
function onlineStorage(): Storage { return Capacitor.isNativePlatform() ? window.localStorage : window.sessionStorage; }
function readGrant(): SessionGrant | null { try { const value = onlineStorage().getItem(ONLINE_SESSION_KEY); return value ? JSON.parse(value) as SessionGrant : null; } catch { return null; } }
function auth(grant: SessionGrant) { return { authorization: `Bearer ${grant.sessionId}`, "content-type": "application/json" }; }
function Tile({ id, enabled, selected, onClick }: { id: TileId; enabled: boolean; selected: boolean; onClick: () => void }) {
  const tile = TILE_BY_ID.get(id)!; return <button type="button" className={`tile ${selected ? "selected" : ""}`} disabled={!enabled} aria-label={`Ficha ${tile.a}-${tile.b}`} aria-pressed={selected} onClick={onClick}><span>{tile.a}</span><i/><span>{tile.b}</span></button>;
}

export function OnlineApp() {
  const [grant, setGrant] = useState<SessionGrant | null>(readGrant);
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [connection, setConnection] = useState<Connection>("CONNECTING");
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [selection, setSelection] = useState<PlacementSelection | null>(null); const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const retrying = useRef(false);
  const submissionGate = useRef(new SubmissionGate());
  const refresh = useCallback(async (active: SessionGrant, signal?: AbortSignal) => {
    try { const response = await fetch(apiUrl(`/api/lobbies/${active.code}`), { headers: auth(active), ...(signal ? { signal } : {}) }); if (!response.ok) throw new Error("Sesión rechazada");
      setLobby(await response.json() as LobbyView); setConnection("CONNECTED");
    } catch (error) { if ((error as Error).name !== "AbortError") setConnection("DISCONNECTED"); }
  }, []);
  useEffect(() => {
    if (!grant) return; const controller = new AbortController(); setConnection("CONNECTING"); void refresh(grant, controller.signal);
    const timer = window.setInterval(() => void refresh(grant, controller.signal), 1_000); return () => { controller.abort(); clearInterval(timer); };
  }, [grant, refresh]);
  useEffect(() => {
    if (!grant || !lobby?.game || connection !== "CONNECTED" || retrying.current) return;
    const key = `${ONLINE_SESSION_KEY}:pending`; const raw = onlineStorage().getItem(key); if (!raw) return;
    retrying.current = true;
    void fetch(apiUrl(`/api/lobbies/${grant.code}/commands`), { method: "POST", headers: auth(grant), body: raw })
      .then(async (response) => { const result = await response.json() as { ok: boolean; message?: string }; onlineStorage().removeItem(key); setMessage(result.ok ? "Comando pendiente confirmado" : result.message ?? "Comando pendiente rechazado"); await refresh(grant); })
      .catch(() => setConnection("DISCONNECTED")).finally(() => { retrying.current = false; });
  }, [connection, grant, lobby?.game?.revision, refresh]);
  useEffect(() => {
    if (selection && lobby?.game?.revision !== selection.revision) setSelection(null);
  }, [lobby?.game?.revision, selection]);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)"); if (!query) return;
    const update = () => setReducedMotion(query.matches); query.addEventListener?.("change", update); return () => query.removeEventListener?.("change", update);
  }, []);

  const enter = async (kind: "create" | "join") => {
    try {
      const url = kind === "create" ? "/api/lobbies" : `/api/lobbies/${code.trim().toUpperCase()}/join`;
      const response = await fetch(apiUrl(url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error("No se pudo abrir la sala"); const next = await response.json() as SessionGrant;
      onlineStorage().setItem(ONLINE_SESSION_KEY, JSON.stringify(next)); setGrant(next); setMessage("");
    } catch (error) { setMessage((error as Error).message); }
  };
  const leave = () => { onlineStorage().removeItem(ONLINE_SESSION_KEY); onlineStorage().removeItem(`${ONLINE_SESSION_KEY}:pending`); setGrant(null); setLobby(null); setConnection("CONNECTING"); };
  const send = async (command: ClientCommand) => {
    if (!grant || !lobby?.game || connection !== "CONNECTED" || !submissionGate.current.tryLock()) return;
    setSending(true);
    try {
      const envelope: CommandEnvelope = { commandId: createCommandId(), expectedRevision: lobby.game.revision, command };
      const pendingKey = `${ONLINE_SESSION_KEY}:pending`; onlineStorage().setItem(pendingKey, JSON.stringify(envelope));
      const request = () => fetch(apiUrl(`/api/lobbies/${grant.code}/commands`), { method: "POST", headers: auth(grant), body: JSON.stringify(envelope) });
      let response = await request(); if (response.status >= 500) response = await request();
      const result = await response.json() as { ok?: boolean; code?: string; message?: string };
      if (!response.ok || result.ok !== true) setMessage(commandErrorMessage(response.status, result)); else setMessage("Acción confirmada");
      onlineStorage().removeItem(pendingKey); setSelection(null); await refresh(grant);
    } catch (error) { setConnection("DISCONNECTED"); setMessage(`No se pudo enviar la acción: ${(error as Error).message || "conexión perdida"}. El comando queda guardado para reintento seguro.`); }
    finally { submissionGate.current.release(); setSending(false); }
  };

  if (!grant) return <main className="online-shell"><header className="hero"><div><p className="eyebrow">Multijugador local</p><h1>Dominó <em>Online</em></h1></div></header>
    <section className="victory-rules" aria-labelledby="online-rules"><p className="eyebrow">Contrato de partida</p><h2 id="online-rules">Cuatro jugadores · objetivo 100</h2><div><span><strong>Dominada</strong> +20 puntos</span><span><strong>Cierre</strong> +0 puntos</span><span><strong>Formato</strong> Individual</span></div></section>
    <section className="online-entry"><h2>Sala privada</h2><label>Tu nombre<input maxLength={24} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button className="primary" disabled={!name.trim()} onClick={() => void enter("create")}>Crear sala</button><div className="join-row"><label>Código<input maxLength={6} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())}/></label><button className="primary" disabled={!name.trim() || code.trim().length !== 6} onClick={() => void enter("join")}>Entrar</button></div><p role="status">{message}</p></section></main>;
  if (!lobby) return <main className="online-shell"><p>Reconectando a la sala {grant.code}…</p><button onClick={leave}>Olvidar sesión</button></main>;
  const game = lobby.game; const myTurn = game?.currentPlayerId === lobby.viewerPlayerId; const actions = lobby.legalActions;
  const selected = game ? currentSelection(selection, game.revision) : null;
  const selectedActions = selected ? actions.filter((action) => action.tileId === selected) : [];
  const chooseSide = (side: Side) => { if (selected && selectedActions.some((action) => action.side === side)) void send({ type: "PLACE", tileId: selected, side }); };
  const selectTile = (tileId: TileId) => {
    if (!game || sending) return; const decision = placementDecision(tileId, actions);
    if (decision.kind === "SEND") void send(decision.command);
    else if (decision.kind === "CHOOSE") setSelection({ tileId, revision: game.revision });
  };
  const names = Object.fromEntries(lobby.players.map((player) => [player.playerId, player.name]));
  return <main className="online-shell"><header className="hero"><div><p className="eyebrow">Sala privada · {grant.code}</p><h1>Dominó <em>Online</em></h1></div><button className="ghost" onClick={leave}>Salir de esta sesión</button></header>
    <div className={`connection ${connection.toLowerCase()}`}>{connection === "CONNECTED" ? "Conectado" : connection === "CONNECTING" ? "Conectando…" : "Sin conexión · reintentando"}</div>
    <section className="online-seats">{[0,1,2,3].map((seat) => { const player = lobby.players.find((candidate) => candidate.seat === seat); return <div key={seat} className={player?.playerId === lobby.viewerPlayerId ? "me" : ""}><strong>{player?.name ?? "Esperando…"}</strong><span>{player ? `Asiento P${seat}` : "Libre"}</span>{player && <small>{player.connected ? "Conectado" : "Desconectado"}</small>}</div>; })}</section>
    {lobby.status === "WAITING" && <><section className="victory-rules compact" aria-label="Condiciones de victoria"><strong>Objetivo: 100 puntos</strong><span>Dominada +20 · Cierre +0 · Sin equipos</span></section><section className="waiting"><p className="eyebrow">Código de invitación</p><strong>{lobby.code}</strong><p>{lobby.players.length}/4 jugadores. La partida comienza al ocupar los cuatro asientos.</p></section></>}
    {game && <><div className="match-objective"><strong>Objetivo: 100 puntos</strong><span>Dominada +20 · Cierre +0</span></div><section className="scoreboard online-scoreboard">{game.players.map((player) => <div key={player.playerId} className={game.currentPlayerId === player.playerId ? "active-player" : ""}><span>{names[player.playerId]}</span><strong>{player.score}<small> / {TARGET_SCORE}</small></strong><progress max={TARGET_SCORE} value={Math.min(player.score, TARGET_SCORE)} aria-label={`Progreso de ${names[player.playerId]} hacia 100 puntos`}/><small>{dominationsRemaining(player.score)} {dominationsRemaining(player.score) === 1 ? "dominada" : "dominadas"} para ganar · {game.handCounts[player.playerId]} fichas</small></div>)}</section>
      <section className="table"><div className="table-status"><span>Ronda {game.roundNumber}</span><strong>{myTurn ? "Tu turno" : game.currentPlayerId ? `Turno de ${names[game.currentPlayerId]}` : "Ronda terminada"}</strong><span>{game.leftEnd === null ? "Apertura" : `Extremos ${game.leftEnd} · ${game.rightEnd}`}</span></div><Suspense fallback={<div className="three-stage"><p>Preparando mesa…</p></div>}><Table3D chain={game.chain} reducedMotion={reducedMotion}/></Suspense>{selectedActions.length > 1 && <div className="end-targets" aria-label="Elige un extremo"><button type="button" className="end-target left" disabled={sending} onClick={() => chooseSide("LEFT")}>Izquierda · {game.leftEnd}</button><button type="button" className="end-target right" disabled={sending} onClick={() => chooseSide("RIGHT")}>Derecha · {game.rightEnd}</button></div>}</section>
      <p className="message">{message}</p>
      {game.phase === "ROUND_ACTIVE" && <section className="controls"><div className="side-actions">{selectedActions.some((action) => action.side === "LEFT") && <button disabled={sending} onClick={() => chooseSide("LEFT")}>Jugar a la izquierda ({game.leftEnd})</button>}{selectedActions.some((action) => action.side === "RIGHT") && <button disabled={sending} onClick={() => chooseSide("RIGHT")}>Jugar a la derecha ({game.rightEnd})</button>}<button className="pass" disabled={sending || !actions.some((action) => action.type === "PASS")} onClick={() => void send({type:"PASS"})}>Pasar</button></div><h2>Tu mano</h2><div className="hand">{game.ownHand?.map((id) => <Tile key={id} id={id} selected={selected===id} enabled={!sending && actions.some((action) => action.tileId===id)} onClick={() => selectTile(id)}/>)}</div>{selected && <button className="cancel" disabled={sending} onClick={() => setSelection(null)}>Cancelar selección</button>}</section>}
      {game.phase === "ROUND_ENDED" && game.roundResult && <section className="result round-summary" aria-live="polite"><p className="eyebrow">Resultado de la ronda {game.roundNumber}</p><h2>{roundHeadline(game.roundResult)}</h2><p>{game.roundResult.winnerId ? `${names[game.roundResult.winnerId]} gana la ronda` : `Empate entre ${game.roundResult.tiedPlayerIds.map((id) => names[id]).join(" y ")}`}</p><div className="result-scores">{game.players.map((player) => <span key={player.playerId}><strong>{names[player.playerId]}</strong>{player.score} puntos {game.roundResult!.scoreDeltas[player.playerId] ? `(+${game.roundResult!.scoreDeltas[player.playerId]})` : "(+0)"}</span>)}</div><button className="primary" onClick={() => void send({type:"NEXT_ROUND"})}>Siguiente ronda</button></section>}
      {shouldShowMatchFinale(game.phase, game.matchResult) && <section className="result match-finale" aria-live="polite"><p className="eyebrow">Objetivo alcanzado</p><h2>Campeón: {names[game.matchResult.championId]}</h2>{game.roundResult && <div className="final-round-reason"><strong>{roundHeadline(game.roundResult)}</strong><span>{game.roundResult.winnerId ? `${names[game.roundResult.winnerId]} ganó la última ronda` : `Última ronda empatada entre ${game.roundResult.tiedPlayerIds.map((id) => names[id]).join(" y ")}`}</span></div>}<p>Marcador final de la partida</p><ol className="final-ranking">{finalRanking(game.players, names, game.matchResult).map((player) => <li key={player.playerId}><span>{player.rank}.º · {player.name}{player.tied ? " · empate" : ""}</span><strong>{player.score} puntos</strong></li>)}</ol><button className="primary" onClick={leave}>Volver al lobby</button></section>}</>}
  </main>;
}
