import { useCallback, useEffect, useState } from "react";
import type { TargetScore } from "../../../packages/rules/src/index.ts";
import type { LobbyView, SessionGrant } from "../../../packages/protocol/src/index.ts";
import { TableSetup } from "./ui.tsx";
import { choiceLabel, effectiveTarget, normalizeChoice, rulesSummary, type TableChoice } from "./modes-presentation.ts";
import { GameBoard } from "./GameBoard.tsx";
import { useCommandChannel } from "./use-command-channel.ts";
import { deviceStorage, readJson, removeKey, writeJson } from "./device-storage.ts";
import { useReducedMotion } from "./use-reduced-motion.ts";
import { apiUrl } from "./api.ts";

import { ONLINE_SESSION_KEY } from "./online-session.ts";
import { InvitePanel, useSocial } from "./invite-ui.tsx";
import { competitionErrorMessage } from "./competition-presentation.ts";
import type { TestAccount } from "./use-test-account.ts";
const PENDING_KEY = `${ONLINE_SESSION_KEY}:pending`;
type Connection = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
function auth(grant: SessionGrant) { return { authorization: `Bearer ${grant.sessionId}`, "content-type": "application/json" }; }

export function OnlineApp({ account, notice }: { account?: TestAccount; notice?: string } = {}) {
  const identity = account?.identity ?? null; const { social } = useSocial(identity?.identityToken ?? null);
  const [grant, setGrant] = useState<SessionGrant | null>(() => readJson<SessionGrant>(deviceStorage(), ONLINE_SESSION_KEY));
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [connection, setConnection] = useState<Connection>("CONNECTING");
  const [name, setName] = useState(identity?.displayName ?? ""); const [code, setCode] = useState(""); const [entryMessage, setEntryMessage] = useState(""); const [entering, setEntering] = useState(false); const [choice, setChoice] = useState<TableChoice>({ rules: "LATINO", mode: "INDIVIDUAL" });
  const reducedMotion = useReducedMotion();
  const refresh = useCallback(async (active: SessionGrant, signal?: AbortSignal) => {
    try { const response = await fetch(apiUrl(`/api/lobbies/${active.code}`), { headers: auth(active), ...(signal ? { signal } : {}) }); if (!response.ok) throw new Error("Sesión rechazada");
      setLobby(await response.json() as LobbyView); setConnection("CONNECTED");
    } catch (error) { if ((error as Error).name !== "AbortError") setConnection("DISCONNECTED"); }
  }, []);
  useEffect(() => {
    if (!grant) return; const controller = new AbortController(); setConnection("CONNECTING"); void refresh(grant, controller.signal);
    const timer = window.setInterval(() => void refresh(grant, controller.signal), 1_000); return () => { controller.abort(); clearInterval(timer); };
  }, [grant, refresh]);
  const refreshCurrent = useCallback(async () => { if (grant) await refresh(grant); }, [grant, refresh]);
  const disconnect = useCallback(() => setConnection("DISCONNECTED"), []);
  const channel = useCommandChannel({ path: grant ? `/api/lobbies/${grant.code}/commands` : null, token: grant?.sessionId ?? null, pendingKey: PENDING_KEY, storage: deviceStorage(),
    revision: lobby?.game?.revision ?? null, connected: connection === "CONNECTED", refresh: refreshCurrent, onDisconnect: disconnect });

  const enter = async (kind: "create" | "join") => {
    if (entering) return; setEntering(true);
    try {
      const url = kind === "create" ? "/api/lobbies" : `/api/lobbies/${code.trim().toUpperCase()}/join`;
      // Con cuenta de prueba, la plaza queda enlazada a ella (necesario para las amistades por invitación).
      const response = await fetch(apiUrl(url), { method: "POST", headers: { "content-type": "application/json", ...(identity ? { authorization: `Bearer ${identity.identityToken}` } : {}) }, body: JSON.stringify(kind === "create" ? { name, ...normalizeChoice(choice) } : { name }) });
      if (!response.ok) { const failure = await response.json().catch(() => null) as { code?: string } | null;
        throw new Error(failure?.code === "ALREADY_IN_ROOM" || failure?.code === "UNAUTHENTICATED" ? competitionErrorMessage(failure.code) : kind === "join" ? "No se pudo entrar: revisa el código o si la sala está completa." : "No se pudo abrir la sala"); }
      const next = await response.json() as SessionGrant; writeJson(deviceStorage(), ONLINE_SESSION_KEY, next); setGrant(next); setEntryMessage("");
    } catch (error) { setEntryMessage((error as Error).message === "Failed to fetch" ? "Sin conexión con el servidor." : (error as Error).message); }
    finally { setEntering(false); }
  };
  const leave = () => { removeKey(deviceStorage(), ONLINE_SESSION_KEY); removeKey(deviceStorage(), PENDING_KEY); setGrant(null); setLobby(null); setConnection("CONNECTING"); };

  if (!grant) return <main className="online-shell view"><header className="view-header"><p className="eyebrow">Partida online · sin saldo</p><h1>Mesa entre amigos</h1><p className="lede">Sala privada por código para cuatro jugadores, individual o por parejas. No usa saldo simulado.</p></header>
    <section className="victory-rules" aria-labelledby="online-rules"><p className="eyebrow">Contrato de partida</p><h2 id="online-rules">{choiceLabel(choice)}</h2><p className="muted">{rulesSummary(choice)}{choice.mode === "PAIRS" ? " · P0 y P2 contra P1 y P3" : ""}</p></section>
    <section className="online-entry"><h2>Sala privada</h2><TableSetup choice={choice} onChange={setChoice} label="Mesa nueva"/><label>Tu nombre<input maxLength={24} autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button className="primary" disabled={!name.trim() || entering} onClick={() => void enter("create")}>{choice.mode === "PAIRS" ? "Crear sala por parejas" : "Crear sala privada"}</button><div className="join-row"><label>Código<input maxLength={6} autoCapitalize="characters" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())}/></label><button className="primary" disabled={!name.trim() || code.trim().length !== 6 || entering} onClick={() => void enter("join")}>Entrar</button></div><p role="status">{entering ? "Conectando…" : entryMessage}</p></section></main>;
  if (!lobby) return <main className="online-shell view"><div className="state-card" role="status"><p>{connection === "DISCONNECTED" ? `Sin conexión con la sala ${grant.code}. Reintentando…` : `Reconectando a la sala ${grant.code}…`}</p><button className="secondary" onClick={leave}>Olvidar sesión</button></div></main>;
  const game = lobby.game;
  const names = Object.fromEntries(lobby.players.map((player) => [player.playerId, player.name])); const pairs = lobby.mode === "PAIRS"; const lobbyChoice: TableChoice = { rules: lobby.rules ?? "LATINO", mode: lobby.mode ?? "INDIVIDUAL", ...(lobby.targetScore ? { targetScore: lobby.targetScore as TargetScore } : {}) }; const lobbyTarget = effectiveTarget(lobbyChoice);
  return <main className="online-shell view"><header className="hero"><div><p className="eyebrow">Sala privada · {grant.code}{pairs ? " · parejas" : lobbyChoice.rules === "DRAW" ? " · con robo" : lobbyChoice.rules === "ALL_FIVES" ? " · All Fives" : ""}</p><h1>Dominó <em>Online</em></h1></div><button className="ghost" onClick={leave}>Salir de esta sesión</button></header>
    <div className={`connection ${connection.toLowerCase()}`} role="status">{connection === "CONNECTED" ? "Conectado" : connection === "CONNECTING" ? "Conectando…" : "Sin conexión · reintentando"}</div>
    {notice && <p className="invite-notice" role="status">{notice}</p>}
    <section className="online-seats">{[0,1,2,3].map((seat) => { const player = lobby.players.find((candidate) => candidate.seat === seat); return <div key={seat} className={player?.playerId === lobby.viewerPlayerId ? "me" : ""}><strong>{player?.name ?? "Esperando…"}</strong><span>{player ? `Asiento P${seat}` : "Libre"}{pairs ? ` · pareja ${seat % 2 === 0 ? "A" : "B"}` : ""}</span>{player && <small>{player.connected ? "Conectado" : "Desconectado"}</small>}</div>; })}</section>
    {lobby.status === "WAITING" && <><section className="victory-rules compact" aria-label="Condiciones de victoria">{pairs ? <><strong>Objetivo: {lobbyTarget} puntos por pareja</strong><span>Pareja A: asientos P0 y P2 · Pareja B: P1 y P3</span></> : <><strong>{choiceLabel(lobbyChoice)}</strong><span>{rulesSummary(lobbyChoice)}</span></>}</section><section className="waiting"><p className="eyebrow">Código de invitación</p><strong>{lobby.code}</strong><p>{lobby.players.length}/4 jugadores. La partida comienza al ocupar los cuatro asientos.</p></section><InvitePanel code={lobby.code} choice={lobbyChoice} username={social?.username ?? null}/></>}
    {game && <GameBoard game={game} actions={lobby.legalActions} names={names} viewerId={lobby.viewerPlayerId} sending={channel.sending} message={channel.message} reducedMotion={reducedMotion}
      celebrationStorage={deviceStorage()} onCommand={(command) => void channel.send(command)} onLeave={leave} clock={lobby.clock}/>}
  </main>;
}
