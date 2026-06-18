import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as authz from "./authorization";
import * as caseService from "./caseService";

/** تحقق من صلاحية الوصول لمرفقات سجل (قضية أو جدول عام) */
export async function assertAttachmentRecordAccess(
  user: authz.AuthUser & { permissions?: unknown },
  tableName: string,
  recordId: number,
  write = false,
) {
  if (tableName === "cases") {
    if (write) authz.assertSectionWrite(user, "cases");
    else authz.assertSectionAccess(user, "cases");
    await caseService.assertCaseAccess(user, recordId);
    return;
  }

  authz.assertAllowedTableName(tableName);
  if (write) authz.assertTableWrite(user, tableName);
  else authz.assertTableAccess(user, tableName);

  const record = await db.getTableRecord(tableName, recordId);
  if (!record) {
    throw new TRPCError({ code: "NOT_FOUND", message: "السجل غير موجود" });
  }

  const row = record as Record<string, unknown>;
  authz.assertOwnsEmployeeRecord(
    user,
    authz.getRecordEmployee(row),
    undefined,
    authz.getRecordCreatedBy(row),
  );
}
