import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface ConfirmRequest {
  readonly title: string; readonly message: string; readonly confirmLabel: string;
  // «Cancelar» por defecto; conviene otro texto cuando la acción confirmada también es cancelar algo.
  readonly cancelLabel?: string; readonly tone?: "primary" | "danger"; readonly onConfirm: () => void;
}
type Confirm = (request: ConfirmRequest) => void;
const ConfirmContext = createContext<Confirm | null>(null);

/** Sustituye a `window.confirm`: un único diálogo con el aspecto de la interfaz para toda la app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const cancel = useCallback(() => setRequest(null), []);
  return <ConfirmContext.Provider value={setRequest}>{children}
    {request && <ConfirmDialog request={request} onCancel={cancel} onConfirm={() => { setRequest(null); request.onConfirm(); }}/>}</ConfirmContext.Provider>;
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext); if (!confirm) throw new Error("useConfirm requiere ConfirmProvider"); return confirm;
}

function ConfirmDialog({ request, onCancel, onConfirm }: { request: ConfirmRequest; onCancel: () => void; onConfirm: () => void }) {
  const titleId = useId(); const messageId = useId(); const dialogRef = useRef<HTMLElement>(null); const cancelRef = useRef<HTMLButtonElement>(null);
  // El foco empieza en la opción que no cambia nada, queda atrapado en el diálogo y vuelve al botón de origen al cerrar.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null; cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
      if (event.key !== "Tab") return; const buttons = [...(dialogRef.current?.querySelectorAll("button") ?? [])]; if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement); const next = event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length;
      event.preventDefault(); buttons[next]!.focus();
    };
    window.addEventListener("keydown", onKey); return () => { window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [onCancel]);
  return <div className="confirm-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section ref={dialogRef} className={`confirm-dialog ${request.tone === "danger" ? "danger-tone" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId}>
      <h2 id={titleId}>{request.title}</h2><p id={messageId}>{request.message}</p>
      <div className="confirm-actions"><button ref={cancelRef} type="button" className="secondary" onClick={onCancel}>{request.cancelLabel ?? "Cancelar"}</button>
        <button type="button" className={request.tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>{request.confirmLabel}</button></div>
    </section></div>;
}
