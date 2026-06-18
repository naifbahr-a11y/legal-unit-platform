import * as legalReviewFollowupService from "./legalReviewFollowupService";

export async function scheduleLegalReviewFollowupReminders() {
  const result = await legalReviewFollowupService.runLegalReviewFollowupReminders();
  if (result.sent > 0) {
    console.log(`[LegalReviewFollowup] sent ${result.sent} reminder(s)`);
  }
  return result;
}
