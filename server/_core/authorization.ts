import { TRPCError } from "@trpc/server";
import type { SectionPermissionKey } from "@shared/userPermissions";
import {
  canAccessSection,
  canAccessTable,
  canWriteSection,
  canWriteTable,
  isPrivilegedOnlySection,
} from "@shared/userPermissions";
import { hasFullAccess, canManageUsers as roleCanManageUsers } from "@shared/userRoles";

export type AuthUser = {
  id: number;
  role: string;
  displayName: string | null;
  username: string;
  name?: string | null;
  active?: number | null;
};

export const ALLOWED_TABLE_NAMES = new Set([
  "compensation_cases",
  "personal_guarantees",
  "investigation_cases",
  "bank_properties",
  "mortgaged_properties",
  "general_files",
  "forged_checks",
]);

const BLOCKED_UPDATE_FIELDS = [
  "id",
  "createdAt",
  "updatedAt",
  "createdBy",
  "openId",
  "password",
  "role",
  "permissions",
  "active",
  "mustChangePassword",
  "tokenVersion",
] as const;

/** @deprecated استخدم hasFullAccess — المدير والإداري */
export function isAdmin(user: AuthUser): boolean {
  return user.role === "admin";
}

export function hasPrivilegedAccess(user: AuthUser): boolean {
  return hasFullAccess(user.role);
}

export function assertPrivileged(user: AuthUser, message = "غير مصرح — للمدير أو الإداري فقط") {
  if (!hasPrivilegedAccess(user)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

export function assertCanManageUsers(user: AuthUser, message = "غير مصرح بإدارة المستخدمين") {
  if (!roleCanManageUsers(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

export function employeeName(user: AuthUser): string {
  return user.displayName || user.name || user.username;
}

export function assertAdmin(user: AuthUser, message = "غير مصرح — للمدير فقط") {
  assertPrivileged(user, message);
}

export function ownsEmployeeRecord(user: AuthUser, recordEmployee?: string | null, recordCreatedBy?: number | null): boolean {
  if (hasPrivilegedAccess(user)) return true;
  if (recordCreatedBy != null && recordCreatedBy === user.id) return true;
  if (!recordEmployee) return false;
  return recordEmployee === employeeName(user);
}

export function assertOwnsEmployeeRecord(
  user: AuthUser,
  recordEmployee?: string | null,
  message = "لا يحق لك الوصول إلى هذا السجل",
  recordCreatedBy?: number | null,
) {
  if (!ownsEmployeeRecord(user, recordEmployee, recordCreatedBy)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

export function scopeEmployeeFilter<T extends { employee?: string; search?: string; userId?: number }>(
  user: AuthUser,
  filters: T = {} as T,
): T {
  if (hasPrivilegedAccess(user)) return filters;
  return { ...filters, employee: employeeName(user), userId: user.id };
}

export function sanitizeWritableData(
  data: Record<string, unknown>,
  extraBlocked: string[] = [],
): Record<string, unknown> {
  const blocked = new Set<string>([...extraBlocked, ...BLOCKED_UPDATE_FIELDS]);
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!blocked.has(key)) clean[key] = data[key];
  }
  return clean;
}

export function assertAllowedTableName(tableName: string) {
  if (!ALLOWED_TABLE_NAMES.has(tableName)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "جدول غير مسموح" });
  }
}

export function getRecordEmployee(record: Record<string, unknown> | null | undefined): string | undefined {
  if (!record) return undefined;
  const value = record.employee;
  return typeof value === "string" ? value : undefined;
}

export function getRecordCreatedBy(record: Record<string, unknown> | null | undefined): number | undefined {
  if (!record) return undefined;
  const value = record.createdBy;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return n > 0 ? n : undefined;
  }
  return undefined;
}

export function assertCorrespondenceAccess(user: AuthUser, record: { employee?: string | null; createdBy?: number | null }) {
  if (hasPrivilegedAccess(user)) return;
  if (record.employee === employeeName(user)) return;
  if (record.createdBy === user.id) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك الوصول إلى هذه المراسلة" });
}

export function assertAppointmentAccess(
  user: AuthUser,
  record: { employee?: string | null; employeeId?: number | null; createdBy?: number | null },
) {
  if (hasPrivilegedAccess(user)) return;
  if (record.employee === employeeName(user)) return;
  if (record.employeeId != null && record.employeeId === user.id) return;
  if (record.createdBy === user.id) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك الوصول إلى هذا الموعد" });
}

export function assertLegalReviewAccess(
  user: AuthUser,
  record: { createdBy?: number | null; assignedToId?: number | null },
  message = "لا يحق لك الوصول إلى طلب المراجعة",
) {
  if (hasPrivilegedAccess(user)) return;
  if (record.createdBy != null && record.createdBy === user.id) return;
  if (record.assignedToId != null && record.assignedToId === user.id) return;
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export function assertLegalReviewDelete(
  user: AuthUser,
  record: { createdBy?: number | null },
  message = "لا يحق لك حذف طلب المراجعة",
) {
  if (hasPrivilegedAccess(user)) return;
  if (record.createdBy != null && record.createdBy === user.id) return;
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export function canAccessNotification(
  user: AuthUser,
  notif: { userId?: number | null; targetEmployee?: string | null },
): boolean {
  if (notif.userId === user.id) return true;
  if (notif.targetEmployee && notif.targetEmployee === employeeName(user)) return true;
  return false;
}

export type UserPermissions = {
  cases?: {
    viewAll?: boolean;
    reports?: boolean;
    archive?: boolean;
  };
};

export function getUserPermissions(user: AuthUser & { permissions?: unknown }): UserPermissions {
  if (hasPrivilegedAccess(user)) return { cases: { viewAll: true, reports: true, archive: true } };
  const perms = user.permissions as Record<string, unknown> | null | undefined;
  if (!perms) return {};
  if (typeof perms.cases === "object" && perms.cases !== null) {
    return { cases: perms.cases as UserPermissions["cases"] };
  }
  return {
    cases: {
      viewAll: perms.cases_viewAll === true,
      reports: perms.cases_reports === true,
      archive: perms.cases_archive === true,
    },
  };
}

export function canViewAllCases(user: AuthUser & { permissions?: unknown }): boolean {
  return hasPrivilegedAccess(user) || !!getUserPermissions(user).cases?.viewAll;
}

export function canAccessCaseReports(user: AuthUser & { permissions?: unknown }): boolean {
  return hasPrivilegedAccess(user) || !!getUserPermissions(user).cases?.reports;
}

export function canArchiveCases(user: AuthUser & { permissions?: unknown }): boolean {
  return hasPrivilegedAccess(user) || !!getUserPermissions(user).cases?.archive;
}

export function assertCaseRecordAccess(
  user: AuthUser & { permissions?: unknown },
  recordEmployee?: string | null,
  message = "لا يحق لك الوصول إلى هذه القضية",
  recordCreatedBy?: number | null,
) {
  if (canViewAllCases(user)) return;
  assertOwnsEmployeeRecord(user, recordEmployee, message, recordCreatedBy);
}

export function assertSectionAccess(
  user: AuthUser & { permissions?: unknown },
  key: SectionPermissionKey,
  message = "ليس لديك صلاحية الوصول لهذا القسم",
) {
  if (!canAccessSection(user, key)) {
    const deniedMessage = isPrivilegedOnlySection(key)
      ? "هذا القسم للمدير أو الإداري فقط"
      : message;
    throw new TRPCError({ code: "FORBIDDEN", message: deniedMessage });
  }
}

export function assertSectionWrite(
  user: AuthUser & { permissions?: unknown },
  key: SectionPermissionKey,
  message = "ليس لديك صلاحية التعديل في هذا القسم (قراءة فقط)",
) {
  assertSectionAccess(user, key);
  if (!canWriteSection(user, key)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

export function assertTableAccess(
  user: AuthUser & { permissions?: unknown },
  tableName: string,
  message = "ليس لديك صلاحية الوصول لهذا القسم",
) {
  if (!canAccessTable(user, tableName)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

export function assertTableWrite(
  user: AuthUser & { permissions?: unknown },
  tableName: string,
  message = "ليس لديك صلاحية التعديل في هذا القسم (قراءة فقط)",
) {
  assertTableAccess(user, tableName);
  if (!canWriteTable(user, tableName)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

export function assertActiveUser(user: AuthUser & { active?: number | null }) {
  if (user.active === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "الحساب معطّل. تواصل مع المدير." });
  }
}
