import { PENDING_OP_LABELS, PENDING_TABLE_LABELS } from "@shared/pendingTables";
import { hasFullAccess } from "@shared/userRoles";
import * as db from "../db";

export type SubmitPendingInput = {
  tableName: string;
  operationType: "add" | "edit" | "delete";
  data: Record<string, unknown>;
  submittedBy: number;
  submittedByName: string;
  recordId?: number | null;
  detail?: string;
};

/** إنشاء طلب معلّق + إشعار للموظف + إشعار للمدير/الإداري */
export async function submitPendingOperation(input: SubmitPendingInput): Promise<number | undefined> {
  const pendingId = await db.createPendingOperation({
    tableName: input.tableName,
    recordId: input.recordId ?? undefined,
    operationType: input.operationType,
    data: input.data,
    submittedBy: input.submittedBy,
    submittedByName: input.submittedByName,
  });

  if (!pendingId) return undefined;

  const tableLabel = PENDING_TABLE_LABELS[input.tableName] || input.tableName;
  const opLabel = PENDING_OP_LABELS[input.operationType] || input.operationType;
  const detail = input.detail ? ` — ${input.detail}` : "";

  await db.createNotification({
    userId: input.submittedBy,
    title: "تم استلام طلبك",
    message: `طلب ${opLabel} في ${tableLabel} قيد المراجعة (رقم ${pendingId})${detail}`,
    type: "submission_received",
    relatedId: pendingId,
  });

  const allUsers = await db.getAllUsers();
  for (const u of allUsers) {
    if (hasFullAccess(u.role)) {
      await db.createNotification({
        userId: u.id,
        title: `طلب ${opLabel} جديد`,
        message: `${input.submittedByName}: ${tableLabel}${input.recordId ? ` (سجل #${input.recordId})` : ""}${detail}`,
        type: "pending_approval",
        relatedId: pendingId,
      });
    }
  }

  return pendingId;
}
