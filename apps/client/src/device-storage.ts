import { Capacitor } from "@capacitor/core";
import type { StorageLike } from "./session-storage.ts";

// Android conserva sesiones al cerrar la app; la web mantiene el aislamiento por pestaña.
export function deviceStorage(): Storage { return Capacitor.isNativePlatform() ? window.localStorage : window.sessionStorage; }

export function readJson<T>(storage: StorageLike, key: string): T | null {
  try { const value = storage.getItem(key); return value ? JSON.parse(value) as T : null; } catch { return null; }
}
export function writeJson(storage: StorageLike, key: string, value: unknown): void {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* El almacenamiento puede estar bloqueado; la sesión sigue en memoria. */ }
}
export function removeKey(storage: StorageLike, key: string): void {
  try { storage.removeItem(key); } catch { /* Sin almacenamiento no hay nada que borrar. */ }
}

const memory = new Map<string, string>();
const memoryStorage: StorageLike = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => void memory.set(key, value), removeItem: (key) => void memory.delete(key) };
// La identidad de prueba persiste entre visitas; el saldo vive siempre en el servidor y aquí solo se guarda el token.
export function persistentStorage(): StorageLike { try { window.localStorage.getItem(""); return window.localStorage; } catch { return memoryStorage; } }
