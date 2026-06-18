import { TRPCError } from "@trpc/server";
import { normalizeCasePayload } from "../../shared/caseUtils";
import * as db from "../db";
import * as authz from "./authorization";
import type { AuthUser } from "./authorization";

export function prepareCaseData(
  input: Record<string, unknown>,
  user: AuthUser,
): Record<string, unknown> {
  const normalized = normalizeCasePayload(input);
  if (!authz.hasPrivilegedAccess(user)) {
    normalized.employee = authz.employeeName(user);
  }
  return authz.sanitizeWritableData(normalized);
}

export async function assertCaseAccess(
  user: AuthUser & { permissions?: unknown },
  caseId: number,
) {
  const caseData = await db.getCaseById(caseId);
  if (!caseData) {
    throw new TRPCError({ code: "NOT_FOUND", message: "القضية غير موجودة" });
  }
  authz.assertCaseRecordAccess(user, caseData.employee, undefined, caseData.createdBy);
  return caseData;
}

export async function assertOptionalCaseAccess(
  user: AuthUser & { permissions?: unknown },
  caseId?: number | null,
) {
  if (!caseId) return undefined;
  return assertCaseAccess(user, caseId);
}

export async function auditCaseChange(
  user: AuthUser,
  action: string,
  caseId: number,
  description: string,
  oldData?: Record<string, unknown> | null,
  newData?: Record<string, unknown> | null,
) {
  await db.createAuditEntry({
    userId: user.id,
    username: user.username,
    action,
    tableName: "cases",
    recordId: caseId,
    description,
    oldData: oldData ?? undefined,
    newData: newData ?? undefined,
  });
}

export async function checkDuplicateCaseNumber(
  caseNumber: string | undefined | null,
  excludeId?: number,
): Promise<void> {
  if (!caseNumber?.trim()) return;
  const dup = await db.findDuplicateCase(caseNumber.trim(), excludeId);
  if (dup) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `رقم القضية "${caseNumber}" مستخدم مسبقاً (قضية #${dup.id})`,
    });
  }
}
