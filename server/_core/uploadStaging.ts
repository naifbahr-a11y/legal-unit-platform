import { TRPCError } from "@trpc/server";

const TTL_MS = 30 * 60 * 1000;
const pending = new Map<string, { userId: number; expiresAt: number }>();

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(key);
  }
}

/** تسجيل ملف رُفع عبر /api/upload لربطه لاحقاً بمرفق أو مراسلة */
export function registerPendingUpload(userId: number, key: string) {
  cleanupExpired();
  pending.set(key, { userId, expiresAt: Date.now() + TTL_MS });
}

export function hasPendingUpload(userId: number, key: string): boolean {
  cleanupExpired();
  const entry = pending.get(key);
  return !!entry && entry.userId === userId && entry.expiresAt > Date.now();
}

function assertPendingUpload(userId: number, key: string) {
  cleanupExpired();
  const entry = pending.get(key);
  if (!entry || entry.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ملف غير مصرح به — ارفع الملف أولاً ثم أعد المحاولة",
    });
  }
  if (entry.expiresAt <= Date.now()) {
    pending.delete(key);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "انتهت صلاحية رفع الملف. أعد الرفع ثم حاول مجدداً",
    });
  }
}

export function consumePendingUpload(userId: number, key: string) {
  assertPendingUpload(userId, key);
  pending.delete(key);
}

/** تحقق من رفع المستخدم ثم استهلك المفتاح عند الربط بسجل */
export function assertAndConsumePendingUpload(userId: number, key: string | undefined | null) {
  const trimmed = key?.trim();
  if (!trimmed) return;
  consumePendingUpload(userId, trimmed);
}
