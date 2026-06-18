import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export const GENERIC_INTERNAL_ERROR = "حدث خطأ داخلي. حاول لاحقاً أو تواصل مع الدعم";

/** رسالة آمنة للعميل — تفاصيل الأخطاء الداخلية تُخفى في الإنتاج */
export function sanitizeClientError(err: unknown, fallback = GENERIC_INTERNAL_ERROR): string {
  if (err instanceof TRPCError) return err.message;
  if (!ENV.isProduction && err instanceof Error && err.message) return err.message;
  return fallback;
}

export function logServerError(context: string, err: unknown) {
  console.error(`[${context}]`, err);
}
