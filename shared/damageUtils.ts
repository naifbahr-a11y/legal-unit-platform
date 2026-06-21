/** أي خلية في عمود الضرر تحتوي رقماً = ضرر مالي */
const NO_DAMAGE_PATTERN = /لا\s*يوجد|لايوجد/i;
const AMOUNT_DIGIT_PATTERN = /[0-9٠-٩]/;

/** للاستعلامات SQL (MySQL REGEXP) */
export const DAMAGE_HAS_AMOUNT_SQL_REGEX = "[0-9٠-٩]";

export function normalizeDamageDigits(value: string): string {
  const eastern = "٠١٢٣٤٥٦٧٨٩";
  return value.replace(/[٠-٩]/g, (d) => String(eastern.indexOf(d)));
}

/** هل حقل الضرر يحتوي مبلغاً مالياً؟ */
export function hasFinancialDamage(damage: string | null | undefined): boolean {
  if (!damage?.trim()) return false;
  return AMOUNT_DIGIT_PATTERN.test(damage.trim());
}

export type DamageStatus = "has_damage" | "no_damage" | "unspecified";

export function getDamageStatus(damage: string | null | undefined): DamageStatus {
  if (!damage?.trim()) return "unspecified";
  if (hasFinancialDamage(damage)) return "has_damage";
  if (NO_DAMAGE_PATTERN.test(damage)) return "no_damage";
  return "unspecified";
}

/** استخراج المبلغ الرقمي من نص الضرر */
export function parseDamageAmount(damage: string | null | undefined): number | null {
  if (!hasFinancialDamage(damage)) return null;
  const normalized = normalizeDamageDigits(String(damage))
    .replace(/[^\d.,]/g, "")
    .replace(/,/g, "");
  if (!normalized) return null;
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}
