const AUTH_TOKEN_KEY = "legal_unit_auth_token";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

/** Remote API origin when set (e.g. https://legal-unit.example.com). Empty = same origin as the page. */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return normalizeBaseUrl(configured);
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/** True when the UI and API are on different origins (Capacitor APK, bundled Electron). */
export function usesExternalApi(): boolean {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured || typeof window === "undefined") return false;
  try {
    return new URL(configured).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function getTrpcUrl(): string {
  return `${getApiBaseUrl()}/api/trpc`;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
