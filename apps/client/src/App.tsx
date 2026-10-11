import { useCallback, useEffect, useRef, useState } from "react";
import { TILE_BY_ID, type GameState, type Side, type TileId } from "../../../packages/rules/src/index.ts";
import { HUMAN_ID, LocalGame, PLAYER_NAMES } from "./local-game.ts";

function Tile({ id, selected = false, disabled = false, onClick }: { id: TileId; selected?: boolean; disabled?: boolean; onClick?: () => void }) {
  const tile = TILE_BY_ID.get(id)!;
  return <button type="button" className={`tile ${selected ? "selected" : ""}`} disabled={disabled} onClick={onClick} aria-label={`Ficha ${tile.a}-${tile.b}`}>
    <span>{tile.a}</span><i /><span>{tile.b}</span>
  </button>;
}

function ChainTile({ left, right }: { left: number; right: number }) {
  return <div className="chain-tile" aria-label={`${left}-${right}`}><span>{left}</span><i /><span>{right}</span></div>;
}

export default function App() {
  const gameRef = useRef<LocalGame | null>(null);
  if (!gameRef.current) gameRef.current = new LocalGame();
  const game = gameRef.current;
  const [state, setState] = useState<GameState>(game.state);
  const [selected, setSelected] = useState<TileId | null>(null);
  const [message, setMessage] = useState("Partida preparada");
  const humanActions = game.humanActions;
  const botsBusy = state.phase === "ROUND_ACTIVE" && state.currentPlayerId !== HUMAN_ID;

  const update = useCallback((next: GameState, text?: string) => {
    setState(next); setSelected(null); if (text) setMessage(text);
  }, []);

  useEffect(() => {
    if (state.phase !== "ROUND_ACTIVE" || state.currentPlayerId === HUMAN_ID) return;
    const timer = window.setTimeout(() => {
      const actor = game.state.currentPlayerId!;
      const next = game.playOneBotTurn();
      update(next, `${PLAYER_NAMES[actor]} ha jugado`);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [game, state, update]);

  const selectedActions = selected ? humanActions.filter((action) => action.type === "PLACE" && action.tileId === selected) : [];
  const canPass = humanActions.length === 1 && humanActions[0]?.type === "PASS";
  const roundResult = state.roundResult;
  const winnerName = roundResult?.winnerId ? PLAYER_NAMES[roundResult.winnerId] : null;

  const play = (side?: Side) => {
    if (!selected || botsBusy) return;
    try { update(game.placeHuman(selected, side), "Ficha colocada"); } catch (error) { setMessage((error as Error).message); }
  };
  const selectTile = (id: TileId) => {
    if (!game.isHumanTurn || botsBusy) return;
    const actions = humanActions.filter((action) => action.tileId === id);
    if (!actions.length) return;
    if (state.chain.length === 0) playOpening(id); else setSelected(id);
  };
  const playOpening = (id: TileId) => {
    try { update(game.placeHuman(id), "Has abierto con 6–6"); } catch (error) { setMessage((error as Error).message); }
  };

  return <main>
    <header className="hero">
      <div><p className="eyebrow">OrPiRa · partida local</p><h1>Dominó <em>Latino</em></h1></div>
      <div className="target"><span>Objetivo</span><strong>100</strong></div>
    </header>

    <section className="scoreboard" aria-label="Marcador">
      {state.players.map((player) => <div key={player.playerId} className={state.currentPlayerId === player.playerId ? "active-player" : ""}>
        <span>{PLAYER_NAMES[player.playerId]}</span><strong>{player.score}</strong><small>{state.hands[player.playerId]!.length} fichas</small>
      </div>)}
    </section>

    <section className="table" aria-label="Mesa de dominó">
      <div className="table-status">
        <span>Ronda {state.roundNumber}</span>
        <strong>{state.phase === "ROUND_ACTIVE" ? (game.isHumanTurn ? "Tu turno" : `Turno de ${PLAYER_NAMES[state.currentPlayerId!]}`) : "Ronda terminada"}</strong>
        <span>{state.leftEnd === null ? "Apertura pendiente" : `Extremos ${state.leftEnd} · ${state.rightEnd}`}</span>
      </div>
      <div className="chain" aria-label="Cadena">
        {state.chain.length ? state.chain.map((tile, index) => <ChainTile key={`${index}-${tile.id}`} left={tile.left} right={tile.right} />) : <p>El poseedor de 6–6 abre la ronda</p>}
      </div>
    </section>

    <p className="message" role="status">{botsBusy ? "El bot está pensando…" : message}</p>

    {state.phase === "ROUND_ACTIVE" && <section className="controls">
      <div className="side-actions">
        {selectedActions.some((a) => a.side === "LEFT") && <button onClick={() => play("LEFT")}>Jugar a la izquierda ({state.leftEnd})</button>}
        {selectedActions.some((a) => a.side === "RIGHT") && <button onClick={() => play("RIGHT")}>Jugar a la derecha ({state.rightEnd})</button>}
        <button className="pass" disabled={!canPass || botsBusy} onClick={() => update(game.passHuman(), "Has pasado")}>Pasar</button>
      </div>
      <h2>Tu mano</h2>
      <div className="hand">
        {state.hands[HUMAN_ID]!.map((id) => <Tile key={id} id={id} selected={selected === id} disabled={!humanActions.some((a) => a.tileId === id) || botsBusy} onClick={() => selectTile(id)} />)}
      </div>
      {selected && <button className="cancel" onClick={() => setSelected(null)}>Cancelar selección</button>}
    </section>}

    {state.phase !== "ROUND_ACTIVE" && roundResult && <section className="result" role="dialog" aria-label="Resultado de ronda">
      <p className="eyebrow">{roundResult.reason === "DOMINO" ? "Dominada" : "Cierre"}</p>
      <h2>{winnerName ? `${winnerName} gana la ronda` : "Empate en el mínimo"}</h2>
      <p>{roundResult.reason === "DOMINO" ? `${winnerName} suma 20 puntos.` : "El cierre no concede puntos."}</p>
      <div className="totals">{state.players.map((p) => <span key={p.playerId}>{PLAYER_NAMES[p.playerId]}: {roundResult.handPipTotals[p.playerId]}</span>)}</div>
      {state.phase === "ROUND_ENDED" ? <button className="primary" onClick={() => update(game.startNextRound(), "Nueva ronda: busca el 6–6")}>Siguiente ronda</button> : <>
        <p className="champion">Campeón: {PLAYER_NAMES[state.matchResult!.championId]}</p>
        <button className="primary" onClick={() => update(game.restart(), "Nueva partida preparada")}>Nueva partida</button>
      </>}
    </section>}

    <footer>4 jugadores · doble seis · sin pozo · turnos antihorarios</footer>
  </main>;
}
