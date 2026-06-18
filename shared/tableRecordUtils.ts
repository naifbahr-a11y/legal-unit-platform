import { TRPCError } from "@trpc/server";
import { findBranchByField } from "./branchUtils";
import { PLATFORM_GOVERNORATE } from "./const";
import { hasFullAccess } from "./userRoles";

export type TableRecordUser = {
  role: string;
  displayName: string | null;
  name?: string | null;
  username: string;
};

const EMPLOYEE_CUSTODY_TABLES = new Set([
  "bank_properties",
  "mortgaged_properties",
  "forged_checks",
  "investigation_cases",
  "general_files",
  "compensation_cases",
  "personal_guarantees",
]);

const PROPERTY_TABLES = new Set(["bank_properties", "mortgaged_properties"]);

export function tableEmployeeName(user: TableRecordUser): string {
  return user.displayName || user.name || user.username;
}

export function isPlatformBranchValue(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return true;
  const branch = findBranchByField(raw);
  if (!branch) return true;
  return branch.governorate === PLATFORM_GOVERNORATE;
}

export function assertPlatformBranch(raw: string | null | undefined, message = "الفرع يجب أن يكون ضمن محافظة الأنبار") {
  if (!isPlatformBranchValue(raw)) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
}

function assignEmployeeCustody(
  tableName: string,
  out: Record<string, unknown>,
  user: TableRecordUser,
  isPrivileged: boolean,
  isUpdate: boolean,
) {
  if (!EMPLOYEE_CUSTODY_TABLES.has(tableName)) return;

  if (!isPrivileged) {
    out.employee = tableEmployeeName(user);
    return;
  }

  if (isUpdate && typeof out.employee === "string" && !out.employee.trim()) {
    delete out.employee;
    return;
  }

  if (!isUpdate && !(typeof out.employee === "string" && out.employee.trim())) {
    out.employee = tableEmployeeName(user);
  }
}

/** تجهيز بيانات السجلات العامة قبل الحفظ */
export function prepareGenericTableData(
  tableName: string,
  data: Record<string, unknown>,
  user: TableRecordUser,
  options?: { isUpdate?: boolean },
): Record<string, unknown> {
  const out = { ...data };
  const isPrivileged = hasFullAccess(user.role);
  const isUpdate = options?.isUpdate ?? false;

  if (tableName === "forged_checks") {
    if (typeof out.entity === "string" && out.entity.trim()) {
      assertPlatformBranch(out.entity, "فرع الصك يجب أن يكون ضمن محافظة الأنبار");
    }
  }

  if (tableName === "investigation_cases" || PROPERTY_TABLES.has(tableName)) {
    if (typeof out.branch === "string" && out.branch.trim()) {
      assertPlatformBranch(out.branch);
    }
  }

  assignEmployeeCustody(tableName, out, user, isPrivileged, isUpdate);

  if (tableName === "general_files") {
    const custody =
      typeof out.employee === "string" && out.employee.trim()
        ? out.employee.trim()
        : tableEmployeeName(user);
    out.employeeCustody = custody;
  }

  return out;
}

export function isPropertyTable(tableName: string): tableName is "bank_properties" | "mortgaged_properties" {
  return PROPERTY_TABLES.has(tableName);
}
