import { hasFullAccess } from "@shared/userRoles";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as authz from "./authorization";
import * as caseService from "./caseService";
import { addLegalReviewTrail } from "./legalReviewService";

type Actor = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
};

function followupRecipientId(review: {
  assignedToId?: number | null;
  createdBy?: number | null;
}): number | null {
  return review.assignedToId ?? review.createdBy ?? null;
}

/** من يجب إنجاز متابعة المراجعة (منشئ الطلب أو المكلّف) */
function isResponsibleForFollowup(
  review: { assignedToId?: number | null; createdBy?: number | null },
  userId: number,
): boolean {
  if (review.assignedToId != null) {
    return review.assignedToId === userId || review.createdBy === userId;
  }
  return review.createdBy === userId;
}

function normalizeDatePart(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return v.slice(0, 10);
}

function isFollowupCompleted(
  review: {
    id: number;
    followupStatus?: string | null;
  },
  caseData: { lastActions?: string | null } | null | undefined,
): boolean {
  if (review.followupStatus === "approved") return true;
  const actions = (caseData?.lastActions ?? "").trim();
  if (actions.includes(`متابعة مراجعة #${review.id}`)) return true;
  return false;
}

function isCaseUpdatedForReview(
  review: {
    id: number;
    reviewDate: string;
    followupStatus?: string | null;
    followupActions?: string | null;
  },
  caseData: { lastFollowup?: string | null; lastActions?: string | null } | null | undefined,
): boolean {
  if (isFollowupCompleted(review, caseData)) return true;
  if (!caseData) return false;

  const followupText = review.followupActions?.trim();
  if (followupText) {
    const snippet = followupText.slice(0, Math.min(80, followupText.length));
    if (snippet && (caseData.lastActions ?? "").includes(snippet)) return true;
  }

  const reviewDate = normalizeDatePart(review.reviewDate);
  const lastFollowup = normalizeDatePart(caseData.lastFollowup);
  if (reviewDate && lastFollowup && lastFollowup >= reviewDate && (caseData.lastActions ?? "").trim()) {
    return true;
  }

  return false;
}

/** بعد اعتماد تحديث القضية (موافقات معلّقة أو تعديل مباشر) — إغلاق متابعة المراجعة المرتبطة */
export async function syncLegalReviewFollowupAfterCaseUpdate(
  caseId: number,
  options: { submittedBy?: number; approvedBy?: number; force?: boolean } = {},
) {
  const caseData = await db.getCaseById(caseId);
  if (!caseData?.lastActions?.trim()) return { synced: 0 };

  const reviews = await db.getLegalReviewsByCaseId(caseId);
  let synced = 0;

  for (const review of reviews) {
    if (!["awaiting_submission", "rejected", "pending_approval"].includes(review.followupStatus ?? "none")) {
      continue;
    }
    if (!["in_review", "completed"].includes(review.status ?? "")) continue;

    const recipientId = followupRecipientId(review);
    if (options.submittedBy != null && recipientId !== options.submittedBy) continue;
    if (!options.force && !isCaseUpdatedForReview(review, caseData)) continue;

    await db.updateLegalReview(review.id, {
      followupStatus: "approved",
      followupApprovedBy: options.approvedBy ?? null,
      followupRejectNote: null,
    });
    synced++;
  }

  return { synced };
}

export type LegalReviewCreateBlockItem = {
  reviewId: number;
  title: string;
  reviewDate: string;
  followupStatus: string;
  relatedCaseId: number;
  caseNumber: string | null;
  followupRejectNote: string | null;
};

export async function getLegalReviewCreateBlockers(user: Actor): Promise<{
  blocked: boolean;
  items: LegalReviewCreateBlockItem[];
}> {
  if (authz.hasPrivilegedAccess(user)) {
    return { blocked: false, items: [] };
  }

  const candidates = await db.getLegalReviewsBlockingNewRequest(user.id);
  const items: LegalReviewCreateBlockItem[] = [];

  for (const review of candidates) {
    if (!isResponsibleForFollowup(review, user.id) || !review.relatedCaseId) continue;
    const caseData = await db.getCaseById(review.relatedCaseId);
    if (isFollowupCompleted(review, caseData)) continue;
    items.push({
      reviewId: review.id,
      title: review.title,
      reviewDate: review.reviewDate,
      followupStatus: review.followupStatus ?? "awaiting_submission",
      relatedCaseId: review.relatedCaseId,
      caseNumber: caseData?.caseNumber ?? null,
      followupRejectNote: review.followupRejectNote ?? null,
    });
  }

  return { blocked: items.length > 0, items };
}

export async function assertCanCreateLegalReview(user: Actor) {
  const { blocked, items } = await getLegalReviewCreateBlockers(user);
  if (!blocked) return;

  const first = items[0];
  const caseLabel = first.caseNumber ? `القضية ${first.caseNumber}` : `القضية #${first.relatedCaseId}`;
  const actionHint =
    first.followupStatus === "rejected"
      ? "يرجى تعديل وإعادة إرسال آخر الإجراءات"
      : first.followupStatus === "pending_approval"
        ? "متابعتك بانتظار موافقة المدير — لا يمكن تقديم طلب جديد حتى الاعتماد"
        : "يرجى إدخال آخر الإجراءات وانتظار موافقة المدير";

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `لا يمكن تقديم طلب مراجعة جديد قبل إكمال متابعة "${first.title}" (${caseLabel}). ${actionHint}.`,
  });
}

async function notifyPrivilegedUsers(title: string, message: string, relatedId: number) {
  const allUsers = await db.getAllUsers();
  for (const u of allUsers) {
    if (hasFullAccess(u.role)) {
      await db.createNotification({
        userId: u.id,
        title,
        message,
        type: "legal_review_followup_pending",
        relatedId,
      });
    }
  }
}

/** إرسال تذكيرات نهاية يوم المراجعة */
export async function runLegalReviewFollowupReminders() {
  const reviews = await db.getLegalReviewsNeedingFollowupReminder();
  let sent = 0;
  for (const review of reviews) {
    const userId = followupRecipientId(review);
    if (!userId || !review.relatedCaseId) continue;

    const caseData = await db.getCaseById(review.relatedCaseId);
    const caseLabel = caseData?.caseNumber || `#${review.relatedCaseId}`;

    await db.createNotificationOncePerDay({
      userId,
      title: "مطلوب: آخر الإجراءات بعد المراجعة",
      message: `انتهى يوم مراجعة "${review.title}" (${review.reviewDate}). يرجى إدخال آخر الإجراءات المتعلقة بالقضية ${caseLabel} لهذا اليوم.`,
      type: "legal_review_followup",
      relatedId: review.id,
    });

    await db.updateLegalReview(review.id, {
      followupStatus: "awaiting_submission",
      followupReminderSent: 1,
    });
    sent++;
  }
  return { sent, checked: reviews.length };
}

export async function submitLegalReviewFollowup(
  reviewId: number,
  actor: Actor,
  lastActions: string,
) {
  const text = lastActions?.trim();
  if (!text) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "يرجى إدخال آخر الإجراءات" });
  }

  const review = await db.getLegalReviewById(reviewId);
  if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });

  if (!isResponsibleForFollowup(review, actor.id) && !authz.hasPrivilegedAccess(actor)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك تقديم المتابعة لهذا الطلب" });
  }
  if (!review.relatedCaseId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "الطلب غير مرتبط بقضية" });
  }
  if (!["awaiting_submission", "rejected", "none"].includes(review.followupStatus ?? "none")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تقديم المتابعة في هذه المرحلة" });
  }

  await db.updateLegalReview(reviewId, {
    followupActions: text,
    followupStatus: "pending_approval",
    followupSubmittedAt: new Date(),
    followupRejectNote: null,
  });

  await addLegalReviewTrail(reviewId, "followup_submitted", actor, text.slice(0, 200));
  await notifyPrivilegedUsers(
    "متابعة مراجعة بانتظار الموافقة",
    `${actor.displayName ?? actor.username}: آخر إجراءات لطلب "${review.title}"`,
    reviewId,
  );

  await db.logActivity({
    userId: actor.id,
    username: actor.username,
    action: "submit_legal_review_followup",
    details: `تقديم متابعة لطلب مراجعة #${reviewId}`,
  });

  return { success: true as const };
}

export async function approveLegalReviewFollowup(reviewId: number, reviewer: Actor) {
  if (!authz.hasPrivilegedAccess(reviewer)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
  }

  const review = await db.getLegalReviewById(reviewId);
  if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });
  if (review.followupStatus !== "pending_approval") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد متابعة بانتظار الموافقة" });
  }
  if (!review.relatedCaseId || !review.followupActions) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "بيانات المتابعة ناقصة" });
  }

  const caseData = await caseService.assertCaseAccess(reviewer, review.relatedCaseId);
  const dateLabel = review.reviewDate || new Date().toISOString().slice(0, 10);
  const entry = `[${dateLabel} — متابعة مراجعة #${reviewId}]\n${review.followupActions}`;
  const mergedLastActions = caseData.lastActions?.trim()
    ? `${caseData.lastActions.trim()}\n\n${entry}`
    : entry;

  await db.updateCase(review.relatedCaseId, {
    lastActions: mergedLastActions,
    lastFollowup: dateLabel,
  });

  await caseService.auditCaseChange(
    reviewer,
    "legal_review_followup",
    review.relatedCaseId,
    `تحديث آخر الإجراءات من طلب مراجعة #${reviewId}`,
    { lastActions: caseData.lastActions, lastFollowup: caseData.lastFollowup },
    { lastActions: mergedLastActions, lastFollowup: dateLabel },
  );

  await db.updateLegalReview(reviewId, {
    followupStatus: "approved",
    followupApprovedBy: reviewer.id,
  });

  const notifyUserId = followupRecipientId(review);
  if (notifyUserId) {
    await db.createNotification({
      userId: notifyUserId,
      title: "تمت الموافقة على متابعة المراجعة",
      message: `تم اعتماد آخر الإجراءات وتحديث القضية المرتبطة بطلب "${review.title}"`,
      type: "legal_review_followup",
      relatedId: reviewId,
    });
  }

  await addLegalReviewTrail(reviewId, "followup_approved", reviewer);
  await db.logActivity({
    userId: reviewer.id,
    username: reviewer.username,
    action: "approve_legal_review_followup",
    details: `موافقة متابعة طلب #${reviewId} — قضية #${review.relatedCaseId}`,
  });

  return { success: true as const, caseId: review.relatedCaseId };
}

export async function rejectLegalReviewFollowup(
  reviewId: number,
  reviewer: Actor,
  note: string,
) {
  if (!authz.hasPrivilegedAccess(reviewer)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
  }
  if (!note?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "يرجى ذكر سبب الرفض" });
  }

  const review = await db.getLegalReviewById(reviewId);
  if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });
  if (review.followupStatus !== "pending_approval") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد متابعة بانتظار الرفض" });
  }

  await db.updateLegalReview(reviewId, {
    followupStatus: "rejected",
    followupRejectNote: note.trim(),
  });

  const notifyUserId = followupRecipientId(review);
  if (notifyUserId) {
    await db.createNotification({
      userId: notifyUserId,
      title: "تم رفض متابعة المراجعة",
      message: `طلب "${review.title}": ${note.trim()}`,
      type: "legal_review_followup",
      relatedId: reviewId,
    });
  }

  await addLegalReviewTrail(reviewId, "followup_rejected", reviewer, note.trim());
  await db.logActivity({
    userId: reviewer.id,
    username: reviewer.username,
    action: "reject_legal_review_followup",
    details: `رفض متابعة طلب #${reviewId}`,
  });

  return { success: true as const };
}
