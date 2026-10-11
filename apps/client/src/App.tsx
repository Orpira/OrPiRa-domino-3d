import { useEffect, useRef, useState, type ReactNode } from "react";
import LocalApp from "./LocalApp.tsx";
import { OnlineApp } from "./OnlineApp.tsx";
import { TablesView } from "./CompetitionApp.tsx";
import { QuickPlayApp } from "./QuickPlayApp.tsx";
import { LeagueApp } from "./LeagueApp.tsx";
import { AccountView, HistoryView, HomeView } from "./AppViews.tsx";
import { useConditions, useTestAccount } from "./use-test-account.ts";

type View = "HOME" | "QUICK" | "PRACTICE" | "ONLINE" | "TABLES" | "LEAGUE" | "HISTORY" | "ACCOUNT";
type Tab = "HOME" | "TABLES" | "LEAGUE" | "HISTORY" | "ACCOUNT";
const VIEW_KEY = "orpira-domino-3d:view:v1";
const VIEWS: readonly View[] = ["HOME", "QUICK", "PRACTICE", "ONLINE", "TABLES", "LEAGUE", "HISTORY", "ACCOUNT"];
function initialView(): View { try { const saved = window.sessionStorage.getItem(VIEW_KEY) as View | null; return saved && VIEWS.includes(saved) ? saved : "HOME"; } catch { return "HOME"; } }
const tabOf = (view: View): Tab => view === "PRACTICE" || view === "ONLINE" || view === "QUICK" ? "HOME" : view;

const icon = (path: ReactNode) => <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
const TABS: ReadonlyArray<{ readonly tab: Tab; readonly label: string; readonly icon: ReactNode }> = [
  { tab: "HOME", label: "Inicio", icon: icon(<><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/></>) },
  { tab: "TABLES", label: "Mesas", icon: icon(<><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5"/><path d="M15 14.2c2.6-.4 4.8 1 5.5 4.3"/></>) },
  { tab: "LEAGUE", label: "Liga", icon: icon(<><path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M9 20h6"/></>) },
  { tab: "HISTORY", label: "Historial", icon: icon(<><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>) },
  { tab: "ACCOUNT", label: "Cuenta", icon: icon(<><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1-4 4-5.6 7.5-5.6s6.5 1.6 7.5 5.6"/></>) },
];

export default function App() {
  const [view, setView] = useState<View>(initialView);
  const account = useTestAccount(); const conditions = useConditions();
  const content = useRef<HTMLDivElement>(null); const firstRender = useRef(true);
  const go = (next: View) => { setView(next); try { window.sessionStorage.setItem(VIEW_KEY, next); } catch { /* Navegación sin persistencia. */ } };
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo({ top: 0 }); content.current?.focus({ preventScroll: true });
    if (view === "HISTORY" || view === "ACCOUNT" || view === "HOME") void account.refresh();
  }, [view]);
  const active = tabOf(view);
  return <div className="app-shell">
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <nav className="app-nav" aria-label="Navegación principal">
      <div className="nav-brand"><img src="/icons/icon-192.png" width="40" height="40" alt=""/><span>Domino3D-<b>OrPiRa</b></span></div>
      <ul>{TABS.map((item) => <li key={item.tab}><button className={active === item.tab ? "current" : ""} aria-current={active === item.tab ? "page" : undefined} onClick={() => go(item.tab)}>{item.icon}<span>{item.label}</span></button></li>)}</ul>
      <p className="nav-note">COP simulados · sin valor monetario</p>
    </nav>
    <div className="app-content" id="contenido" ref={content} tabIndex={-1}>
      {(view === "PRACTICE" || view === "ONLINE" || view === "QUICK") && <div className="subnav"><button className="ghost back" onClick={() => go("HOME")}>← Inicio</button><span>{view === "PRACTICE" ? "Práctica sin conexión" : view === "QUICK" ? "Jugar ahora · práctica gratuita" : "Partida online · sin saldo"}</span></div>}
      {view === "HOME" && <HomeView account={account} conditions={conditions} onQuickPlay={() => go("QUICK")} onPractice={() => go("PRACTICE")} onOnline={() => go("ONLINE")} onTables={() => go("TABLES")}/>}
      {view === "QUICK" && <QuickPlayApp account={account} onHome={() => go("HOME")}/>}
      {view === "PRACTICE" && <LocalApp/>}
      {view === "ONLINE" && <OnlineApp/>}
      {view === "TABLES" && <TablesView account={account} conditions={conditions} onOpenOnline={() => go("ONLINE")} onOpenPractice={() => go("PRACTICE")}/>}
      {view === "LEAGUE" && <LeagueApp account={account} onQuickPlay={() => go("QUICK")} onAccount={() => go("ACCOUNT")}/>}
      {view === "HISTORY" && <HistoryView account={account} onAccount={() => go("ACCOUNT")}/>}
      {view === "ACCOUNT" && <AccountView account={account}/>}
    </div>
  </div>;
}
