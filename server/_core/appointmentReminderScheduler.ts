import * as appointmentReminderService from "./appointmentReminderService";

export async function scheduleAppointmentReminders() {
  const result = await appointmentReminderService.runAppointmentReminders();
  if (result.sent > 0 || result.completed > 0) {
    console.log(
      `[AppointmentReminders] sent ${result.sent}, auto-completed ${result.completed}`,
    );
  }
  return result;
}
