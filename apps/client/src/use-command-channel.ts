import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientCommand, CommandEnvelope } from "../../../packages/protocol/src/index.ts";
import { commandErrorMessage, createCommandId } from "./online-interaction.ts";
import { SubmissionGate } from "./placement-interaction.ts";
import { apiUrl } from "./api.ts";
import { removeKey } from "./device-storage.ts";
import type { StorageLike } from "./session-storage.ts";

interface ChannelOptions {
  readonly path: string | null; readonly token: string | null; readonly pendingKey: string; readonly storage: StorageLike;
  readonly revision: number | null; readonly connected: boolean; readonly refresh: () => Promise<void>; readonly onDisconnect: () => void;
}
function headers(token: string) { return { authorization: `Bearer ${token}`, "content-type": "application/json" }; }

// Un comando se guarda antes de enviarse y se reintenta con el mismo commandId tras reconectar.
export function useCommandChannel({ path, token, pendingKey, storage, revision, connected, refresh, onDisconnect }: ChannelOptions) {
  const [sending, setSending] = useState(false); const [message, setMessage] = useState("");
  const retrying = useRef(false); const gate = useRef(new SubmissionGate());
  useEffect(() => {
    if (!path || !token || revision === null || !connected || retrying.current) return;
    let raw: string | null = null; try { raw = storage.getItem(pendingKey); } catch { return; } if (!raw) return;
    retrying.current = true;
    void fetch(apiUrl(path), { method: "POST", headers: headers(token), body: raw })
      .then(async (response) => { const result = await response.json() as { ok: boolean; message?: string }; removeKey(storage, pendingKey); setMessage(result.ok ? "Comando pendiente confirmado" : result.message ?? "Comando pendiente rechazado"); await refresh(); })
      .catch(() => onDisconnect()).finally(() => { retrying.current = false; });
  }, [connected, onDisconnect, path, pendingKey, refresh, revision, storage, token]);

  const send = useCallback(async (command: ClientCommand) => {
    if (!path || !token || revision === null || !connected || !gate.current.tryLock()) return;
    setSending(true);
    try {
      const envelope: CommandEnvelope = { commandId: createCommandId(), expectedRevision: revision, command };
      storage.setItem(pendingKey, JSON.stringify(envelope));
      const request = () => fetch(apiUrl(path), { method: "POST", headers: headers(token), body: JSON.stringify(envelope) });
      let response = await request(); if (response.status >= 500) response = await request();
      const result = await response.json() as { ok?: boolean; code?: string; message?: string };
      setMessage(!response.ok || result.ok !== true ? commandErrorMessage(response.status, result) : "Acción confirmada");
      removeKey(storage, pendingKey); await refresh();
    } catch (error) { onDisconnect(); setMessage(`No se pudo enviar la acción: ${(error as Error).message || "conexión perdida"}. El comando queda guardado para reintento seguro.`); }
    finally { gate.current.release(); setSending(false); }
  }, [connected, onDisconnect, path, pendingKey, refresh, revision, storage, token]);

  return { send, sending, message, setMessage };
}
