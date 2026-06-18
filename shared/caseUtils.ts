import { findBranchByField } from "./branchUtils";

/** حساب الأيام المتبقية من تاريخ الانتهاء */
export function computeRemainingDays(expiry: string | null | undefined): string {
  if (!expiry?.trim()) return "";
  const normalized = expiry.trim().replace(/\//g, "-");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "";
  const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return String(diff);
}

/** توحيد صيغة التاريخ إلى YYYY-MM-DD */
export function normalizeDateField(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return value.trim().replace(/\//g, "-");
}

/** أنماط مطابقة الفرع للفلترة */
export function getBranchMatchPatterns(branchFilter: string): string[] {
  const matched = findBranchByField(branchFilter);
  if (matched) {
    const patterns = new Set<string>([
      matched.name,
      `فرع ${matched.name}`,
      matched.branchNumber,
      ...(matched.aliases ?? []),
    ]);
    return [...patterns].filter(Boolean);
  }
  return [branchFilter];
}

/** تطبيع بيانات القضية قبل الحفظ */
export function normalizeCasePayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };

  for (const key of ["caseReceived", "lastFollowup", "expiry"] as const) {
    if (typeof out[key] === "string") {
      const n = normalizeDateField(out[key] as string);
      if (n !== undefined) out[key] = n;
    }
  }

  if (typeof out.branch === "string" && out.branch.trim()) {
    const branch = findBranchByField(out.branch);
    if (branch) {
      out.province = branch.governorate;
      if (!out.city) {
        out.city = branch.address.split("/").pop()?.trim() ?? null;
      }
    }
  }

  if (typeof out.expiry === "string" && out.expiry) {
    out.remainingDays = computeRemainingDays(out.expiry as string);
  }

  return out;
}

/** تهريب HTML للطباعة */
export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const CASE_PAGE_SIZE_DEFAULT = 50;
export const CASE_PAGE_SIZE_MAX = 200;
