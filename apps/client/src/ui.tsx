import { useId, useState, type ReactNode } from "react";
import type { TestAccountView } from "../../../packages/protocol/src/index.ts";
import { formatCop, SIMULATED_NOTICE } from "./competition-presentation.ts";
import type { Loadable, TestAccount } from "./use-test-account.ts";

export function SimulatedNotice({ compact = false }: { compact?: boolean }) {
  return <p className={`simulated-notice ${compact ? "compact" : ""}`}><span aria-hidden="true">◆</span>{SIMULATED_NOTICE}</p>;
}

export function StateCard({ tone = "neutral", title, children, action }: { tone?: "neutral" | "error" | "warning" | "success"; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className={`state-card ${tone}`} role={tone === "error" ? "alert" : "status"}><strong>{title}</strong>{children && <div>{children}</div>}{action}</div>;
}

const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  0: [], 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
  5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.28, .22], [.72, .22], [.28, .5], [.72, .5], [.28, .78], [.72, .78]],
};
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
