import * as db from "../db";
import { notifyUserByTelegram } from "../telegram";

function reminderMs(value?: string | null): number {
  if (value === "1w") return 7 * 24 * 60 * 60 * 1000;
  if (value === "1d") return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function appointmentDateTime(date: string, time?: string | null): Date {
  if (time?.trim()) return new Date(`${date}T${time}`);
  return new Date(`${date}T09:00:00`);
}

function formatWhen(date: string, time?: string | null): string {
  return time?.trim() ? `${date} الساعة ${time}` : date;
}

async function resolveUserId(
  employeeId?: number | null,
  employeeName?: string | null,
): Promise<number | null> {
  if (employeeId) return employeeId;
  if (!employeeName?.trim()) return null;
  const users = await db.getAllUsers();
  const match = users.find(
    (u) => u.displayName === employeeName || u.username === employeeName,
  );
  return match?.id ?? null;
}

/** إرسال تذكيرات المواعيد القادمة */
export async function runAppointmentReminders() {
  const candidates = await db.getAppointmentsNeedingReminder();
  const now = Date.now();
  let sent = 0;

  for (const appt of candidates) {
    const apptTime = appointmentDateTime(appt.appointmentDate, appt.appointmentTime).getTime();
    if (apptTime <= now) continue;

    const remindAt = apptTime - reminderMs(appt.reminderBefore);
    if (now < remindAt) continue;

    const userId = await resolveUserId(appt.employeeId, appt.employee);
    if (!userId) continue;

    const when = formatWhen(appt.appointmentDate, appt.appointmentTime);
    const location = appt.location ? ` — ${appt.location}` : "";
    const caseLabel = appt.caseNumber ? ` (قضية ${appt.caseNumber})` : "";
    const message = `موعد "${appt.title}"${caseLabel} في ${when}${location}`;

    await db.createNotificationOncePerDay({
      userId,
      title: "تذكير بموعد قادم",
      message,
      type: "appointment_reminder",
      relatedId: appt.id,
    });

    await notifyUserByTelegram(userId, `🔔 تذكير بموعد\n${message}`);

    await db.updateAppointment(appt.id, { reminderSent: 1 });
    sent++;
  }

  const completed = await db.autoCompletePastAppointments();
  return { sent, completed, checked: candidates.length };
}
