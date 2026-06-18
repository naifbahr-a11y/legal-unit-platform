import { hasFullAccess } from "./userRoles";

/** مفاتيح صلاحيات الوصول للأقسام */
export type SectionPermissionKey =
  | "cases"
  | "cases_viewAll"
  | "cases_reports"
  | "cases_archive"
  | "compensation"
  | "guarantees"
  | "investigation"
  | "bank_properties"
  | "mortgaged"
  | "forged_checks"
  | "general_files"
  | "correspondence"
  | "appointments"
  | "legal_reviews"
  | "quarterly_status";

export type SectionPermissionKeyWithReadonly = SectionPermissionKey | `${SectionPermissionKey}_readonly`;

export type PermissionUser = {
  role: string;
  permissions?: unknown;
};

export type PermissionItem = {
  key: SectionPermissionKey;
  label: string;
  readonlyKey?: SectionPermissionKeyWithReadonly;
  description?: string;
};

export type PermissionGroup = {
  id: string;
  label: string;
  items: PermissionItem[];
};

function withReadonly(key: SectionPermissionKey, label: string): PermissionItem {
  return {
    key,
    label,
    readonlyKey: `${key}_readonly` as SectionPermissionKeyWithReadonly,
  };
}

/** أقسام حصرية للمدير والإداري — لا تُعطى للموظف القانوني */
export const PRIVILEGED_ONLY_SECTIONS = new Set<SectionPermissionKey>([
  "investigation",
  "quarterly_status",
]);

export function isPrivilegedOnlySection(key: SectionPermissionKey): boolean {
  return PRIVILEGED_ONLY_SECTIONS.has(key);
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "main",
    label: "الأقسام الرئيسية",
    items: [
      withReadonly("cases", "سجل القضايا"),
      withReadonly("compensation", "قضايا التضمين"),
      withReadonly("guarantees", "الكفالات الشخصية"),
      withReadonly("bank_properties", "عقارات المصرف"),
      withReadonly("mortgaged", "العقارات المرهونة"),
      withReadonly("forged_checks", "الصكوك المزورة"),
      withReadonly("general_files", "الملفات العامة"),
    ],
  },
  {
    id: "workflow",
    label: "سير العمل",
    items: [
      withReadonly("correspondence", "المراسلات الرسمية"),
      withReadonly("appointments", "المواعيد والتذكيرات"),
      withReadonly("legal_reviews", "طلبات المراجعة"),
    ],
  },
  {
    id: "cases_extra",
    label: "صلاحيات إضافية — سجل القضايا",
    items: [
      { key: "cases_viewAll", label: "عرض كل القضايا (وليس قضاياه فقط)" },
      { key: "cases_reports", label: "تقارير سجل القضايا" },
      { key: "cases_archive", label: "أرشفة القضايا" },
    ],
  },
];

export const ALL_PERMISSION_KEYS: SectionPermissionKey[] = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.key),
);

export const ALL_READONLY_KEYS: SectionPermissionKeyWithReadonly[] = PERMISSION_GROUPS.flatMap((g) =>
  g.items.filter((i) => i.readonlyKey).map((i) => i.readonlyKey!),
);

/** مسار الصفحة → مفتاح الصلاحية (null = متاح لكل المسجّلين، privileged = مدير/إداري فقط) */
export type PathAccessKey = SectionPermissionKey | null | "privileged";

export const PATH_PERMISSION_MAP: Record<string, PathAccessKey> = {
  "/": null,
  "/cases": "cases",
  "/compensation": "compensation",
  "/guarantees": "guarantees",
  "/investigation": "investigation",
  "/bank-properties": "bank_properties",
  "/mortgaged-properties": "mortgaged",
  "/forged-checks": "forged_checks",
  "/general-files": "general_files",
  "/correspondence": "correspondence",
  "/appointments": "appointments",
  "/legal-reviews": "legal_reviews",
  "/quarterly-status": "quarterly_status",
  "/cases-map": "cases",
  "/change-password": null,
  "/pending": null,
  "/notifications": null,
  "/users": "privileged",
  "/audit-log": "privileged",
  "/manage-sections": "privileged",
  "/admin-cms": "privileged",
};

/** جدول قاعدة البيانات → مفتاح الصلاحية */
export const TABLE_PERMISSION_MAP: Record<string, SectionPermissionKey> = {
  compensation_cases: "compensation",
  personal_guarantees: "guarantees",
  investigation_cases: "investigation",
  bank_properties: "bank_properties",
  mortgaged_properties: "mortgaged",
  forged_checks: "forged_checks",
  general_files: "general_files",
};

export function getFlatPermissions(perms: unknown): Record<string, boolean> {
  if (!perms || typeof perms !== "object") return {};
  return perms as Record<string, boolean>;
}

/** الصلاحية مفعّلة إذا لم تُعطَّل صراحةً (الافتراضي: مسموح للموظف القانوني) */
export function isPermissionEnabled(perms: unknown, key: string): boolean {
  const flat = getFlatPermissions(perms);
  return flat[key] !== false;
}

export function isSectionReadonly(user: PermissionUser, key: SectionPermissionKey): boolean {
  if (hasFullAccess(user.role)) return false;
  return getFlatPermissions(user.permissions)[`${key}_readonly`] === true;
}

export function canAccessSection(user: PermissionUser, key: SectionPermissionKey): boolean {
  if (isPrivilegedOnlySection(key)) return hasFullAccess(user.role);
  if (hasFullAccess(user.role)) return true;
  return isPermissionEnabled(user.permissions, key);
}

export function canWriteSection(user: PermissionUser, key: SectionPermissionKey): boolean {
  if (!canAccessSection(user, key)) return false;
  if (hasFullAccess(user.role)) return true;
  return !isSectionReadonly(user, key);
}

export function canAccessPath(user: PermissionUser, path: string): boolean {
  if (hasFullAccess(user.role)) return true;
  const base = path.startsWith("/cases/") ? "/cases" : path.split("?")[0];
  if (base.startsWith("/custom/")) return true;
  const key = PATH_PERMISSION_MAP[base];
  if (key === "privileged") return false;
  if (key === null) return true;
  if (key === undefined) return false;
  return canAccessSection(user, key);
}

export function canAccessTable(user: PermissionUser, tableName: string): boolean {
  if (hasFullAccess(user.role)) return true;
  const key = TABLE_PERMISSION_MAP[tableName];
  if (!key) return true;
  return canAccessSection(user, key);
}

export function canWriteTable(user: PermissionUser, tableName: string): boolean {
  const key = TABLE_PERMISSION_MAP[tableName];
  if (!key) return hasFullAccess(user.role);
  return canWriteSection(user, key);
}

export function countEnabledPermissions(perms: unknown): number {
  return ALL_PERMISSION_KEYS.filter((k) => isPermissionEnabled(perms, k)).length;
}

export function buildDefaultPermissionsState(current: unknown): Record<string, boolean> {
  const flat = getFlatPermissions(current);
  const state: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    state[key] = flat[key] !== false;
  }
  for (const ro of ALL_READONLY_KEYS) {
    state[ro] = flat[ro] === true;
  }
  return state;
}

/** صلاحيات افتراضية للموظف القانوني الجديد — يخصصها المدير/الإداري لاحقاً */
export function defaultLegalEmployeePermissions(): Record<string, boolean> {
  const state = buildDefaultPermissionsState(null);
  state.cases_viewAll = false;
  state.cases_reports = false;
  state.cases_archive = false;
  return state;
}

export type CasesExtraPermissions = {
  viewAll?: boolean;
  reports?: boolean;
  archive?: boolean;
};

export function getCasesExtraPermissions(user: PermissionUser): CasesExtraPermissions {
  if (hasFullAccess(user.role)) return { viewAll: true, reports: true, archive: true };
  const flat = getFlatPermissions(user.permissions);
  const nested = user.permissions as { cases?: CasesExtraPermissions } | null | undefined;
  if (typeof nested?.cases === "object" && nested.cases !== null) {
    return {
      viewAll: nested.cases.viewAll === true,
      reports: nested.cases.reports === true,
      archive: nested.cases.archive === true,
    };
  }
  return {
    viewAll: flat.cases_viewAll === true,
    reports: flat.cases_reports === true,
    archive: flat.cases_archive === true,
  };
}

export function canViewAllCases(user: PermissionUser): boolean {
  return hasFullAccess(user.role) || !!getCasesExtraPermissions(user).viewAll;
}

export function canAccessCaseReports(user: PermissionUser): boolean {
  return hasFullAccess(user.role) || !!getCasesExtraPermissions(user).reports;
}

export function canArchiveCases(user: PermissionUser): boolean {
  return hasFullAccess(user.role) || !!getCasesExtraPermissions(user).archive;
}
