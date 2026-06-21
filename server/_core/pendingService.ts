import { TRPCError } from "@trpc/server";
import { safeJsonParse } from "@shared/jsonUtils";
import { prepareGenericTableData, isPropertyTable } from "@shared/tableRecordUtils";
import * as db from "../db";
import * as authz from "./authorization";
import * as caseService from "./caseService";
import * as legalReviewFollowupService from "./legalReviewFollowupService";
import type { AuthUser } from "./authorization";

type Reviewer = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
};

type PendingOp = NonNullable<Awaited<ReturnType<typeof db.getPendingOperationById>>>;

function parsePendingData(op: PendingOp, modifiedData?: Record<string, unknown>) {
  if (modifiedData) return modifiedData;
  if (typeof op.data === "string") {
    return safeJsonParse<Record<string, unknown>>(op.data, {});
  }
  return (op.data ?? {}) as Record<string, unknown>;
}

async function getSubmitterUser(submittedBy: number): Promise<AuthUser> {
  const user = await db.getUserById(submittedBy);
  if (!user) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "مقدّم الطلب غير موجود" });
  }
  return {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    username: user.username,
    name: user.name,
  };
}

async function assertNoDuplicatePending(
  op: PendingOp,
  data: Record<string, unknown>,
  excludeRecordId?: number,
) {
  if (op.tableName === "cases") {
    await caseService.checkDuplicateCaseNumber(
      data.caseNumber as string | undefined,
      op.operationType === "edit" ? (excludeRecordId ?? op.recordId ?? undefined) : undefined,
    );
    return;
  }
  if (isPropertyTable(op.tableName)) {
    const num = typeof data.propertyNumber === "string" ? data.propertyNumber.trim() : "";
    if (num && await db.propertyNumberExists(
      op.tableName,
      num,
      op.operationType === "edit" ? (excludeRecordId ?? op.recordId ?? undefined) : undefined,
    )) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `رقم العقار "${num}" مستخدم مسبقاً في النظام`,
      });
    }
  }
}

async function applyPendingMutation(
  op: PendingOp,
  data: Record<string, unknown>,
  submitter: AuthUser,
) {
  await assertNoDuplicatePending(op, data);

  if (op.operationType === "add") {
    if (op.tableName === "cases") {
      const payload = caseService.prepareCaseData(data, submitter);
      payload.createdBy = op.submittedBy;
      await db.insertCase(payload);
    } else {
      authz.assertAllowedTableName(op.tableName);
      const prepared = prepareGenericTableData(op.tableName, data, submitter);
      prepared.createdBy = op.submittedBy;
      await db.insertTableRecord(op.tableName, prepared);
    }
    return;
  }

  if (op.operationType === "edit" && op.recordId) {
    if (op.tableName === "cases") {
      const safeData = caseService.prepareCaseData(authz.sanitizeWritableData(data), submitter);
      await db.updateCase(op.recordId, safeData);
    } else {
      authz.assertAllowedTableName(op.tableName);
      const prepared = prepareGenericTableData(
        op.tableName,
        authz.sanitizeWritableData(data),
        submitter,
        { isUpdate: true },
      );
      await db.updateTableRecord(op.tableName, op.recordId, prepared);
    }
    return;
  }

  if (op.operationType === "delete" && op.recordId) {
    if (op.tableName === "cases") {
      await db.deleteCase(op.recordId);
    } else {
      authz.assertAllowedTableName(op.tableName);
      await db.deleteTableRecord(op.tableName, op.recordId);
    }
    return;
  }

  throw new TRPCError({ code: "BAD_REQUEST", message: "نوع العملية غير مدعوم" });
}

export async function approvePendingOperation(
  pendingId: number,
  reviewer: Reviewer,
  modifiedData?: Record<string, unknown>,
) {
  const op = await db.claimPendingOperation(pendingId, reviewer.id, "approved");
  if (!op) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "تمت معالجة هذا الطلب مسبقاً" });
  }

  const data = parsePendingData(op, modifiedData);
  const submitter = await getSubmitterUser(op.submittedBy);

  try {
    await applyPendingMutation(op, data as Record<string, unknown>, submitter);
  } catch (err) {
    await db.updatePendingOperation(pendingId, { status: "pending", reviewedBy: null });
    throw err;
  }

  if (
    op.tableName === "cases"
    && op.operationType === "edit"
    && op.recordId
    && Object.prototype.hasOwnProperty.call(data, "lastActions")
    && String((data as Record<string, unknown>).lastActions ?? "").trim()
  ) {
    await legalReviewFollowupService.syncLegalReviewFollowupAfterCaseUpdate(op.recordId, {
      submittedBy: op.submittedBy,
      approvedBy: reviewer.id,
      force: true,
    });
  }

  await db.createNotification({
    userId: op.submittedBy,
    title: "تمت الموافقة على طلبك",
    message: `تمت الموافقة على طلب ${op.operationType === "add" ? "الإضافة" : op.operationType === "edit" ? "التعديل" : "الحذف"} (رقم ${pendingId})`,
    type: "approval_result",
    relatedId: pendingId,
  });

  await db.logActivity({
    userId: reviewer.id,
    username: reviewer.username,
    action: "approve_pending",
    details: `موافقة على طلب #${pendingId} (${op.operationType} — ${op.tableName})`,
  });

  return { success: true as const };
}

export async function rejectPendingOperation(
  pendingId: number,
  reviewer: Reviewer,
  note?: string,
) {
  const op = await db.claimPendingOperation(pendingId, reviewer.id, "rejected", {
    reviewNote: note ?? null,
  });
  if (!op) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "تمت معالجة هذا الطلب مسبقاً" });
  }

  await db.createNotification({
    userId: op.submittedBy,
    title: "تم رفض طلبك",
    message: note ? `تم رفض طلبك (رقم ${pendingId}): ${note}` : `تم رفض طلبك (رقم ${pendingId})`,
    type: "approval_result",
    relatedId: pendingId,
  });

  await db.logActivity({
    userId: reviewer.id,
    username: reviewer.username,
    action: "reject_pending",
    details: note
      ? `رفض طلب #${pendingId} (${op.operationType} — ${op.tableName}): ${note}`
      : `رفض طلب #${pendingId} (${op.operationType} — ${op.tableName})`,
  });

  return { success: true as const };
}

export async function enrichPendingOperation(op: PendingOp) {
  const [enriched] = await enrichPendingOperations([op]);
  return enriched;
}

export async function enrichPendingOperations(ops: PendingOp[]) {
  const editOps = ops.filter((op) => op.operationType === "edit" && op.recordId != null);
  const originals = new Map<string, unknown>();

  const caseIds = editOps.filter((op) => op.tableName === "cases").map((op) => op.recordId!);
  if (caseIds.length) {
    const rows = await db.getCasesByIds(caseIds);
    for (const row of rows) originals.set(`cases:${row.id}`, row);
  }

  const byTable = new Map<string, number[]>();
  for (const op of editOps) {
    if (op.tableName === "cases" || op.recordId == null) continue;
    const ids = byTable.get(op.tableName) ?? [];
    ids.push(op.recordId);
    byTable.set(op.tableName, ids);
  }
  for (const [tableName, ids] of byTable) {
    const rows = await db.getTableRecordsByIds(tableName, ids);
    for (const row of rows) originals.set(`${tableName}:${(row as { id: number }).id}`, row);
  }

  return ops.map((op) => {
    if (op.operationType === "edit" && op.recordId != null) {
      const original = originals.get(`${op.tableName}:${op.recordId}`);
      return original ? { ...op, originalData: original } : op;
    }
    return op;
  });
}
