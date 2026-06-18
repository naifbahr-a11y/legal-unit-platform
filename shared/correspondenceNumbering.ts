/** رمز مكتب المندوب — ثابت */
export const DEFAULT_MANDOB_OFFICE_CODE = "573";

/** صيغة العدد الرسمي للصادر: ق / رقم القانونية / 573 / رقم المكتب */
export function formatOfficialOutNumber(
  legalOutNumber: number,
  officeCode: string = DEFAULT_MANDOB_OFFICE_CODE,
  mandobOutNumber?: string | null,
): string {
  const mandob = mandobOutNumber?.trim();
  if (mandob) return `ق / ${legalOutNumber} / ${officeCode} / ${mandob}`;
  return `ق / ${legalOutNumber} / ${officeCode} /`;
}

/** الرقم التالي تلقائياً = الأكبر بين المعتمد وآخر مسجّل + 1 */
export function computeNextLegalOutNumber(lastApproved: number, maxRecorded: number): number {
  return Math.max(lastApproved, maxRecorded, 0) + 1;
}
