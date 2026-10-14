import { Fragment, useId, useState, type ReactNode } from "react";
import { TARGET_OPTIONS } from "../../../packages/rules/src/index.ts";
import { effectiveTarget, normalizeChoice, RULES_LABELS, type TableChoice } from "./modes-presentation.ts";
import type { LeagueRankId, TestAccountView } from "../../../packages/protocol/src/index.ts";
import { RANK_NAMES, rankPips } from "./league-presentation.ts";
import { formatCop, SIMULATED_NOTICE } from "./competition-presentation.ts";
import type { Loadable, TestAccount } from "./use-test-account.ts";
import { PIPS } from "./DominoFace.tsx";

export function SimulatedNotice({ compact = false }: { compact?: boolean }) {
  return <p className={`simulated-notice ${compact ? "compact" : ""}`}><span aria-hidden="true">◆</span>{SIMULATED_NOTICE}</p>;
}

export function StateCard({ tone = "neutral", title, children, action }: { tone?: "neutral" | "error" | "warning" | "success"; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className={`state-card ${tone}`} role={tone === "error" ? "alert" : "status"}><strong>{title}</strong>{children && <div>{children}</div>}{action}</div>;
}

function SvgTile({ x, y, rotate, top, bottom, fill }: { x: number; y: number; rotate: number; top: number; bottom: number; fill: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate} 30 56)`}>
    <rect x="3" y="7" width="60" height="112" rx="11" fill="#0a2a24" opacity=".45"/>
    <rect width="60" height="112" rx="11" fill={fill} stroke="#c9bf9f" strokeWidth="1.5"/>
    <line x1="9" y1="56" x2="51" y2="56" stroke="#a1946c" strokeWidth="2"/><circle cx="30" cy="56" r="3" fill="#d6ad3f"/>
    {PIPS[top]!.map(([px, py], index) => <circle key={`t${index}`} cx={6 + px * 48} cy={4 + py * 48} r="4.6" fill="#16221f"/>)}
    {PIPS[bottom]!.map(([px, py], index) => <circle key={`b${index}`} cx={6 + px * 48} cy={60 + py * 48} r="4.6" fill="#16221f"/>)}
  </g>;
}

// Ilustración vectorial en línea: no depende de red ni de fotografías y no puede fallar al cargar.
export function DominoArt({ variant = "pair" }: { variant?: "pair" | "trio" }) {
  const id = useId().replace(/:/g, "");
  return <svg className="domino-art" viewBox="0 0 220 150" aria-hidden="true" focusable="false">
    <defs><linearGradient id={`ivory${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fffaf0"/><stop offset="1" stopColor="#e7dcc0"/></linearGradient>
      <radialGradient id={`glow${id}`}><stop offset="0" stopColor="#f2cf6b" stopOpacity=".35"/><stop offset="1" stopColor="#f2cf6b" stopOpacity="0"/></radialGradient></defs>
    <ellipse cx="120" cy="80" rx="100" ry="62" fill={`url(#glow${id})`}/>
    {variant === "trio" && <SvgTile x={18} y={26} rotate={-62} top={5} bottom={3} fill={`url(#ivory${id})`}/>}
    <SvgTile x={variant === "trio" ? 86 : 60} y={18} rotate={-18} top={6} bottom={6} fill={`url(#ivory${id})`}/>
    <SvgTile x={variant === "trio" ? 140 : 122} y={22} rotate={14} top={6} bottom={4} fill={`url(#ivory${id})`}/>
    <text x={variant === "trio" ? 4 : 14} y={variant === "trio" ? 40 : 52} fontFamily="Georgia, serif" fontSize="44" fontWeight="700" fill="#e8bf55" opacity=".9">π</text>
  </svg>;
}

export function BalanceSummary({ account, compact = false }: { account: Loadable<TestAccountView>; compact?: boolean }) {
  if (account.status === "LOADING" && !account.data) return <div className="balance-card loading" role="status" aria-busy="true"><span className="skeleton wide"/><span className="skeleton"/><p className="sr-only">Cargando saldo simulado…</p></div>;
  if (!account.data) return <StateCard tone={account.status === "UNAVAILABLE" ? "warning" : "error"} title={account.status === "UNAVAILABLE" ? "Saldo no disponible" : "No se pudo cargar el saldo"}>{account.error}</StateCard>;
  return <section className={`balance-card ${compact ? "compact" : ""}`} aria-label="Saldo simulado">
    <div className="balance-figures"><div><span>Saldo disponible</span><strong>{formatCop(account.data.available)}</strong></div><div><span>Reservado en salas</span><strong className="reserved">{formatCop(account.data.reserved)}</strong></div></div>
    <SimulatedNotice/>{!compact && <DominoArt/>}{account.error && <p className="inline-warning" role="status">{account.error} Mostrando el último saldo confirmado.</p>}
  </section>;
}

export function IdentityForm({ account, intro }: { account: TestAccount; intro?: string }) {
  const [name, setName] = useState(""); const inputId = useId();
  return <form className="identity-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void account.create(name); }}>
    <p>{intro ?? "Crea una cuenta de prueba en el servidor para recibir el crédito inicial simulado."}</p>
    <label htmlFor={inputId}>Nombre visible</label>
    <div className="inline-field"><input id={inputId} maxLength={24} autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)}/><button className="primary" disabled={!name.trim() || account.creating}>{account.creating ? "Creando…" : "Crear cuenta de prueba"}</button></div>
    {account.createError && <p className="field-error" role="alert">{account.createError}</p>}
  </form>;
}

export function AmountRow({ label, value, strong = false, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return <div className={`amount-row ${strong ? "strong" : ""}`}><dt>{label}{hint && <small>{hint}</small>}</dt><dd>{value}</dd></div>;
}

/** Ficha doble del rango de liga: la doble blanca no tiene puntos; la doble seis lleva seis por mitad. */
export function RankTile({ rank, size = "small", decorative = false }: { rank: LeagueRankId; size?: "small" | "medium" | "large"; decorative?: boolean }) {
  const pips = rankPips(rank); const id = useId().replace(/:/g, "");
  return <svg className={`rank-tile ${size}`} viewBox="0 0 64 116" {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `Rango ${RANK_NAMES[rank]}` })} focusable="false">
    <defs><linearGradient id={`rank${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fffaf0"/><stop offset="1" stopColor="#e3d6b4"/></linearGradient></defs>
    <rect x="2" y="2" width="60" height="112" rx="11" fill={`url(#rank${id})`} stroke={pips >= 4 ? "#d6ad3f" : "#bdb08b"} strokeWidth={pips >= 4 ? 4 : 2}/>
    <line x1="11" y1="58" x2="53" y2="58" stroke="#a1946c" strokeWidth="2.5"/><circle cx="32" cy="58" r="3.4" fill="#d6ad3f"/>
    {PIPS[pips]!.map(([px, py], index) => <circle key={`t${index}`} cx={8 + px * 48} cy={6 + py * 48} r="5" fill="#16221f"/>)}
    {PIPS[pips]!.map(([px, py], index) => <circle key={`b${index}`} cx={8 + px * 48} cy={62 + py * 48} r="5" fill="#16221f"/>)}
  </svg>;
}

/** Reglas, formato y objetivo de una mesa. Las parejas solo existen en Latino; el servidor valida lo elegido. */
export function TableSetup({ choice, onChange, label, showTarget = true }: { choice: TableChoice; onChange: (choice: TableChoice) => void; label: string; showTarget?: boolean }) {
  const set = (next: Partial<TableChoice>) => onChange(normalizeChoice({ ...choice, ...next, ...(next.mode && next.mode !== choice.mode ? { targetScore: undefined } : {}) } as TableChoice));
  const target = effectiveTarget(choice);
  const option = (current: boolean, text: string, onClick: () => void) => <button type="button" className={current ? "current" : ""} aria-pressed={current} onClick={onClick}>{text}</button>;
  return <fieldset className="table-setup"><legend>{label}</legend>
    <div className="setup-row"><span>Reglas</span><div className="mode-switch">{(["LATINO", "DRAW", "ALL_FIVES"] as const).map((rules) => <Fragment key={rules}>{option(choice.rules === rules, RULES_LABELS[rules], () => set({ rules }))}</Fragment>)}</div></div>
    {choice.rules === "LATINO" && <div className="setup-row"><span>Formato</span><div className="mode-switch">{option(choice.mode === "INDIVIDUAL", "Individual", () => set({ mode: "INDIVIDUAL" }))}{option(choice.mode === "PAIRS", "Parejas", () => set({ mode: "PAIRS" }))}</div></div>}
    {showTarget && <div className="setup-row"><span>Objetivo</span><div className="mode-switch">{TARGET_OPTIONS.map((value) => <Fragment key={value}>{option(target === value, String(value), () => set({ targetScore: value }))}</Fragment>)}</div></div>}
  </fieldset>;
}
