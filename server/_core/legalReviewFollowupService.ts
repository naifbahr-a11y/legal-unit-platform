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

function isFollowupCompleted(review: { followupStatus?: string | null }): boolean {
  return review.followupStatus === "approved";
}

function getReviewStatus(review: { status?: string | null; reviewStatus?: string | null }): string {
  return review.status ?? review.reviewStatus ?? "new";
}

async function releaseFollowupBlock(
  reviewId: number,
  review: { title: string; assignedToId?: number | null; createdBy?: number | null },
  approverId: number | null,
  message: string,
): Promise<void> {
  await db.updateLegalReview(reviewId, {
    followupStatus: "approved",
    followupApprovedBy: approverId,
    followupRejectNote: null,
  });

  const recipientId = followupRecipientId(review);
  if (recipientId) {
    await db.createNotification({
      userId: recipientId,
      title: "تم رفع الحجب — يمكنك تقديم طلب مراجعة جديد",
      message,
      type: "legal_review_followup",
      relatedId: reviewId,
    });
  }
}

/** بعد موافقة المدير على تعديل القضية — إغلاق متابعة المراجعة المعلّقة فقط */
export async function syncLegalReviewFollowupAfterCaseUpdate(
  caseId: number,
  options: { submittedBy?: number; approvedBy?: number; force?: boolean } = {},
) {
  if (!options.approvedBy) return { synced: 0 };

  const approver = await db.getUserById(options.approvedBy);
  if (!approver || !hasFullAccess(approver.role)) return { synced: 0 };

  const reviews = await db.getLegalReviewsByCaseId(caseId);
  let synced = 0;

  for (const review of reviews) {
    if (!["awaiting_submission", "pending_approval"].includes(review.followupStatus ?? "")) continue;
    if (options.submittedBy != null && !isResponsibleForFollowup(review, options.submittedBy)) continue;

    await db.updateLegalReview(review.id, {
      followupStatus: "approved",
      followupApprovedBy: options.approvedBy,
      followupRejectNote: null,
    });

    const recipientId = followupRecipientId(review);
    if (recipientId) {
      await db.createNotification({
        userId: recipientId,
        title: "تمت الموافقة — يمكنك تقديم طلب مراجعة جديد",
        message: `تم اعتماد تحديث القضية المرتبطة بطلب "${review.title}". يمكنك الآن تقديم طلب مراجعة جديد.`,
        type: "legal_review_followup",
        relatedId: review.id,
      });
    }

    synced++;
  }

  return { synced };
}

/** إذا وافق المدير على الطلب و/أو على تحديث القضية — رفع الحجب العالق */
export async function healStuckFollowupIfEligible(reviewId: number): Promise<boolean> {
  const review = await db.getLegalReviewById(reviewId);
  if (!review?.relatedCaseId) return false;
  if (review.followupStatus === "approved") return false;
  if (!["awaiting_submission", "pending_approval"].includes(review.followupStatus ?? "")) return false;
  if (review.followupStatus === "pending_approval" && review.followupActions?.trim()) return false;

  const caseData = await db.getCaseById(review.relatedCaseId);
  if (!caseData?.lastActions?.trim()) return false;

  const reviewCreated = review.createdAt ? new Date(review.createdAt as Date) : new Date(0);
  const caseUpdated = caseData.updatedAt ? new Date(caseData.updatedAt as Date) : null;
  const managerCompletedReview = getReviewStatus(review) === "completed";
  const caseUpdatedAfterReview = caseUpdated != null && caseUpdated >= reviewCreated;

  let approverId: number | null = review.followupApprovedBy ?? null;
  const responsibleIds = new Set<number>();
  if (review.createdBy) responsibleIds.add(review.createdBy);
  if (review.assignedToId) responsibleIds.add(review.assignedToId);

  let hasApprovedPendingEdit = false;
  for (const uid of responsibleIds) {
    const pendingApprover = await db.getApprovedCaseLastActionsApprover(
      review.relatedCaseId,
      reviewCreated,
      uid,
    );
    if (pendingApprover) {
      hasApprovedPendingEdit = true;
      approverId = approverId ?? pendingApprover;
      break;
    }
  }

  const eligible = hasApprovedPendingEdit || (managerCompletedReview && caseUpdatedAfterReview);
  if (!eligible) return false;

  await releaseFollowupBlock(
    reviewId,
    review,
    approverId,
    `تم اعتماد تحديث القضية وطلب "${review.title}". يمكنك الآن تقديم طلب مراجعة جديد.`,
  );

  return true;
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
    await healStuckFollowupIfEligible(review.id);
    const fresh = await db.getLegalReviewById(review.id);
    if (!fresh || isFollowupCompleted(fresh)) continue;
    const caseData = await db.getCaseById(fresh.relatedCaseId!);
    items.push({
      reviewId: fresh.id,
      title: fresh.title,
      reviewDate: fresh.reviewDate,
      followupStatus: fresh.followupStatus ?? "awaiting_submission",
      relatedCaseId: fresh.relatedCaseId!,
      caseNumber: caseData?.caseNumber ?? null,
      followupRejectNote: fresh.followupRejectNote ?? null,
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
        : first.followupStatus === "awaiting_submission"
          ? "يرجى إدخال آخر الإجراءات وانتظار موافقة المدير"
          : "يرجى إكمال متابعة المراجعة وانتظار موافقة المدير";

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

/** عند تقديم طلب مراجعة مرتبط بقضية — بدء متابعة فورية وحجب طلبات جديدة */
export async function onLegalReviewCreated(
  reviewId: number,
  review: {
    title: string;
    reviewDate: string;
    relatedCaseId?: number | null;
    assignedToId?: number | null;
    createdBy?: number | null;
  },
) {
  if (!review.relatedCaseId) return;

  await db.updateLegalReview(reviewId, {
    followupStatus: "awaiting_submission",
    followupReminderSent: 1,
  });

  const userId = followupRecipientId(review);
  if (!userId) return;

  const caseData = await db.getCaseById(review.relatedCaseId);
  const caseLabel = caseData?.caseNumber || `#${review.relatedCaseId}`;
  const reviewDate = normalizeDatePart(review.reviewDate);
  const today = new Date().toISOString().slice(0, 10);
  const dueNow = reviewDate != null && reviewDate <= today;

  await db.createNotification({
    userId,
    title: dueNow ? "مطلوب: تحديث آخر الإجراءات" : "طلب مراجعة — مطلوب تحديث بعد المراجعة",
    message: dueNow
      ? `تم تقديم طلب "${review.title}". يرجى إدخال آخر الإجراءات للقضية ${caseLabel} وانتظار موافقة المدير. لا يمكن تقديم طلب مراجعة جديد حتى الاعتماد.`
      : `تم تقديم طلب "${review.title}" (تاريخ المراجعة: ${review.reviewDate}). بعد المراجعة يرجى إدخال آخر الإجراءات للقضية ${caseLabel}. لا يمكن تقديم طلب جديد حتى الموافقة على التحديث.`,
    type: "legal_review_followup",
    relatedId: reviewId,
  });
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
      message: `تم اعتماد آخر الإجراءات وتحديث القضية المرتبطة بطلب "${review.title}". يمكنك الآن تقديم طلب مراجعة جديد.`,
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

/** موافقة المدير على الطلب + إغلاق متابعة معلّقة إن وُجدت */
export async function approveLegalReviewWithFollowup(reviewId: number, reviewer: Actor, reviewNotes?: string) {
  const review = await db.getLegalReviewById(reviewId);
  if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });

  await db.updateLegalReview(reviewId, { status: "completed", reviewNotes: reviewNotes ?? null });

  if (review.followupStatus === "pending_approval") {
    return approveLegalReviewFollowup(reviewId, reviewer);
  }

  await healStuckFollowupIfEligible(reviewId);

  const afterHeal = await db.getLegalReviewById(reviewId);
  if (
    afterHeal?.relatedCaseId
    && afterHeal.followupStatus !== "approved"
    && ["awaiting_submission", "pending_approval"].includes(afterHeal.followupStatus ?? "")
  ) {
    await syncLegalReviewFollowupAfterCaseUpdate(afterHeal.relatedCaseId, {
      submittedBy: followupRecipientId(afterHeal) ?? undefined,
      approvedBy: reviewer.id,
    });
  }

  const recipientId = followupRecipientId(review);
  if (recipientId) {
    await db.createNotification({
      userId: recipientId,
      title: "تمت الموافقة على طلب المراجعة",
      message: `تمت الموافقة على طلب المراجعة "${review.title}"`,
      type: "legal_review",
      relatedId: reviewId,
    });
  }
  await addLegalReviewTrail(reviewId, "approved", reviewer, reviewNotes);
  await db.logActivity({
    userId: reviewer.id,
    username: reviewer.username,
    action: "approve_legal_review",
    details: `الموافقة على طلب مراجعة رقم ${reviewId}`,
  });
  return { success: true as const };
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
