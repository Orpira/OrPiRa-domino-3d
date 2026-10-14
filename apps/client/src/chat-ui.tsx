import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_EMOJIS, CHAT_PHRASES, type ChatContent, type ChatMessage, type ChatView } from "../../../packages/protocol/src/chat.ts";
import { apiUrl } from "./api.ts";

export interface ChatConnection { readonly path: string; readonly token: string }
const ERRORS: Readonly<Record<string, string>> = {
  CHAT_QUICK_ONLY: "Durante una mano solo puedes usar frases rápidas y emojis.",
  CHAT_PHRASES_ONLY: "En Competición solo se permiten frases rápidas.",
  CHAT_RATE_LIMITED: "Espera 2 segundos entre mensajes. Máximo 10 mensajes por minuto entre todos los chats.",
  CHAT_FINISHED_MATCH_REQUIRED: "Termina al menos una partida para escribir en el vestíbulo.",
  CHAT_INVALID_CONTENT: "Elige una opción válida o escribe entre 1 y 200 caracteres.",
  CHAT_MESSAGE_NOT_FOUND: "El mensaje ya no está disponible.",
  CHAT_TABLE_CLOSED: "El chat de esta mesa se ha cerrado.",
  UNAUTHENTICATED: "La sesión del chat no es válida. Vuelve a entrar.",
  NOT_A_PARTICIPANT: "No perteneces a esta mesa.",
  STORAGE_ERROR: "No se pudo guardar la operación. Inténtalo de nuevo.",
};
/** Cada cuánto se consulta el chat: la mesa cada 2 s (las burbujas duran 3 s); el vestíbulo, según esté abierto o no. */
export const TABLE_CHAT_POLL_MS = 2_000; export const HALL_OPEN_POLL_MS = 3_000; export const HALL_CLOSED_POLL_MS = 20_000;
export function useChat(connection: ChatConnection | undefined, pollMs = TABLE_CHAT_POLL_MS) {
  const path = connection?.path; const token = connection?.token;
  const [view, setView] = useState<ChatView | null>(null); const [error, setError] = useState(""); const [networkError, setNetworkError] = useState("");
  const [busy, setBusy] = useState(false); const lock = useRef(false); const sequence = useRef(0); const offset = useRef(0);
  const fetchView = useCallback(async (signal?: AbortSignal) => {
    if (!path || !token) return;
    const request = ++sequence.current;
    try {
      const response = await fetch(apiUrl(path), { headers: { authorization: `Bearer ${token}` }, ...(signal ? { signal } : {}) });
      if (!response.ok) { const failure = await response.json() as { code?: string }; throw new Error(ERRORS[failure.code ?? ""] ?? "No se pudo consultar el chat."); }
      const next = await response.json() as ChatView;
      if (request === sequence.current && !signal?.aborted) { offset.current = next.serverNow - Date.now(); setView(next); setNetworkError(""); }
    } catch (failure) { if (request === sequence.current && !signal?.aborted) setNetworkError(failure instanceof Error && failure.message !== "Failed to fetch" ? failure.message : "Chat sin conexión. Reintentando…"); }
  }, [path, token]);
  useEffect(() => {
    setView(null); setError(""); setNetworkError(""); if (!path || !token) return;
    const controller = new AbortController(); void fetchView(controller.signal);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void fetchView(controller.signal); }, pollMs);
    return () => { controller.abort(); window.clearInterval(timer); ++sequence.current; };
  }, [fetchView, path, token, pollMs]);
  // Nombres de quienes han escrito, para mostrar a los silenciados por su nombre y no por su identificador.
  const names = useRef(new Map<string, string>());
  for (const message of view?.messages ?? []) names.current.set(message.authorId, message.authorName);
  const operation = useCallback(async (action: "" | "/mute" | "/report", payload: unknown): Promise<boolean> => {
    if (!path || !token || lock.current) return false;
    lock.current = true; setBusy(true); setError(""); ++sequence.current;
    try {
      const response = await fetch(apiUrl(`${path}${action}`), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { const failure = await response.json() as { code?: string }; throw new Error(ERRORS[failure.code ?? ""] ?? `No se pudo completar la operación (${response.status}).`); }
      await fetchView(); if (action === "/report") setError("Mensaje reportado."); return true;
    } catch (failure) { setError(failure instanceof Error && failure.message !== "Failed to fetch" ? failure.message : "No se pudo enviar. No se reintenta automáticamente para evitar duplicados."); return false; }
    finally { lock.current = false; setBusy(false); }
  }, [fetchView, path, token]);
  return { view, busy, error: error || networkError, offset, nameOf: (id: string) => names.current.get(id) ?? "Jugador silenciado",
    send: (content: ChatContent) => operation("", content),
    mute: (authorId: string, muted = true) => operation("/mute", { authorId, muted }),
    report: (messageId: string) => operation("/report", { messageId }) };
}
type ChatState = ReturnType<typeof useChat>;
export function QuickChat({ chat }: { readonly chat: ChatState }) {
  const view = chat.view;
  return <details className="quick-chat"><summary>Frases rápidas</summary><div className="quick-chat-options">
    {Object.entries(CHAT_PHRASES).map(([id, label]) => <button type="button" className="secondary" key={id} disabled={!view?.canSend || chat.busy} onClick={() => void chat.send({ kind: "PHRASE", id: id as keyof typeof CHAT_PHRASES })}>{label}</button>)}
    {view?.policy !== "PHRASES" && Object.entries(CHAT_EMOJIS).map(([id, label]) => <button type="button" className="secondary" key={id} aria-label={`Emoji ${id}`} disabled={!view?.canSend || chat.busy} onClick={() => void chat.send({ kind: "EMOJI", id: id as keyof typeof CHAT_EMOJIS })}>{label}</button>)}
  </div></details>;
}
function Message({ message, chat }: { readonly message: ChatMessage; readonly chat: ChatState }) {
  return <li className="chat-message"><div><strong>{message.authorName}</strong> <time dateTime={new Date(message.at).toISOString()}>{new Date(message.at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</time></div>
    <p>{message.text}</p>{message.authorId !== chat.view?.viewerId && <details><summary aria-label={`Opciones del mensaje de ${message.authorName}`}>Opciones</summary>
      <button type="button" className="ghost small" disabled={chat.busy} onClick={() => void chat.mute(message.authorId)}>Silenciar</button>
      <button type="button" className="ghost small" disabled={chat.busy} onClick={() => void chat.report(message.messageId)}>Reportar</button>
    </details>}</li>;
}
export function ChatPanel({ chat, title, quick = true }: { readonly chat: ChatState; readonly title: string; readonly quick?: boolean }) {
  const [text, setText] = useState(""); const view = chat.view; const list = useRef<HTMLUListElement>(null);
  const last = view?.messages.at(-1)?.messageId;
  useEffect(() => { const element = list.current; if (element) element.scrollTop = element.scrollHeight; }, [last]);
  const canText = view?.canSend && view.policy === "TEXT";
  return <section className="chat-panel" aria-label={title}><h2>{title}</h2>
    <ul className="chat-messages" ref={list} aria-live="polite" aria-relevant="additions">{view?.messages.map((message) => <Message key={message.messageId} message={message} chat={chat}/>)}</ul>
    {view && view.messages.length === 0 && <p className="muted">Sin mensajes.</p>}
    {view && !view.canSend ? null : <>{quick && <QuickChat chat={chat}/>}
    <form onSubmit={(event) => { event.preventDefault(); if (canText && text.trim()) void chat.send({ kind: "TEXT", text }).then((sent) => { if (sent) setText(""); }); }}>
      <label>Mensaje<input value={text} maxLength={200} disabled={!canText || chat.busy} onChange={(event) => setText(event.target.value)} placeholder={canText ? "Hasta 200 caracteres" : "Texto libre no disponible"}/></label>
      <button className="secondary" disabled={!canText || chat.busy || !text.trim()}>Enviar</button>
    </form></>}
    {view && !view.canSend ? <p className="muted">Termina al menos una partida para escribir en el vestíbulo.</p> : view && view.policy !== "TEXT" && <p className="muted">{view.policy === "PHRASES" ? "Competición: solo frases rápidas, siempre." : "Mano en curso: solo frases rápidas y emojis."}</p>}
    {chat.error && <p className="field-error" role="status">{chat.error}</p>}
    {!!view?.mutedIdentityIds.length && <details><summary>Silenciados ({view.mutedIdentityIds.length})</summary>{view.mutedIdentityIds.map((id) => <button type="button" key={id} disabled={chat.busy} onClick={() => void chat.mute(id, false)}>Dejar de silenciar a {chat.nameOf(id)}</button>)}</details>}
  </section>;
}
export function ChatAvatars({ chat, names }: { readonly chat: ChatState; readonly names: Readonly<Record<string, string>> }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, []);
  return <div className="chat-avatars" aria-label="Jugadores y frases rápidas">{Object.entries(names).map(([playerId, name]) => {
    const message = chat.view?.messages.findLast((entry) => entry.playerId === playerId && entry.content.kind !== "TEXT" && now + chat.offset.current - entry.at < 3_000);
    return <div className="chat-avatar-seat" key={playerId}><span className="chat-avatar" aria-hidden="true">{name.slice(0, 1)}</span><small>{name}</small>
      {message && <span className="chat-bubble" role="status"><strong>{message.authorName}</strong> · <time>{new Date(message.at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</time><br/>{message.text}</span>}
    </div>;
  })}</div>;
}
/** Vestíbulo: panel lateral en escritorio; en móvil, botón flotante con no leídos y hoja deslizable. `hidden` en las vistas de partida. */
export function LobbyChat({ token, hidden = false }: { readonly token: string | null; readonly hidden?: boolean }) {
  const [open, setOpen] = useState(false); const [unread, setUnread] = useState(0);
  const chat = useChat(token ? { path: "/api/chat/lobby", token } : undefined, open ? HALL_OPEN_POLL_MS : HALL_CLOSED_POLL_MS);
  const previous = useRef<Set<string> | null>(null); const touch = useRef<number | null>(null);
  useEffect(() => { previous.current = null; setUnread(0); }, [token]);
  useEffect(() => {
    if (!chat.view) return;
    const next = new Set(chat.view.messages.map((message) => message.messageId));
    const added = previous.current ? chat.view.messages.filter((message) => !previous.current!.has(message.messageId) && message.authorId !== chat.view!.viewerId).length : 0;
    previous.current = next; setUnread((count) => open ? 0 : count + added);
  }, [chat.view, open]);
  if (!token || hidden) return null;
  return <aside className={`lobby-chat ${open ? "open" : ""}`} onTouchStart={(event) => { touch.current = event.touches[0]?.clientY ?? null; }}
    onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientY; if (touch.current !== null && end !== undefined && Math.abs(end - touch.current) > 60) setOpen(end < touch.current); touch.current = null; }}>
    <button type="button" className="secondary lobby-chat-toggle" aria-expanded={open} aria-controls="lobby-chat-panel" onClick={() => setOpen((value) => !value)}>Chat del vestíbulo {unread > 0 && <span className="chat-unread" aria-label={`${unread} mensajes no leídos`}>{unread}</span>}<span aria-hidden="true">{open ? " ▾" : " ▴"}</span></button>
    <div id="lobby-chat-panel" hidden={!open}><ChatPanel chat={chat} title="Vestíbulo"/></div>
  </aside>;
}
