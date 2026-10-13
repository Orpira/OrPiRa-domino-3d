import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { TILE_BY_ID, type GameState, type Side, type TileId } from "../../../packages/rules/src/index.ts";
import { HUMAN_ID, LocalGame, playerName, randomDeal, type LocalMode } from "./local-game.ts";
import { loadSession, saveSession } from "./session-storage.ts";
import { currentSelection, SubmissionGate, type PlacementSelection } from "./placement-interaction.ts";
import { MatchCelebration } from "./MatchCelebration.tsx";
import { finalRanking } from "./online-presentation.ts";
import { DominoFace } from "./DominoFace.tsx";
import { HandGrip } from "./HandGrip.tsx";
import { SoundToggle, useGameSounds } from "./sound.tsx";
import { dropSides, type DropSide } from "./drop-target.ts";
import { placementTargets, useHandDrag } from "./hand-drag.tsx";
const Table3D = lazy(() => import("./Table3D.tsx").then((module) => ({ default: module.Table3D })));

function Tile({ id, selected = false, disabled = false, away = false, onClick, drag }: { id: TileId; selected?: boolean; disabled?: boolean; away?: boolean; onClick?: () => void; drag?: object }) {
  const tile = TILE_BY_ID.get(id)!;
  return <button type="button" className={`tile pips ${selected ? "selected" : ""} ${away ? "away" : ""}`} disabled={disabled} onClick={onClick} aria-label={`Ficha ${tile.a}-${tile.b}`} aria-pressed={selected} {...drag}>
    <DominoFace a={tile.a} b={tile.b}/>{selected && !away && <HandGrip className="grip-select"/>}
  </button>;
}

interface BootState { game: LocalGame; handoff: boolean; restored: boolean }
function boot(): BootState {
  try {
    const saved = loadSession(window.localStorage);
    if (saved) return { game: new LocalGame(randomDeal, saved.mode, saved.state), handoff: saved.handoffRequired, restored: true };
  } catch { /* El almacenamiento puede estar bloqueado por el navegador. */ }
  return { game: new LocalGame(), handoff: false, restored: false };
}

export default function App() {
  const bootRef = useRef<BootState | null>(null); if (!bootRef.current) bootRef.current = boot();
  const gameRef = useRef(bootRef.current.game);
  const [state, setState] = useState<GameState>(gameRef.current.state);
  const [mode, setMode] = useState<LocalMode>(gameRef.current.mode);
  useGameSounds(state, mode === "BOTS" ? HUMAN_ID : undefined);
  const [handoff, setHandoff] = useState(bootRef.current.handoff);
  const [selection, setSelection] = useState<PlacementSelection | null>(null);
  const [message, setMessage] = useState(bootRef.current.restored ? "Partida reanudada" : "Partida preparada");
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const placementGate = useRef(new SubmissionGate());
  const game = gameRef.current;
  const actions = mode === "BOTS" ? game.humanActions : game.currentActions;
  const botsBusy = game.isBotTurn;
  const activeId = state.currentPlayerId;
  const visibleHandId = mode === "BOTS" ? HUMAN_ID : activeId;

  const update = useCallback((next: GameState, text?: string, requireHandoff = false) => {
    setState(next); setSelection(null); setHandoff(requireHandoff && next.phase === "ROUND_ACTIVE"); if (text) setMessage(text);
  }, []);

  useEffect(() => {
    try { saveSession(window.localStorage, { version: 1, mode, state, handoffRequired: handoff }); } catch { setMessage("No se pudo guardar el checkpoint local"); }
  }, [handoff, mode, state]);

  useEffect(() => {
    if (!game.isBotTurn) return;
    const timer = window.setTimeout(() => {
      const actor = game.state.currentPlayerId!;
      update(game.playOneBotTurn(), `${playerName(actor, mode)} ha jugado`);
    }, reducedMotion ? 80 : 420);
    return () => window.clearTimeout(timer);
  }, [game, mode, reducedMotion, state, update]);

  const selected = currentSelection(selection, state.revision);
  const selectedActions = selected ? actions.filter((action) => action.type === "PLACE" && action.tileId === selected) : [];
  const handIds = state.phase === "ROUND_ACTIVE" && visibleHandId ? state.hands[visibleHandId]! : [];
  const canPlace = state.phase === "ROUND_ACTIVE" && game.isHumanTurn && !botsBusy && !handoff;
  const sidesOf = (id: TileId) => dropSides(actions, id);
  const placeAt = (id: TileId, side: DropSide) => playTile(id, side === "CENTER" ? undefined : side);
  const drag = useHandDrag({ enabled: canPlace, sidesOf, onDrop: placeAt, handIds, reducedMotion });
  const focusId = drag.draggingId ?? selected;
  const targets = focusId && canPlace ? placementTargets(sidesOf(focusId), { left: state.leftEnd, right: state.rightEnd }, (side) => placeAt(focusId, side), drag.hot) : undefined;
  const canPass = !handoff && actions.length === 1 && actions[0]?.type === "PASS";
  const roundResult = state.roundResult;
  const winnerName = roundResult?.winnerId ? playerName(roundResult.winnerId, mode) : null;
  const names = Object.fromEntries(state.players.map((player) => [player.playerId, playerName(player.playerId, mode)]));
  const championName = state.matchResult ? names[state.matchResult.championId] : null;

  const switchMode = (nextMode: LocalMode) => {
    if (nextMode === mode) return;
    if ((state.revision > 1 || state.players.some((player) => player.score > 0)) &&
        !window.confirm("Cambiar de modalidad inicia una partida nueva y sustituye el checkpoint actual. ¿Continuar?")) return;
    const nextGame = new LocalGame(randomDeal, nextMode); gameRef.current = nextGame;
    setMode(nextMode); update(nextGame.state, nextMode === "BOTS" ? "Nueva partida contra bots" : "Partida para cuatro personas", nextMode === "PASS_AND_PLAY");
  };
  const afterHumanAction = (next: GameState, text: string) => update(next, text, mode === "PASS_AND_PLAY");
  const playTile = (tileId: TileId, side?: Side) => {
    if (botsBusy || handoff || !placementGate.current.tryLock()) return;
    try { afterHumanAction(game.placeCurrent(tileId, side), state.chain.length === 0 ? "Apertura con 6–6" : "Ficha colocada"); }
    catch (error) { setMessage((error as Error).message); }
    finally { window.setTimeout(() => placementGate.current.release(), 0); }
  };
  const playSelected = (side: Side) => { if (selected && selectedActions.some((action) => action.side === side)) playTile(selected, side); };
  // Tocar una ficha solo la levanta: el jugador la coloca arrastrándola a la mesa o eligiendo un destino.
  const selectTile = (id: TileId) => {
    if (drag.consumeClick() || !canPlace || sidesOf(id).length === 0) return;
    setSelection(selected === id ? null : { tileId: id, revision: state.revision });
  };
  const restart = () => update(game.restart(), "Nueva partida preparada", mode === "PASS_AND_PLAY");

  return <main>
    <header className="hero">
      <div><p className="eyebrow">OrPiRa · partida local 3D</p><h1>Dominó <em>Latino</em></h1></div>
      <div className="target"><span>Objetivo</span><strong>100</strong></div>
    </header>
    <nav className="mode-switch" aria-label="Modalidad local">
      <button className={mode === "BOTS" ? "current" : ""} onClick={() => switchMode("BOTS")}>1 persona + 3 bots</button>
      <button className={mode === "PASS_AND_PLAY" ? "current" : ""} onClick={() => switchMode("PASS_AND_PLAY")}>4 personas · relevo</button>
      <button className="motion" onClick={() => setReducedMotion((value) => !value)}>{reducedMotion ? "Movimiento reducido" : "Movimiento suave"}</button>
      <SoundToggle/>
    </nav>
    <section className="scoreboard" aria-label="Marcador">
      {state.players.map((player) => <div key={player.playerId} className={state.currentPlayerId === player.playerId ? "active-player" : ""}>
        <span>{playerName(player.playerId, mode)}</span><strong>{player.score}</strong><small>{state.hands[player.playerId]!.length} fichas</small>
      </div>)}
    </section>
    <section className="table" aria-label="Mesa de dominó">
      <div className="table-status"><span>Ronda {state.roundNumber}</span><strong>{state.phase === "ROUND_ACTIVE" ? `Turno: ${playerName(activeId!, mode)}` : "Ronda terminada"}</strong><span>{state.leftEnd === null ? "Apertura pendiente" : `Extremos ${state.leftEnd} · ${state.rightEnd}`}</span></div>
      <Suspense fallback={<div className="three-stage"><p>Preparando mesa 3D…</p></div>}><Table3D chain={state.chain} reducedMotion={reducedMotion} players={state.players} viewerId={mode === "BOTS" ? HUMAN_ID : undefined} targets={targets} locatorRef={drag.locatorRef} dropOrigin={drag.dropOrigin} /></Suspense>
    </section>
    <p className="message" role="status">{botsBusy ? "El bot está pensando…" : message} <span className="saved">Guardado local automático</span></p>
    {state.phase === "ROUND_ACTIVE" && !handoff && visibleHandId && <section className="controls">
      <div className="side-actions">
        {selectedActions.some((action) => action.side === "LEFT") && <button onClick={() => playSelected("LEFT")}>Jugar a la izquierda ({state.leftEnd})</button>}
        {selectedActions.some((action) => action.side === "RIGHT") && <button onClick={() => playSelected("RIGHT")}>Jugar a la derecha ({state.rightEnd})</button>}
        {selected && selectedActions.some((action) => action.side === undefined) && <button onClick={() => playTile(selected)}>Abrir con 6–6</button>}
        <button className="pass" disabled={!canPass} onClick={() => afterHumanAction(game.passCurrent(), `${playerName(activeId!, mode)} pasa`)}>Pasar</button>
      </div>
      <h2>Mano de {playerName(visibleHandId, mode)}</h2>
      <p className="hand-hint" aria-hidden={!canPlace} style={canPlace ? undefined : { visibility: "hidden" }}>Arrastra una ficha hasta la mesa · o tócala y elige el extremo</p>
      <div className="hand">{state.hands[visibleHandId]!.map((id) => <Tile key={id} id={id} selected={selected === id} away={drag.hiddenId === id} disabled={!actions.some((action) => action.tileId === id)} onClick={() => selectTile(id)} drag={drag.bind(id)} />)}</div>
      {selected && <button className="cancel" onClick={() => setSelection(null)}>Cancelar selección</button>}
    </section>}
    {drag.ghost}
    {state.phase === "MATCH_ENDED" && <MatchCelebration matchId={state.matchId} phase={state.phase} result={state.matchResult} reducedMotion={reducedMotion} storage={window.localStorage}/>}
    {state.phase !== "ROUND_ACTIVE" && roundResult && <section className={`result ${state.phase === "MATCH_ENDED" ? "match-finale" : ""}`} role="dialog" aria-label={state.phase === "MATCH_ENDED" ? "Resultado final de la partida" : "Resultado de ronda"}>
      <p className="eyebrow">{roundResult.reason === "DOMINO" ? "Dominada" : "Cierre"}</p><h2>{winnerName ? `${winnerName} gana la ronda` : "Empate en el mínimo"}</h2>
      <p>{roundResult.reason === "DOMINO" ? `${winnerName} suma 20 puntos.` : "El cierre no concede puntos."}</p>
      <div className="totals">{state.players.map((player) => <span key={player.playerId}>{playerName(player.playerId, mode)}: {roundResult.handPipTotals[player.playerId]}</span>)}</div>
      {state.phase === "ROUND_ENDED" ? <button className="primary" onClick={() => update(game.startNextRound(), "Nueva ronda: busca el 6–6", mode === "PASS_AND_PLAY")}>Siguiente ronda</button> : <><div className="champion-callout"><span className="champion-trophy" aria-hidden="true">🏆</span><strong>¡{championName} ganó la partida!</strong><span>{state.matchResult!.finalScores[state.matchResult!.championId]} puntos</span></div><p>Clasificación final</p><ol className="final-ranking">{finalRanking(state.players, names, state.matchResult!).map((player) => <li key={player.playerId}><span>{player.rank}.º · {player.name}{player.tied ? " · empate" : ""}</span><strong>{player.score} puntos</strong></li>)}</ol><button className="primary" onClick={restart}>Nueva partida</button></>}
    </section>}
    {handoff && state.phase === "ROUND_ACTIVE" && <section className="handoff" role="dialog" aria-modal="true" aria-label="Relevo de jugador">
      <div><p className="eyebrow">Relevo privado</p><h2>Entrega el dispositivo a {playerName(activeId!, mode)}</h2><p>La mano anterior está oculta. Solo la siguiente persona debe continuar.</p><button autoFocus className="primary" onClick={() => setHandoff(false)}>Soy {playerName(activeId!, mode)} · mostrar mi mano</button></div>
    </section>}
    <footer>4 jugadores · doble seis · sin pozo · turnos antihorarios</footer>
  </main>;
}
