const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";

export function apiUrl(path: string): string {
  if (!configuredBase) return path;
  return `${configuredBase}${path.startsWith("/") ? path : `/${path}`}`;
}
