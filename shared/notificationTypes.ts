/** أنواع الإشعارات ومساراتها */
export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  pending_approval: "طلب موافقة",
  submission_received: "تأكيد استلام",
  approval_result: "نتيجة موافقة",
  expiry_alert: "انتهاء قضية",
  deadline_alert: "موعد نهائي",
  correspondence: "مراسلة رسمية",
  correspondence_assigned: "إحالة مراسلة",
  legal_review: "طلب مراجعة",
  legal_review_followup: "متابعة مراجعة",
  legal_review_followup_pending: "موافقة متابعة مراجعة",
  appointment_reminder: "تذكير موعد",
  system: "نظام",
  info: "معلومة",
};

export const NOTIFICATION_TYPE_OPTIONS = Object.entries(NOTIFICATION_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function getNotificationLink(
  type: string | null | undefined,
  relatedId?: number | null,
  options?: { isPrivileged?: boolean },
): string | null {
  const correspondencePath = options?.isPrivileged === false
    ? "/correspondence-assignments"
    : "/correspondence";
  if (type === "pending_approval" && relatedId) return `/pending?id=${relatedId}`;
  if (type === "pending_approval") return "/pending";
  if (type === "submission_received" && relatedId) return `/pending?id=${relatedId}`;
  if (type === "submission_received") return "/pending";
  if (type === "approval_result" && relatedId) return `/pending?id=${relatedId}`;
  if (type === "approval_result") return "/pending";
  if (type === "expiry_alert" && relatedId) return `/cases/${relatedId}`;
  if (type === "deadline_alert" && relatedId) return `${correspondencePath}?id=${relatedId}`;
  if (type === "deadline_alert") return correspondencePath;
  if (type === "correspondence_assigned" && relatedId) return `${correspondencePath}?id=${relatedId}`;
  if (type === "correspondence_assigned") return correspondencePath;
  if (type === "correspondence" && relatedId) return `${correspondencePath}?id=${relatedId}`;
  if (type === "correspondence") return correspondencePath;
  if (type === "legal_review" && relatedId) return `/legal-reviews?id=${relatedId}`;
  if (type === "legal_review") return "/legal-reviews";
  if (type === "legal_review_followup" && relatedId) return `/legal-reviews?id=${relatedId}`;
  if (type === "legal_review_followup_pending" && relatedId) return `/legal-reviews?id=${relatedId}`;
  if (type === "appointment_reminder" && relatedId) return `/appointments?id=${relatedId}`;
  if (type === "appointment_reminder") return "/appointments";
  return null;
}
