import { apiUrl, getAuthToken, usesExternalApi } from "./apiBase";

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (usesExternalApi()) {
    const token = getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return globalThis.fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: usesExternalApi() ? "omit" : "include",
  });
}
