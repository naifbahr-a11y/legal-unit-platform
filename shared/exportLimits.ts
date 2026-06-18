/** الحد الأقصى لصفوف التصدير/الطباعة في طلب واحد */
export const EXPORT_ROW_LIMIT = 200;

export function exportLimitMessage(total: number, fetched: number): string | null {
  if (total > fetched) {
    return `تم جلب ${fetched} سجل من أصل ${total}. الحد الأقصى ${EXPORT_ROW_LIMIT} سجل — ضيّق الفلاتر لعرض المزيد.`;
  }
  return null;
}
