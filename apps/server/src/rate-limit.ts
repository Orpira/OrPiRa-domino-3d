import type { IncomingMessage } from "node:http";

export interface WindowLimit { readonly max: number; readonly windowMs: number }
export interface LimitDecision { readonly allowed: boolean; readonly retryAfterSeconds: number }

// Ventana fija en memoria por origen: suficiente para una única instancia; se reinicia con el proceso.
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly limit: WindowLimit; private readonly now: () => number;
  constructor(limit: WindowLimit, now: () => number = Date.now) { this.limit = limit; this.now = now; }

  check(key: string): LimitDecision {
    const window = this.current(key);
    return window.count < this.limit.max ? { allowed: true, retryAfterSeconds: 0 } : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.start + this.limit.windowMs - this.now()) / 1000)) };
  }
  record(key: string): void { this.current(key).count += 1; }
  take(key: string): LimitDecision { const decision = this.check(key); if (decision.allowed) this.record(key); return decision; }

  private current(key: string) {
    const now = this.now(); let window = this.windows.get(key);
    if (!window || now - window.start >= this.limit.windowMs) { this.prune(now); window = { start: now, count: 0 }; this.windows.set(key, window); }
    return window;
  }
  private prune(now: number) { if (this.windows.size < 10_000) return; for (const [key, window] of this.windows) if (now - window.start >= this.limit.windowMs) this.windows.delete(key); }
}

// Con un proxy de confianza delante (Nginx Proxy Manager), el último salto de X-Forwarded-For lo añade ese proxy.
export function requestSource(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"]; const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    const last = value?.split(",").map((entry) => entry.trim()).filter(Boolean).at(-1); if (last) return last;
    const real = request.headers["x-real-ip"]; if (typeof real === "string" && real.trim()) return real.trim();
  }
  return request.socket.remoteAddress ?? "desconocido";
}
