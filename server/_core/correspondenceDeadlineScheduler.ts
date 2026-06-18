import * as db from "../db";
import * as correspondenceService from "./correspondenceService";
import { notifyUserByTelegram } from "../telegram";

/** تذكيرات المواعيد النهائية للمراسلات + تحديث الحالة إلى متأخر */
export async function runCorrespondenceDeadlineReminders() {
  await db.markOverdueCorrespondenceDelayed();

  const alerts = await db.getCorrespondenceDeadlineAlerts();
  let sent = 0;

  for (const item of alerts) {
    const userId = await correspondenceService.resolveUserIdByEmployeeName(item.employee);
    if (!userId) continue;

    const message = `الكتاب "${item.subject || item.bookNumber || item.autoNumber || `#${item.id}`}" موعده النهائي ${item.deadline} (باقي يوم أو يومان)`;

    await db.createNotificationOncePerDay({
      userId,
      title: "تنبيه: موعد نهائي قريب للمراسلة",
      message,
      type: "deadline_alert",
      relatedId: item.id,
    });

    await notifyUserByTelegram(userId, `⏰ موعد نهائي للمراسلة\n${message}`);
    sent++;
  }

  return { sent, checked: alerts.length };
}

export async function scheduleCorrespondenceDeadlineReminders() {
  const result = await runCorrespondenceDeadlineReminders();
  if (result.sent > 0) {
    console.log(`[CorrespondenceDeadlines] sent ${result.sent} reminder(s)`);
  }
  return result;
}
