import { useCallback, useEffect, useState } from "react";
import type { LeagueView } from "../../../packages/protocol/src/index.ts";
import { CompetitionApiError, leagueApi } from "./competition-api.ts";
import { competitionErrorMessage } from "./competition-presentation.ts";
import { daysLeftText, formatLeaguePoints, RANK_NAMES, rankProgress } from "./league-presentation.ts";
import type { TestAccount } from "./use-test-account.ts";
import { RankTile, StateCard } from "./ui.tsx";

type Load = { readonly status: "LOADING" } | { readonly status: "READY"; readonly view: LeagueView } | { readonly status: "UNAVAILABLE" | "ERROR"; readonly message: string };

export function LeagueApp({ account, onQuickPlay, onAccount }: { account: TestAccount; onQuickPlay: () => void; onAccount: () => void }) {
  const token = account.identity?.identityToken ?? null; const [load, setLoad] = useState<Load>({ status: "LOADING" });
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoad((current) => current.status === "READY" ? current : { status: "LOADING" });
    try { setLoad({ status: "READY", view: await leagueApi.view(token, signal) }); }
    catch (error) { if ((error as Error).name === "AbortError") return; const code = error instanceof CompetitionApiError ? error.code : "NETWORK"; setLoad({ status: code === "NOT_AVAILABLE" ? "UNAVAILABLE" : "ERROR", message: competitionErrorMessage(code) }); }
  }, [token]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);

  const header = <header className="view-header"><p className="chip">Liga · Jugar ahora</p><h1>Liga</h1></header>;
  if (load.status === "LOADING") return <main className="view league-view">{header}<div className="skeleton-block" role="status" aria-busy="true"><span className="skeleton wide"/><span className="skeleton wide"/><span className="skeleton"/><span className="sr-only">Cargando la liga…</span></div></main>;
  if (load.status !== "READY") return <main className="view league-view">{header}<StateCard tone={load.status === "UNAVAILABLE" ? "warning" : "error"} title={load.status === "UNAVAILABLE" ? "Liga no disponible" : "No se pudo cargar la liga"}
    action={<button className="secondary" onClick={() => void refresh()}>Reintentar</button>}>{load.message}</StateCard></main>;

  const { view } = load; const viewer = view.viewer; const viewerInTop = view.top.some((row) => row.viewer);
  const next = viewer?.nextRank ?? null;
  return <main className="view league-view">{header}
    <p className="muted league-season">Temporada de {view.season.label} · {daysLeftText(view.daysLeft)} · cierre a medianoche de Bogotá</p>
    {viewer ? <section className="panel rank-card" aria-label="Tu rango">
      <RankTile rank={viewer.rank} size="large"/>
      <div className="rank-summary"><span className="muted">Tu rango</span><h2>{RANK_NAMES[viewer.rank]}</h2><strong className="league-points">{formatLeaguePoints(viewer.points)}</strong>
        <span className="muted">{viewer.position ? `Posición ${viewer.position} de ${view.totalPlayers}` : "Aún sin partidas puntuadas esta temporada"} · {viewer.matches} {viewer.matches === 1 ? "partida" : "partidas"}</span>
        {next ? <><progress max={1} value={rankProgress(viewer.points, viewer.rank, view.ranks)} aria-label={`Progreso hacia ${RANK_NAMES[next]}`}/><span className="muted">{viewer.pointsToNext} para {RANK_NAMES[next]}</span></> : <span className="muted">Rango máximo de la temporada</span>}
      </div>
      <button className="primary" onClick={onQuickPlay}>Jugar ahora <span aria-hidden="true">›</span></button></section>
      : <StateCard title="Crea tu cuenta de prueba para aparecer en la liga" action={<button className="primary" onClick={onAccount}>Ir a Cuenta</button>}>La liga se alimenta solo de las partidas de «Jugar ahora».</StateCard>}

    <section className="panel" aria-labelledby="ranking-title"><h2 id="ranking-title">Clasificación</h2>
      {view.top.length === 0 ? <p className="muted">Aún no hay puntos esta temporada. Las primeras partidas de «Jugar ahora» abrirán la clasificación.</p> :
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Clasificación de la temporada"><table className="leaderboard"><thead><tr><th scope="col">Pos.</th><th scope="col">Jugador</th><th scope="col">Rango</th><th scope="col" className="num">Puntos</th></tr></thead>
          <tbody>{view.top.map((row, index) => <tr key={`${row.position}-${row.alias}-${index}`} className={row.viewer ? "viewer" : ""}><td>{row.position}</td><td>{row.alias}{row.viewer ? " (tú)" : ""}</td><td><span className="rank-cell"><RankTile rank={row.rank} decorative/>{RANK_NAMES[row.rank]}</span></td><td className="num">{row.points}</td></tr>)}
            {viewer?.position && !viewerInTop && <><tr className="gap" aria-hidden="true"><td colSpan={4}>…</td></tr><tr className="viewer"><td>{viewer.position}</td><td>{viewer.alias} (tú)</td><td><span className="rank-cell"><RankTile rank={viewer.rank} decorative/>{RANK_NAMES[viewer.rank]}</span></td><td className="num">{viewer.points}</td></tr></>}</tbody></table></div>}
      <p className="muted small">Se muestran los 50 primeros de {view.totalPlayers}. Solo alias, rango y puntos; los bots no aparecen.</p></section>

    <section className="panel"><h2>Rangos de la temporada</h2><ol className="rank-ladder">{view.ranks.map((rank) => <li key={rank.id} className={viewer?.rank === rank.id ? "current" : ""}><RankTile rank={rank.id} decorative/><span>{rank.name}</span><small>{rank.minPoints} pts</small></li>)}</ol></section>
    <section className="panel league-rules"><h2>Cómo se puntúa</h2><ul>
      <li>Solo puntúan las partidas terminadas de «Jugar ahora». Las salas privadas y la Competición de prueba no dan puntos.</li>
      <li>Por posición final: {view.positionPoints.map((points, index) => `${index + 1}.º ${points}`).join(" · ")}. Los empates comparten la mejor posición.</li>
      <li>En parejas los compañeros comparten marcador: cada ganador queda 1.º y cada perdedor 3.º.</li>
      <li>Se multiplica por los humanos en la mesa entre 4, redondeando hacia abajo. Terminar en modo automático da 0.</li>
      <li>Cada mes empieza una temporada nueva con 0 puntos; el rango y la posición finales quedan en tu historial.</li>
      <li>Los puntos de liga no son COP simulados, no tienen valor y no se canjean.</li></ul></section>
  </main>;
}
