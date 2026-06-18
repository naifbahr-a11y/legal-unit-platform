import type { RafidainBranch } from "./rafidainBranches";
import { RAFIDAIN_BRANCHES } from "./rafidainBranches";
import { PLATFORM_GOVERNORATE } from "./const";

/** توحيد النص العربي للمطابقة */
export function normalizeBranchKey(value: string): string {
  return value
    .trim()
    .replace(/^فرع\s+/i, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** هل قيمة حقل الفرع في القضية تطابق فرعاً في الكتالوج؟ */
export function matchBranchField(raw: string | null | undefined, branch: RafidainBranch): boolean {
  if (!raw?.trim()) return false;
  const n = normalizeBranchKey(raw);
  const candidates = [
    branch.name,
    `فرع ${branch.name}`,
    branch.branchNumber,
    branch.address.split("/").pop()?.trim() ?? "",
    ...(branch.aliases ?? []),
  ].map(normalizeBranchKey).filter(Boolean);

  return candidates.some((c) => c === n || n.includes(c) || c.includes(n));
}

/** إيجاد الفرع المناسب من نص مخزّن في قاعدة البيانات */
export function findBranchByField(raw: string | null | undefined): RafidainBranch | undefined {
  if (!raw?.trim()) return undefined;
  return RAFIDAIN_BRANCHES.find((b) => matchBranchField(raw, b));
}

/** تجميع إحصائيات القضايا حسب معرّف الفرع في الكتالوج */
export function aggregateBranchStatsById(raw: Record<string, number>): Record<number, number> {
  const result: Record<number, number> = {};
  for (const [field, count] of Object.entries(raw)) {
    const branch = findBranchByField(field);
    if (branch) {
      result[branch.id] = (result[branch.id] || 0) + count;
    }
  }
  return result;
}

export function getBranchCaseCount(branch: RafidainBranch, raw: Record<string, number>): number {
  let total = 0;
  for (const [key, count] of Object.entries(raw)) {
    if (matchBranchField(key, branch)) total += count;
  }
  return total;
}

export function getBranchDisplayLabel(branch: RafidainBranch): string {
  return `${branch.name} (${branch.branchNumber})`;
}

/** فروع المحافظة المفعّلة في هذا النشر */
export function getPlatformBranches(): RafidainBranch[] {
  return RAFIDAIN_BRANCHES.filter((b) => b.governorate === PLATFORM_GOVERNORATE);
}

/** قائمة فروع مرتبة حسب المحافظة ثم رقم الفرع */
export function getSortedBranchesByGovernorate(governorate: string): RafidainBranch[] {
  return RAFIDAIN_BRANCHES
    .filter((b) => b.governorate === governorate)
    .sort((a, b) => {
      const na = parseInt(a.branchNumber, 10);
      const nb = parseInt(b.branchNumber, 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return a.name.localeCompare(b.name, "ar");
    });
}

export function countBranchesByGovernorate(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of RAFIDAIN_BRANCHES) {
    counts[b.governorate] = (counts[b.governorate] || 0) + 1;
  }
  return counts;
}
