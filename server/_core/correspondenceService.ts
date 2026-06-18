import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import * as db from "../db";
import * as authz from "./authorization";
import * as caseService from "./caseService";
import { formatOfficialOutNumber } from "../../shared/correspondenceNumbering";
import { correspondenceAutoNumbering } from "../../drizzle/schema";

const EMPLOYEE_WRITABLE = [
  "bookNumber", "subject", "senderEntity", "receiverEntity", "correspondenceDate",
  "receivedDate", "status", "priority", "parentId", "deadline",
  "attachmentUrl", "attachmentKey", "notes", "relatedCaseId", "relatedCaseNumber",
  "mandobOutNumber",
] as const;

type CorrespondenceUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
};

export async function generateCorrespondenceAutoNumber(type: "inbox" | "outbox") {
  const dbConn = await db.getDb();
  const year = new Date().getFullYear();
  const typeLabel = type === "inbox" ? "وارد" : "صادر";
  if (!dbConn) return `${year}/${typeLabel}/001`;

  return dbConn.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(correspondenceAutoNumbering)
      .where(and(
        eq(correspondenceAutoNumbering.counterYear, year),
        eq(correspondenceAutoNumbering.type, type),
      ))
      .for("update")
      .limit(1);

    let seq = 1;
    if (rows.length) {
      seq = (rows[0].lastSeq ?? 0) + 1;
      await tx.update(correspondenceAutoNumbering)
        .set({ lastSeq: seq })
        .where(eq(correspondenceAutoNumbering.id, rows[0].id));
    } else {
      await tx.insert(correspondenceAutoNumbering).values({
        counterYear: year,
        type,
        lastSeq: 1,
      });
    }
    return `${year}/${typeLabel}/${String(seq).padStart(3, "0")}`;
  });
}

export async function resolveCaseFields(
  caseId?: number | null,
  user?: authz.AuthUser & { permissions?: unknown },
) {
  if (!caseId) {
    return { relatedCaseId: undefined as number | undefined, relatedCaseNumber: undefined as string | undefined };
  }
  const caseData = user
    ? await caseService.assertCaseAccess(user, caseId)
    : await db.getCaseById(caseId);
  if (!caseData) throw new TRPCError({ code: "BAD_REQUEST", message: "القضية غير موجودة" });
  return { relatedCaseId: caseId, relatedCaseNumber: caseData.caseNumber ?? undefined };
}

export async function resolveEmployeeField(
  user: CorrespondenceUser,
  input: { employee?: string; employeeId?: number },
) {
  if (!authz.hasPrivilegedAccess(user)) {
    return user.displayName ?? user.username;
  }
  if (input.employeeId) {
    const target = await db.getUserById(input.employeeId);
    if (!target) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف غير موجود" });
    return target.displayName ?? target.username;
  }
  return input.employee?.trim() || user.displayName || user.username;
}

export function buildOfficialOutNumber(
  legalOutNumber: number,
  officeCode: string,
  mandobOutNumber?: string | null,
) {
  return formatOfficialOutNumber(legalOutNumber, officeCode, mandobOutNumber);
}

export async function prepareCorrespondenceCreate(
  user: CorrespondenceUser,
  input: Record<string, unknown> & { type: "inbox" | "outbox" },
) {
  const caseFields = await resolveCaseFields(input.relatedCaseId as number | undefined, user);
  const employee = await resolveEmployeeField(user, {
    employee: input.employee as string | undefined,
    employeeId: input.employeeId as number | undefined,
  });
  const autoNumber = await generateCorrespondenceAutoNumber(input.type);

  const base: Record<string, unknown> = {
    ...input,
    ...caseFields,
    autoNumber,
    createdBy: user.id,
    employee,
    archived: 0,
  };

  if (input.type === "outbox") {
    const { legalOutNumber, officeCode } = await db.allocateLegalOutNumber();
    const mandobOutNumber = (input.mandobOutNumber as string | undefined)?.trim() || undefined;
    const officialNumber = buildOfficialOutNumber(legalOutNumber, officeCode, mandobOutNumber);
    return {
      ...base,
      legalOutNumber,
      mandobOutNumber,
      officialNumber,
    };
  }

  return base;
}

export async function registerCorrespondenceEntities(
  user: CorrespondenceUser,
  input: { type: "inbox" | "outbox"; senderEntity?: string; receiverEntity?: string },
) {
  if (input.type === "inbox" && input.senderEntity?.trim()) {
    await db.upsertCorrespondenceEntityFromField("sender", input.senderEntity, user.id);
  }
  if (input.type === "outbox" && input.receiverEntity?.trim()) {
    await db.upsertCorrespondenceEntityFromField("receiver", input.receiverEntity, user.id);
  }
}

export function sanitizeCorrespondenceUpdate(
  user: CorrespondenceUser,
  input: Record<string, unknown>,
) {
  const out: Record<string, unknown> = {};
  if (authz.hasPrivilegedAccess(user)) {
    for (const key of Object.keys(input)) {
      if (key !== "id" && key !== "type") out[key] = input[key];
    }
  } else {
    for (const key of EMPLOYEE_WRITABLE) {
      if (input[key] !== undefined) out[key] = input[key];
    }
  }
  if (out.status === "completed") out.archived = 1;
  return out;
}

export async function applyOfficialOutNumberUpdate(
  existing: { type: string; legalOutNumber?: number | null; mandobOutNumber?: string | null },
  data: Record<string, unknown>,
) {
  if (existing.type !== "outbox" || existing.legalOutNumber == null) return data;
  const settings = await db.getOutboxNumberingSettings();
  const mandob = (data.mandobOutNumber as string | undefined) ?? existing.mandobOutNumber ?? undefined;
  data.officialNumber = buildOfficialOutNumber(existing.legalOutNumber, settings.officeCode, mandob as string | undefined);
  return data;
}

export async function addCorrespondenceTrail(
  correspondenceId: number,
  action: string,
  user: CorrespondenceUser,
  extra?: { toUser?: string; notes?: string },
) {
  await db.addTrailEntry({
    correspondenceId,
    action,
    fromUser: user.displayName ?? user.username,
    toUser: extra?.toUser,
    notes: extra?.notes,
  });
}

export async function resolveUserIdByEmployeeName(name?: string | null): Promise<number | null> {
  if (!name?.trim()) return null;
  const users = await db.getAllUsers();
  const match = users.find((u) => u.displayName === name || u.username === name);
  return match?.id ?? null;
}
