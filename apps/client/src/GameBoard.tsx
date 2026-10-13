import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { freeOpening, isPairs, PAIRS_TARGET, TILE_BY_ID, type LegalAction, type PlayerView, type TileId } from "../../../packages/rules/src/index.ts";
import type { ClientCommand, TurnClockView } from "../../../packages/protocol/src/index.ts";
import { dominationsRemaining, finalRanking, roundHeadline, shouldShowMatchFinale, TARGET_SCORE } from "./online-presentation.ts";
import { currentSelection, type PlacementSelection } from "./placement-interaction.ts";
import { MatchCelebration } from "./MatchCelebration.tsx";
import { DominoFace } from "./DominoFace.tsx";
import { HandGrip } from "./HandGrip.tsx";
import { SoundToggle, useGameSounds } from "./sound.tsx";
import { dropSides, type DropSide } from "./drop-target.ts";
import { championTeamText, pairsRoundText, teamStandings } from "./pairs-presentation.ts";
import { placementTargets, useHandDrag } from "./hand-drag.tsx";
import type { StorageLike } from "./session-storage.ts";
import { automaticMoveText, formatCountdown, latestAutomaticNotice, remainingMs, seatBadges, showAutomaticBanner } from "./turn-clock-presentation.ts";
const Table3D = lazy(() => import("./Table3D.tsx").then((module) => ({ default: module.Table3D })));

function Tile({ id, enabled, selected, away, onClick, drag }: { id: TileId; enabled: boolean; selected: boolean; away: boolean; onClick: () => void; drag: object }) {
  const tile = TILE_BY_ID.get(id)!; return <button type="button" className={`tile pips ${selected ? "selected" : ""} ${away ? "away" : ""}`} disabled={!enabled} aria-label={`Ficha ${tile.a}-${tile.b}`} aria-pressed={selected} onClick={onClick} {...drag}><DominoFace a={tile.a} b={tile.b}/>{selected && !away && <HandGrip className="grip-select"/>}</button>;
}

interface GameBoardProps {
  readonly game: PlayerView; readonly actions: readonly LegalAction[]; readonly names: Readonly<Record<string, string>>; readonly viewerId: string;
  readonly sending: boolean; readonly message: string; readonly reducedMotion: boolean; readonly celebrationStorage: StorageLike;
  readonly onCommand: (command: ClientCommand) => void; readonly onLeave: () => void;
  readonly context?: ReactNode; readonly finaleDetails?: ReactNode; readonly clock?: TurnClockView | null; readonly finaleActions?: ReactNode; readonly nameDecorations?: Readonly<Record<string, ReactNode>>;
}

// Cuenta atrás local hacia la hora límite recibida; el servidor decide cuándo vence.
function useCountdown(clock: TurnClockView | null | undefined): number | null {
  const [received, setReceived] = useState(() => Date.now()); const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const at = Date.now(); setReceived(at); setNow(at); }, [clock]);
  useEffect(() => { if (!clock?.turnDeadline) return; const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, [clock]);
  return clock ? remainingMs(clock, received, now) : null;
}

// Mesa autoritativa compartida por la sala online y la competición de prueba: solo muestra la mano propia y recuentos rivales.
export function GameBoard({ game, actions, names, viewerId, sending, message, reducedMotion, celebrationStorage, onCommand, onLeave, context, finaleDetails, clock, finaleActions, nameDecorations }: GameBoardProps) {
  const [selection, setSelection] = useState<PlacementSelection | null>(null);
  useEffect(() => { if (selection && game.revision !== selection.revision) setSelection(null); }, [game.revision, selection]);
  useEffect(() => { if (!sending) setSelection(null); }, [sending]);
  const myTurn = game.currentPlayerId === viewerId; const remaining = useCountdown(clock);
  const seatOf = (playerId: string) => clock?.seats.find((seat) => seat.playerId === playerId); const mySeat = seatOf(viewerId);
  const notice = latestAutomaticNotice(clock ?? null, game.revision); const urgent = remaining !== null && remaining <= 10_000 && clock?.deadlineKind === "TURN";
  const selected = currentSelection(selection, game.revision);
  const canPlace = game.phase === "ROUND_ACTIVE" && !sending && actions.some((action) => action.type === "PLACE");
  const sidesOf = (tileId: TileId) => dropSides(actions, tileId);
  const placeAt = (tileId: TileId, side: DropSide) => { if (!sending) onCommand({ type: "PLACE", tileId, ...(side === "CENTER" ? {} : { side }) }); };
  const drag = useHandDrag({ enabled: canPlace, sidesOf, onDrop: placeAt, handIds: game.ownHand ?? [], reducedMotion });
  const focusId = drag.draggingId ?? selected;
  const targets = focusId && canPlace ? placementTargets(sidesOf(focusId), { left: game.leftEnd, right: game.rightEnd }, (side) => placeAt(focusId, side), drag.hot, sending) : undefined;
  // Tocar una ficha solo la levanta: el jugador la coloca arrastrándola a la mesa o eligiendo un destino.
  const selectTile = (tileId: TileId) => {
    if (drag.consumeClick() || sending || sidesOf(tileId).length === 0) return;
    setSelection(selected === tileId ? null : { tileId, revision: game.revision });
  };
  useGameSounds(game, viewerId);
  const pairs = isPairs(game); const teams = pairs ? teamStandings(game, names, viewerId) : [];
  const pairsRound = pairs && game.roundResult ? pairsRoundText(game.roundResult, names) : null;
  const badges = (playerId: string) => seatBadges(seatOf(playerId)).map((badge) => <em key={badge} className={`seat-badge ${badge === "Bot" ? "bot" : badge === "Automático" ? "auto" : "offline"}`}>{badge}</em>);
  return <>
    <div className="match-objective">{pairs ? <><strong>Parejas · objetivo {PAIRS_TARGET} puntos</strong><span>Compañero enfrente · la mano ganada suma las cuatro manos</span></> : <><strong>Objetivo: 100 puntos</strong><span>Dominada +20 · Cierre +0</span></>}<SoundToggle/></div>
    {context}
    {mySeat && showAutomaticBanner(mySeat, game.phase) && <div className="auto-banner" role="status"><div><strong>Modo automático</strong><span>{mySeat.resumeRequested ? "Recuperarás el control en tu próximo turno." : "El servidor juega por ti tras agotar el tiempo o perder la conexión."}</span></div>
      {!mySeat.resumeRequested && <button className="primary" disabled={sending} onClick={() => onCommand({ type: "RESUME_CONTROL" })}>Retomar el control</button>}</div>}
    {pairs ? <section className="scoreboard pairs online-scoreboard" aria-label="Marcador por parejas">{teams.map((team, index) => <div key={team.label} className={team.active ? "active-player" : ""}><span className="seat-name">{index === 0 ? "Tu pareja" : "Rivales"}</span><strong>{team.score}<small> / {PAIRS_TARGET}</small></strong><progress max={PAIRS_TARGET} value={Math.min(team.score, PAIRS_TARGET)} aria-label={`Progreso de ${team.label} hacia ${PAIRS_TARGET} puntos`}/>{team.ids.map((id) => <small key={id} className="seat-name">{nameDecorations?.[id]}{names[id]}{id === viewerId ? " (tú)" : ""}{badges(id)} · {game.handCounts[id]} fichas</small>)}</div>)}</section>
    : <section className="scoreboard online-scoreboard" aria-label="Marcador">{game.players.map((player) => <div key={player.playerId} className={game.currentPlayerId === player.playerId ? "active-player" : ""}><span className="seat-name">{nameDecorations?.[player.playerId]}{names[player.playerId]}{player.playerId === viewerId ? " (tú)" : ""}{seatBadges(seatOf(player.playerId)).map((badge) => <em key={badge} className={`seat-badge ${badge === "Bot" ? "bot" : badge === "Automático" ? "auto" : "offline"}`}>{badge}</em>)}</span><strong>{player.score}<small> / {TARGET_SCORE}</small></strong><progress max={TARGET_SCORE} value={Math.min(player.score, TARGET_SCORE)} aria-label={`Progreso de ${names[player.playerId]} hacia 100 puntos`}/><small>{dominationsRemaining(player.score)} {dominationsRemaining(player.score) === 1 ? "dominada" : "dominadas"} para ganar · {game.handCounts[player.playerId]} fichas</small></div>)}</section>}
    <section className="table" aria-label="Mesa de dominó"><div className="table-status"><span>Ronda {game.roundNumber}</span><strong>{myTurn ? "Tu turno" : game.currentPlayerId ? `Turno de ${names[game.currentPlayerId]}` : "Ronda terminada"}</strong><span>{game.leftEnd === null ? "Apertura" : `Extremos ${game.leftEnd} · ${game.rightEnd}`}</span></div>
      {clock && remaining !== null && <div className={`turn-clock ${urgent ? "urgent" : ""} ${myTurn ? "mine" : ""}`} role="timer" aria-label={clock.deadlineKind === "ROUND_BREAK" ? `Siguiente ronda en ${formatCountdown(remaining)}` : `${myTurn ? "Tu tiempo" : "Tiempo del turno"}: ${formatCountdown(remaining)}`}>
        <span>{clock.deadlineKind === "ROUND_BREAK" ? "Siguiente ronda en" : myTurn ? "Tu tiempo" : `Tiempo de ${names[game.currentPlayerId ?? ""] ?? "turno"}`}</span><strong>{formatCountdown(remaining)}</strong>
        {clock.deadlineKind === "TURN" && <progress max={clock.turnSeconds * 1000} value={Math.min(remaining, clock.turnSeconds * 1000)} aria-hidden="true"/>}</div>}<Suspense fallback={<div className="three-stage"><p>Preparando mesa…</p></div>}><Table3D chain={game.chain} reducedMotion={reducedMotion} players={game.players} viewerId={viewerId} targets={targets} locatorRef={drag.locatorRef} dropOrigin={drag.dropOrigin}
      openingId={game.openingTileId} openingHint={freeOpening(game) && game.chain.length === 0 && game.currentPlayerId ? `${myTurn ? "Sales tú" : `Sale ${names[game.currentPlayerId]}`} con la ficha que quiera` : undefined}/></Suspense></section>
    {drag.ghost}
    {notice && <p className="auto-notice" role="status" key={notice.revision}><span aria-hidden="true">⏱</span>{automaticMoveText(notice, names, viewerId)}</p>}
    <p className="message" role="status">{sending ? "Enviando acción…" : message}</p>
    {game.phase === "ROUND_ACTIVE" && <section className="controls"><div className="side-actions"><button className="pass" disabled={sending || !actions.some((action) => action.type === "PASS")} onClick={() => onCommand({ type: "PASS" })}>Pasar</button></div><h2>Tu mano</h2><p className="hand-hint" aria-hidden={!canPlace} style={canPlace ? undefined : { visibility: "hidden" }}>Arrastra una ficha a la mesa o tócala y toca el brillo</p><div className="hand">{game.ownHand?.map((id) => <Tile key={id} id={id} selected={selected === id} away={drag.hiddenId === id} enabled={!sending && actions.some((action) => action.tileId === id)} onClick={() => selectTile(id)} drag={drag.bind(id)}/>)}</div>{selected && <button className="cancel" disabled={sending} onClick={() => setSelection(null)}>Cancelar selección</button>}</section>}
    {game.phase === "ROUND_ENDED" && game.roundResult && <section className="result round-summary" aria-live="polite"><p className="eyebrow">Resultado de la {pairs ? "mano" : "ronda"} {game.roundNumber}</p>{pairsRound ? <><h2>{pairsRound.headline}</h2><p>{pairsRound.detail}</p></> : <><h2>{roundHeadline(game.roundResult)}</h2><p>{game.roundResult.winnerId ? `${names[game.roundResult.winnerId]} gana la ronda` : `Empate entre ${game.roundResult.tiedPlayerIds.map((id) => names[id]).join(" y ")}`}</p></>}<div className="result-scores">{game.players.map((player) => <span key={player.playerId}><strong>{names[player.playerId]}</strong>{player.score} puntos {game.roundResult!.scoreDeltas[player.playerId] ? `(+${game.roundResult!.scoreDeltas[player.playerId]})` : "(+0)"}</span>)}</div><button className="primary" disabled={sending} onClick={() => onCommand({ type: "NEXT_ROUND" })}>Siguiente ronda</button></section>}
    {shouldShowMatchFinale(game.phase, game.matchResult) && <><MatchCelebration matchId={game.matchId} phase={game.phase} result={game.matchResult} reducedMotion={reducedMotion} storage={celebrationStorage}/><section className="result match-finale" aria-live="polite"><p className="eyebrow">Objetivo alcanzado</p>{pairs ? <PairsFinale game={game} names={names} viewerId={viewerId}/> : <><div className="champion-callout"><span className="champion-trophy" aria-hidden="true">🏆</span><strong>¡{names[game.matchResult.championId]} ganó la partida!</strong><span>{game.matchResult.finalScores[game.matchResult.championId]} puntos</span></div>{game.roundResult && <div className="final-round-reason"><strong>{roundHeadline(game.roundResult)}</strong><span>{game.roundResult.winnerId ? `${names[game.roundResult.winnerId]} ganó la última ronda` : `Última ronda empatada entre ${game.roundResult.tiedPlayerIds.map((id) => names[id]).join(" y ")}`}</span></div>}<p>Marcador final de la partida</p><ol className="final-ranking">{finalRanking(game.players, names, game.matchResult).map((player) => <li key={player.playerId}><span>{player.rank}.º · {player.name}{player.tied ? " · empate" : ""}</span><strong>{player.score} puntos</strong></li>)}</ol></>}{finaleDetails}{finaleActions ?? <button className="primary" onClick={onLeave}>Volver al lobby</button>}</section></>}
  </>;
}

function PairsFinale({ game, names, viewerId }: { game: PlayerView; names: Readonly<Record<string, string>>; viewerId: string }) {
  const result = game.matchResult!; const champions = championTeamText(result, names); const won = result.championTeam?.includes(viewerId) ?? false;
  const final = game.roundResult ? pairsRoundText(game.roundResult, names) : null;
  return <><div className="champion-callout"><span className="champion-trophy" aria-hidden="true">🏆</span><strong>¡{champions.label} ganan la partida!</strong><span>{champions.score} puntos{won ? " · tu pareja" : ""}</span></div>
    {final && <div className="final-round-reason"><strong>{final.headline}</strong><span>{final.detail}</span></div>}
    <p>Marcador final por parejas</p><ol className="final-ranking">{[...teamStandings(game, names, viewerId)].sort((left, right) => right.score - left.score).map((team, index) => <li key={team.label}><span>{index + 1}.º · {team.label}</span><strong>{team.score} puntos</strong></li>)}</ol></>;
}
