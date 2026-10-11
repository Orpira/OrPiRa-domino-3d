import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { TILE_BY_ID, type LegalAction, type PlayerView, type Side, type TileId } from "../../../packages/rules/src/index.ts";
import type { ClientCommand, TurnClockView } from "../../../packages/protocol/src/index.ts";
import { dominationsRemaining, finalRanking, roundHeadline, shouldShowMatchFinale, TARGET_SCORE } from "./online-presentation.ts";
import { currentSelection, placementDecision, type PlacementSelection } from "./placement-interaction.ts";
import { MatchCelebration } from "./MatchCelebration.tsx";
import type { StorageLike } from "./session-storage.ts";
import { automaticMoveText, formatCountdown, latestAutomaticNotice, remainingMs, seatBadges } from "./turn-clock-presentation.ts";
const Table3D = lazy(() => import("./Table3D.tsx").then((module) => ({ default: module.Table3D })));

function Tile({ id, enabled, selected, onClick }: { id: TileId; enabled: boolean; selected: boolean; onClick: () => void }) {
  const tile = TILE_BY_ID.get(id)!; return <button type="button" className={`tile ${selected ? "selected" : ""}`} disabled={!enabled} aria-label={`Ficha ${tile.a}-${tile.b}`} aria-pressed={selected} onClick={onClick}><span>{tile.a}</span><i/><span>{tile.b}</span></button>;
}

interface GameBoardProps {
  readonly game: PlayerView; readonly actions: readonly LegalAction[]; readonly names: Readonly<Record<string, string>>; readonly viewerId: string;
  readonly sending: boolean; readonly message: string; readonly reducedMotion: boolean; readonly celebrationStorage: StorageLike;
  readonly onCommand: (command: ClientCommand) => void; readonly onLeave: () => void;
  readonly context?: ReactNode; readonly finaleDetails?: ReactNode; readonly clock?: TurnClockView | null; readonly finaleActions?: ReactNode;
}

// Cuenta atrás local hacia la hora límite recibida; el servidor decide cuándo vence.
function useCountdown(clock: TurnClockView | null | undefined): number | null {
  const [received, setReceived] = useState(() => Date.now()); const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const at = Date.now(); setReceived(at); setNow(at); }, [clock]);
  useEffect(() => { if (!clock?.turnDeadline) return; const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, [clock]);
  return clock ? remainingMs(clock, received, now) : null;
}

// Mesa autoritativa compartida por la sala online y la competición de prueba: solo muestra la mano propia y recuentos rivales.
export function GameBoard({ game, actions, names, viewerId, sending, message, reducedMotion, celebrationStorage, onCommand, onLeave, context, finaleDetails, clock, finaleActions }: GameBoardProps) {
  const [selection, setSelection] = useState<PlacementSelection | null>(null);
  useEffect(() => { if (selection && game.revision !== selection.revision) setSelection(null); }, [game.revision, selection]);
  useEffect(() => { if (!sending) setSelection(null); }, [sending]);
  const myTurn = game.currentPlayerId === viewerId; const remaining = useCountdown(clock);
  const seatOf = (playerId: string) => clock?.seats.find((seat) => seat.playerId === playerId); const mySeat = seatOf(viewerId);
  const notice = latestAutomaticNotice(clock ?? null, game.revision); const urgent = remaining !== null && remaining <= 10_000 && clock?.deadlineKind === "TURN";
  const selected = currentSelection(selection, game.revision);
  const selectedActions = selected ? actions.filter((action) => action.tileId === selected) : [];
  const chooseSide = (side: Side) => { if (selected && selectedActions.some((action) => action.side === side)) onCommand({ type: "PLACE", tileId: selected, side }); };
  const selectTile = (tileId: TileId) => {
    if (sending) return; const decision = placementDecision(tileId, actions);
    if (decision.kind === "SEND") onCommand(decision.command);
    else if (decision.kind === "CHOOSE") setSelection({ tileId, revision: game.revision });
  };
  return <>
    <div className="match-objective"><strong>Objetivo: 100 puntos</strong><span>Dominada +20 · Cierre +0</span></div>
    {context}
    {mySeat?.automatic && <div className="auto-banner" role="status"><div><strong>Modo automático</strong><span>{mySeat.resumeRequested ? "Recuperarás el control en tu próximo turno." : "El servidor juega por ti tras agotar el tiempo o perder la conexión."}</span></div>
      {!mySeat.resumeRequested && <button className="primary" disabled={sending} onClick={() => onCommand({ type: "RESUME_CONTROL" })}>Retomar el control</button>}</div>}
    <section className="scoreboard online-scoreboard" aria-label="Marcador">{game.players.map((player) => <div key={player.playerId} className={game.currentPlayerId === player.playerId ? "active-player" : ""}><span>{names[player.playerId]}{player.playerId === viewerId ? " (tú)" : ""}{seatBadges(seatOf(player.playerId)).map((badge) => <em key={badge} className={`seat-badge ${badge === "Bot" ? "bot" : badge === "Automático" ? "auto" : "offline"}`}>{badge}</em>)}</span><strong>{player.score}<small> / {TARGET_SCORE}</small></strong><progress max={TARGET_SCORE} value={Math.min(player.score, TARGET_SCORE)} aria-label={`Progreso de ${names[player.playerId]} hacia 100 puntos`}/><small>{dominationsRemaining(player.score)} {dominationsRemaining(player.score) === 1 ? "dominada" : "dominadas"} para ganar · {game.handCounts[player.playerId]} fichas</small></div>)}</section>
    <section className="table" aria-label="Mesa de dominó"><div className="table-status"><span>Ronda {game.roundNumber}</span><strong>{myTurn ? "Tu turno" : game.currentPlayerId ? `Turno de ${names[game.currentPlayerId]}` : "Ronda terminada"}</strong><span>{game.leftEnd === null ? "Apertura" : `Extremos ${game.leftEnd} · ${game.rightEnd}`}</span></div>
      {clock && remaining !== null && <div className={`turn-clock ${urgent ? "urgent" : ""} ${myTurn ? "mine" : ""}`} role="timer" aria-label={clock.deadlineKind === "ROUND_BREAK" ? `Siguiente ronda en ${formatCountdown(remaining)}` : `${myTurn ? "Tu tiempo" : "Tiempo del turno"}: ${formatCountdown(remaining)}`}>
        <span>{clock.deadlineKind === "ROUND_BREAK" ? "Siguiente ronda en" : myTurn ? "Tu tiempo" : `Tiempo de ${names[game.currentPlayerId ?? ""] ?? "turno"}`}</span><strong>{formatCountdown(remaining)}</strong>
        {clock.deadlineKind === "TURN" && <progress max={clock.turnSeconds * 1000} value={Math.min(remaining, clock.turnSeconds * 1000)} aria-hidden="true"/>}</div>}<Suspense fallback={<div className="three-stage"><p>Preparando mesa…</p></div>}><Table3D chain={game.chain} reducedMotion={reducedMotion} endTargets={selectedActions.length > 1 ? { leftLabel: `Izquierda · ${game.leftEnd}`, rightLabel: `Derecha · ${game.rightEnd}`, disabled: sending, onLeft: () => chooseSide("LEFT"), onRight: () => chooseSide("RIGHT") } : undefined}/></Suspense></section>
    {notice && <p className="auto-notice" role="status" key={notice.revision}><span aria-hidden="true">⏱</span>{automaticMoveText(notice, names, viewerId)}</p>}
    <p className="message" role="status">{sending ? "Enviando acción…" : message}</p>
    {game.phase === "ROUND_ACTIVE" && <section className="controls"><div className="side-actions">{selectedActions.some((action) => action.side === "LEFT") && <button disabled={sending} onClick={() => chooseSide("LEFT")}>Jugar a la izquierda ({game.leftEnd})</button>}{selectedActions.some((action) => action.side === "RIGHT") && <button disabled={sending} onClick={() => chooseSide("RIGHT")}>Jugar a la derecha ({game.rightEnd})</button>}<button className="pass" disabled={sending || !actions.some((action) => action.type === "PASS")} onClick={() => onCommand({ type: "PASS" })}>Pasar</button></div><h2>Tu mano</h2><div className="hand">{game.ownHand?.map((id) => <Tile key={id} id={id} selected={selected === id} enabled={!sending && actions.some((action) => action.tileId === id)} onClick={() => selectTile(id)}/>)}</div>{selected && <button className="cancel" disabled={sending} onClick={() => setSelection(null)}>Cancelar selección</button>}</section>}
    {game.phase === "ROUND_ENDED" && game.roundResult && <section className="result round-summary" aria-live="polite"><p className="eyebrow">Resultado de la ronda {game.roundNumber}</p><h2>{roundHeadline(game.roundResult)}</h2><p>{game.roundResult.winnerId ? `${names[game.roundResult.winnerId]} gana la ronda` : `Empate entre ${game.roundResult.tiedPlayerIds.map((id) => names[id]).join(" y ")}`}</p><div className="result-scores">{game.players.map((player) => <span key={player.playerId}><strong>{names[player.playerId]}</strong>{player.score} puntos {game.roundResult!.scoreDeltas[player.playerId] ? `(+${game.roundResult!.scoreDeltas[player.playerId]})` : "(+0)"}</span>)}</div><button className="primary" disabled={sending} onClick={() => onCommand({ type: "NEXT_ROUND" })}>Siguiente ronda</button></section>}
    {shouldShowMatchFinale(game.phase, game.matchResult) && <><MatchCelebration matchId={game.matchId} phase={game.phase} result={game.matchResult} reducedMotion={reducedMotion} storage={celebrationStorage}/><section className="result match-finale" aria-live="polite"><p className="eyebrow">Objetivo alcanzado</p><div className="champion-callout"><span className="champion-trophy" aria-hidden="true">🏆</span><strong>¡{names[game.matchResult.championId]} ganó la partida!</strong><span>{game.matchResult.finalScores[game.matchResult.championId]} puntos</span></div>{game.roundResult && <div className="final-round-reason"><strong>{roundHeadline(game.roundResult)}</strong><span>{game.roundResult.winnerId ? `${names[game.roundResult.winnerId]} ganó la última ronda` : `Última ronda empatada entre ${game.roundResult.tiedPlayerIds.map((id) => names[id]).join(" y ")}`}</span></div>}<p>Marcador final de la partida</p><ol className="final-ranking">{finalRanking(game.players, names, game.matchResult).map((player) => <li key={player.playerId}><span>{player.rank}.º · {player.name}{player.tied ? " · empate" : ""}</span><strong>{player.score} puntos</strong></li>)}</ol>{finaleDetails}{finaleActions ?? <button className="primary" onClick={onLeave}>Volver al lobby</button>}</section></>}
  </>;
}
