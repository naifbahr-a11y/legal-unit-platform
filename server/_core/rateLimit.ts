type AttemptEntry = {
  count: number;
  resetAt: number;
};

const loginAttempts = new Map<string, AttemptEntry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function cleanupExpired(now: number) {
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(key);
  }
}

export function getClientIp(req: { ip?: string; headers?: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.ip || "unknown";
}

export function checkLoginRateLimit(ip: string, username: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  cleanupExpired(now);
  const key = `${ip}:${username.toLowerCase()}`;
  const entry = loginAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { allowed: true };
}

export function resetLoginRateLimit(ip: string, username: string) {
  loginAttempts.delete(`${ip}:${username.toLowerCase()}`);
}

export function recordFailedLogin(ip: string, username: string) {
  const now = Date.now();
  const key = `${ip}:${username.toLowerCase()}`;
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

// ─── عام لطلبات API ─────────────────────────────────────────────────────────
const apiAttempts = new Map<string, AttemptEntry>();
const API_MAX_REQUESTS = 300;
const API_WINDOW_MS = 15 * 60 * 1000;

function cleanupApiExpired(now: number) {
  for (const [key, entry] of apiAttempts) {
    if (now > entry.resetAt) apiAttempts.delete(key);
  }
}

export function checkApiRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  cleanupApiExpired(now);
  const key = `api:${ip}`;
  const entry = apiAttempts.get(key);
  if (!entry || now > entry.resetAt) return { allowed: true };
  if (entry.count >= API_MAX_REQUESTS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

export function recordApiRequest(ip: string) {
  const now = Date.now();
  const key = `api:${ip}`;
  const entry = apiAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    apiAttempts.set(key, { count: 1, resetAt: now + API_WINDOW_MS });
    return;
  }
  entry.count += 1;
}
