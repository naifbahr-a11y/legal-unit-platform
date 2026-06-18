import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as authz from "./authorization";
import * as caseService from "./caseService";

const EMPLOYEE_WRITABLE = [
  "title", "appointmentDate", "appointmentTime", "appointmentType",
  "caseId", "caseNumber", "location", "reminderBefore", "notes", "status",
] as const;

type AppointmentUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
};

export async function resolveCaseFields(
  caseId?: number | null,
  user?: authz.AuthUser & { permissions?: unknown },
) {
  if (!caseId) return { caseId: undefined as number | undefined, caseNumber: undefined as string | undefined };
  const caseData = user
    ? await caseService.assertCaseAccess(user, caseId)
    : await db.getCaseById(caseId);
  if (!caseData) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "القضية غير موجودة" });
  }
  return { caseId, caseNumber: caseData.caseNumber ?? undefined };
}

export async function resolveEmployeeFields(
  user: AppointmentUser,
  input: { employee?: string; employeeId?: number },
) {
  if (!authz.hasPrivilegedAccess(user)) {
    return {
      employee: user.displayName ?? user.username,
      employeeId: user.id,
    };
  }
  if (input.employeeId) {
    const target = await db.getUserById(input.employeeId);
    if (!target) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف غير موجود" });
    return {
      employee: target.displayName ?? target.username,
      employeeId: target.id,
    };
  }
  if (input.employee?.trim()) {
    const allUsers = await db.getAllUsers();
    const target = allUsers.find(
      (u) => u.displayName === input.employee || u.username === input.employee,
    );
    return {
      employee: input.employee.trim(),
      employeeId: target?.id ?? null,
    };
  }
  return {
    employee: user.displayName ?? user.username,
    employeeId: user.id,
  };
}

export function employeeNameForConflict(
  user: AppointmentUser,
  formEmployee?: string,
): string {
  if (authz.hasPrivilegedAccess(user) && formEmployee?.trim()) {
    return formEmployee.trim();
  }
  return user.displayName ?? user.username;
}

export function assertEmployeeScheduleAccess(
  user: AppointmentUser,
  employeeName: string,
  employeeId?: number | null,
) {
  if (authz.hasPrivilegedAccess(user)) return;
  const name = user.displayName ?? user.username;
  if (employeeName === name) return;
  if (employeeId != null && employeeId === user.id) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح بعرض جدول هذا الموظف" });
}

export async function prepareAppointmentCreate(
  user: AppointmentUser,
  input: Record<string, unknown>,
) {
  const caseFields = await resolveCaseFields(input.caseId as number | undefined, user);
  const employeeFields = await resolveEmployeeFields(user, {
    employee: input.employee as string | undefined,
    employeeId: input.employeeId as number | undefined,
  });
  return {
    title: input.title,
    appointmentDate: input.appointmentDate,
    appointmentTime: input.appointmentTime || null,
    appointmentType: input.appointmentType || null,
    location: input.location || null,
    reminderBefore: input.reminderBefore || "1h",
    notes: input.notes || null,
    status: "upcoming" as const,
    reminderSent: 0,
    createdBy: user.id,
    ...caseFields,
    ...employeeFields,
  };
}

export function sanitizeAppointmentUpdate(
  user: AppointmentUser,
  input: Record<string, unknown>,
  existing: { appointmentDate?: string | null; appointmentTime?: string | null; reminderBefore?: string | null },
) {
  const out: Record<string, unknown> = {};
  if (authz.hasPrivilegedAccess(user)) {
    for (const key of Object.keys(input)) {
      if (key !== "id") out[key] = input[key];
    }
  } else {
    for (const key of EMPLOYEE_WRITABLE) {
      if (input[key] !== undefined) out[key] = input[key];
    }
  }

  if (
    out.appointmentDate !== undefined
    || out.appointmentTime !== undefined
    || out.reminderBefore !== undefined
  ) {
    const nextDate = (out.appointmentDate ?? existing.appointmentDate) as string;
    const nextTime = (out.appointmentTime ?? existing.appointmentTime) as string | null;
    const nextReminder = (out.reminderBefore ?? existing.reminderBefore) as string | null;
    if (
      nextDate !== existing.appointmentDate
      || nextTime !== existing.appointmentTime
      || nextReminder !== existing.reminderBefore
    ) {
      out.reminderSent = 0;
    }
  }

  return out;
}
