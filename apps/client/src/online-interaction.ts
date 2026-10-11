export function createCommandId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function commandErrorMessage(status: number, result: { readonly code?: string | undefined; readonly message?: string | undefined }): string {
  if (result.message) return result.code ? `${result.message} (${result.code})` : result.message;
  if (result.code) return `El servidor rechazó la acción (${result.code})`;
  return `El servidor rechazó la acción (HTTP ${status})`;
}
