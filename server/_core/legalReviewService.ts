import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as authz from "./authorization";

const EMPLOYEE_WRITABLE = [
  "title", "reviewDate", "location", "priority", "description", "requestDate",
  "attachmentUrl", "relatedCaseId",
] as const;

type ReviewUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
};

export function prepareLegalReviewCreate(
  user: ReviewUser,
  input: Record<string, unknown>,
) {
  const data: Record<string, unknown> = {
    ...input,
    createdBy: user.id,
    createdByName: user.displayName ?? user.username,
    status: "new",
  };
  if (!authz.hasPrivilegedAccess(user)) {
    delete data.assignedTo;
    delete data.assignedToId;
    delete data.status;
    delete data.reviewNotes;
  }
  return data;
}

export function sanitizeLegalReviewUpdate(
  user: ReviewUser,
  input: Record<string, unknown>,
) {
  if (authz.hasPrivilegedAccess(user)) return { ...input };
  const out: Record<string, unknown> = {};
  for (const key of EMPLOYEE_WRITABLE) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

export async function addLegalReviewTrail(
  reviewId: number,
  action: string,
  user: ReviewUser,
  notes?: string,
) {
  await db.addLegalReviewTrail({
    reviewId,
    action,
    notes: notes ?? null,
    performedBy: user.id,
    performedByName: user.displayName ?? user.username,
  });
}

export async function notifyLegalReviewAssigned(
  reviewId: number,
  assignedToId: number,
  title: string,
) {
  await db.createNotification({
    userId: assignedToId,
    title: "طلب مراجعة جديد",
    message: `تم إسناد طلب مراجعة "${title}" إليك`,
    type: "legal_review",
    relatedId: reviewId,
  });
}

export async function approveLegalReview(
  id: number,
  reviewer: ReviewUser,
  reviewNotes?: string,
) {
  const review = await db.getLegalReviewById(id);
  if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });
  await db.updateLegalReview(id, { status: "completed", reviewNotes: reviewNotes ?? null });
  if (review.createdBy) {
    await db.createNotification({
      userId: review.createdBy,
      title: "تمت الموافقة على طلب المراجعة",
      message: `تمت الموافقة على طلب المراجعة "${review.title}"`,
      type: "legal_review",
      relatedId: id,
    });
  }
  await addLegalReviewTrail(id, "approved", reviewer, reviewNotes);
  await db.logActivity({
    userId: reviewer.id,
    username: reviewer.username,
    action: "approve_legal_review",
    details: `الموافقة على طلب مراجعة رقم ${id}`,
  });
  return { success: true as const };
}

export async function rejectLegalReview(
  id: number,
  reviewer: ReviewUser,
  reviewNotes: string,
) {
  if (!reviewNotes?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "يرجى ذكر سبب الرفض" });
  }
  const review = await db.getLegalReviewById(id);
  if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });
  await db.updateLegalReview(id, { status: "rejected", reviewNotes });
  if (review.createdBy) {
    await db.createNotification({
      userId: review.createdBy,
      title: "تم رفض طلب المراجعة",
      message: `تم رفض طلب المراجعة "${review.title}": ${reviewNotes}`,
      type: "legal_review",
      relatedId: id,
    });
  }
  await addLegalReviewTrail(id, "rejected", reviewer, reviewNotes);
  await db.logActivity({
    userId: reviewer.id,
    username: reviewer.username,
    action: "reject_legal_review",
    details: `رفض طلب مراجعة رقم ${id}`,
  });
  return { success: true as const };
}
