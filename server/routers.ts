import { COOKIE_NAME, PLATFORM_GOVERNORATE } from "@shared/const";
import { defaultLegalEmployeePermissions, canAccessSection } from "@shared/userPermissions";
import { hasFullAccess } from "@shared/userRoles";
import { prepareGenericTableData, isPropertyTable } from "@shared/tableRecordUtils";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { authenticateLocalUser } from "./_core/authService";
import { PASSWORD_MIN_LENGTH, validatePasswordStrength, verifyPassword } from "./_core/password";
import * as authz from "./_core/authorization";
import * as caseService from "./_core/caseService";
import * as attachmentAccess from "./_core/attachmentAccess";
import { bindUploadedFile, extractStorageKeyFromUrl, bindUploadedFileFromUrl } from "./_core/storageAccess";
import { submitPendingOperation } from "./_core/pendingNotifications";
import * as pendingService from "./_core/pendingService";
import * as legalReviewService from "./_core/legalReviewService";
import * as legalReviewFollowupService from "./_core/legalReviewFollowupService";
import * as appointmentService from "./_core/appointmentService";
import * as appointmentReminderService from "./_core/appointmentReminderService";
import * as correspondenceService from "./_core/correspondenceService";
import * as correspondenceDeadlineScheduler from "./_core/correspondenceDeadlineScheduler";

const appointmentInputSchema = z.object({
  title: z.string().min(1),
  appointmentDate: z.string().min(1),
  appointmentTime: z.string().optional(),
  appointmentType: z.string().optional(),
  caseId: z.number().optional(),
  caseNumber: z.string().optional(),
  location: z.string().optional(),
  employee: z.string().optional(),
  employeeId: z.number().optional(),
  reminderBefore: z.string().optional(),
  notes: z.string().optional(),
});

const appointmentUpdateSchema = appointmentInputSchema.partial().extend({
  id: z.number(),
  status: z.enum(["upcoming", "completed", "cancelled"]).optional(),
});

async function notifyPrivilegedUsers(title: string, message: string, type: string) {
  const allUsers = await db.getAllUsers();
  for (const u of allUsers) {
    if (hasFullAccess(u.role)) {
      await db.createNotification({ userId: u.id, title, message, type });
    }
  }
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        let user = await authenticateLocalUser(ctx.req, input.username, input.password);
        user = (await db.getUserById(user.id)) ?? user;
        await db.updateUserLastSignIn(user.id);
        // Log activity
        await db.logActivity({ userId: user.id, username: user.username, action: "login", details: "تسجيل دخول" });
        // Auto-check for expiring cases and send notifications
        await db.checkAndNotifyExpiringCases(user.id, user.displayName);
        const token = await sdk.createSessionToken(
          user.id,
          user.username,
          user.role,
          Number(user.tokenVersion ?? 0),
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: sdk.getSessionMaxAgeMs() });
        return {
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            mustChangePassword: Number(user.mustChangePassword) === 1,
          },
        };
      }),
    changePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(PASSWORD_MIN_LENGTH) }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.getUserById(ctx.user!.id);
        if (!user) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "المستخدم غير موجود" });
        }
        const current = await verifyPassword(input.currentPassword, user.password);
        if (!current.valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "كلمة المرور الحالية غير صحيحة" });
        }
        const strengthError = validatePasswordStrength(input.newPassword);
        if (strengthError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: strengthError });
        }
        await db.updateUserPassword(ctx.user!.id, input.newPassword, { clearMustChange: true, bumpToken: true });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "change_password", details: "تغيير كلمة المرور" });
        return { success: true };
      }),
  }),

  // User management
  users: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!authz.hasPrivilegedAccess(ctx.user!)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح بعرض قائمة الموظفين" });
      }
      return db.getActiveUserPicklist();
    }),
    listFull: adminProcedure.query(async () => db.getAllUsers()),
    getDetail: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const user = await db.getUserById(input.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
        const { password: _, ...safe } = user;
        const activity = await db.getUserActivityLog(input.id, 30);
        const stats = await db.getUserRecordStats(input.id, user.displayName);
        return { user: safe, activity, stats };
      }),
    exportCsv: adminProcedure.query(async () => {
      const rows = await db.getAllUsers();
      const header = "id,username,displayName,role,branch,active,lastSignedIn,specialization,jobTitle,phone";
      const lines = rows.map((u: any) => [
        u.id, u.username, `"${(u.displayName || "").replace(/"/g, '""')}"`, u.role,
        u.branch || "", Number(u.active) !== 0 ? "active" : "disabled",
        u.lastSignedIn ? new Date(u.lastSignedIn).toISOString() : "",
        `"${(u.specialization || "").replace(/"/g, '""')}"`,
        `"${(u.jobTitle || "").replace(/"/g, '""')}"`, u.phone || "",
      ].join(","));
      return { csv: [header, ...lines].join("\n") };
    }),
    create: adminProcedure
      .input(z.object({
        username: z.string().min(2).max(64),
        password: z.string().min(PASSWORD_MIN_LENGTH),
        displayName: z.string().min(2).max(128),
        role: z.enum(["user", "admin", "supervisor"]),
        specialization: z.string().max(128).optional(),
        jobTitle: z.string().max(128).optional(),
        phone: z.string().max(32).optional(),
        branch: z.string().max(128).optional(),
        permissions: z.record(z.string(), z.boolean()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const strength = validatePasswordStrength(input.password);
        if (strength) throw new TRPCError({ code: "BAD_REQUEST", message: strength });
        const existing = await db.getUserByUsername(input.username);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم موجود مسبقاً" });
        const perms = input.role === "user"
          ? (input.permissions ?? defaultLegalEmployeePermissions())
          : undefined;
        await db.createUser({
          ...input,
          permissions: perms,
          mustChangePassword: true,
        });
        await db.logActivity({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "create_user",
          details: `إنشاء مستخدم: ${input.displayName} (${input.username}) — ${input.role}`,
        });
        return { success: true };
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        displayName: z.string().min(2).max(128).optional(),
        role: z.enum(["user", "admin", "supervisor"]).optional(),
        specialization: z.string().max(128).optional(),
        jobTitle: z.string().max(128).optional(),
        phone: z.string().max(32).optional(),
        branch: z.string().max(128).optional(),
        permissions: z.record(z.string(), z.boolean()).optional(),
        active: z.number().min(0).max(1).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const target = await db.getUserById(id);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

        const demotingPrivileged =
          data.role === "user" && (target.role === "admin" || target.role === "supervisor");
        if (demotingPrivileged) {
          const others = await db.countPrivilegedUsers(id);
          if (others === 0) {
            throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن إزالة آخر مدير/إداري في النظام" });
          }
        }

        const updateData: Record<string, unknown> = {};
        if (data.displayName !== undefined) {
          updateData.displayName = data.displayName;
          updateData.name = data.displayName;
        }
        if (data.role !== undefined) updateData.role = data.role;
        if (data.specialization !== undefined) updateData.specialization = data.specialization;
        if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle;
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.branch !== undefined) updateData.branch = data.branch;
        if (data.active !== undefined) updateData.active = data.active;
        if (data.permissions !== undefined && (data.role === "user" || target.role === "user")) {
          updateData.permissions = data.permissions;
        }
        if (data.role === "admin" || data.role === "supervisor") {
          updateData.permissions = null;
        }

        if (data.displayName && data.displayName !== target.displayName) {
          await db.syncEmployeeDisplayName(id, target.displayName, data.displayName);
        }

        await db.updateUser(id, updateData as any);

        if (data.active === 0) {
          await db.incrementUserTokenVersion(id);
        }

        await db.logActivity({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "update_user",
          details: `تحديث مستخدم: ${target.displayName} (#${id})`,
        });
        return { success: true };
      }),
    resetPassword: adminProcedure
      .input(z.object({ id: z.number(), newPassword: z.string().min(PASSWORD_MIN_LENGTH) }))
      .mutation(async ({ input, ctx }) => {
        const strength = validatePasswordStrength(input.newPassword);
        if (strength) throw new TRPCError({ code: "BAD_REQUEST", message: strength });
        const target = await db.getUserById(input.id);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
        await db.updateUser(input.id, { mustChangePassword: 1 } as any);
        await db.updateUserPassword(input.id, input.newPassword, { clearMustChange: false, bumpToken: true });
        await db.logActivity({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "reset_user_password",
          details: `إعادة تعيين كلمة مرور: ${target.displayName}`,
        });
        return { success: true };
      }),
  }),

  // Cases
  cases: router({
    list: protectedProcedure
      .input(z.object({
        types: z.array(z.string()).optional(),
        employees: z.array(z.string()).optional(),
        search: z.string().optional(),
        authorities: z.array(z.string()).optional(),
        damageStatuses: z.array(z.string()).optional(),
        currencies: z.array(z.string()).optional(),
        caseStatuses: z.array(z.string()).optional(),
        provinces: z.array(z.string()).optional(),
        branches: z.array(z.string()).optional(),
        caseReceivedFrom: z.string().optional(),
        caseReceivedTo: z.string().optional(),
        lastFollowupFrom: z.string().optional(),
        lastFollowupTo: z.string().optional(),
        expiryFrom: z.string().optional(),
        expiryTo: z.string().optional(),
        includeArchived: z.boolean().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(200).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "cases");
        const filters = input ?? {};
        if (!authz.canViewAllCases(ctx.user!)) {
          return db.getCasesList({ ...filters, employees: [authz.employeeName(ctx.user!)] });
        }
        return db.getCasesList(filters);
      }),
    employees: protectedProcedure.query(async ({ ctx }) => {
      authz.assertSectionAccess(ctx.user!, "cases");
      const fromCases = await db.getCaseEmployees(
        authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!),
      );
      if (authz.hasPrivilegedAccess(ctx.user!)) {
        const picklist = await db.getActiveUserPicklist();
        const fromUsers = picklist.map((u) => u.displayName).filter(Boolean);
        return [...new Set([...fromUsers, ...fromCases])].sort((a, b) => a.localeCompare(b, "ar"));
      }
      return fromCases.sort((a, b) => a.localeCompare(b, "ar"));
    }),
    checkDuplicate: protectedProcedure
      .input(z.object({ caseNumber: z.string(), excludeId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "cases");
        authz.assertSectionWrite(ctx.user!, "cases");
        const dup = await db.findDuplicateCase(input.caseNumber, input.excludeId);
        if (!dup) return { duplicate: false };
        if (!authz.canViewAllCases(ctx.user!)) {
          const emp = authz.employeeName(ctx.user!);
          const owns =
            dup.employee === emp ||
            (dup.createdBy != null && dup.createdBy === ctx.user!.id);
          if (!owns) return { duplicate: false };
        }
        return { duplicate: true, id: dup.id, subject: dup.subject };
      }),
    authorities: protectedProcedure
      .query(async ({ ctx }) => {
        authz.assertSectionAccess(ctx.user!, "cases");
        const db2 = await db.getDb();
        if (!db2) return [];
        const { cases: casesTable } = await import('../drizzle/schema');
        const { sql: sqlFn } = await import('drizzle-orm');
        if (authz.canViewAllCases(ctx.user!)) {
          const rows = await db2.execute(sqlFn`SELECT DISTINCT authority FROM cases WHERE authority IS NOT NULL AND authority != '' AND (archived = 0 OR archived IS NULL) ORDER BY authority`);
          return (rows[0] as unknown as any[]).map((r: any) => r.authority as string);
        }
        const rows = await db2.execute(sqlFn`SELECT DISTINCT authority FROM cases WHERE authority IS NOT NULL AND authority != '' AND employee = ${authz.employeeName(ctx.user!)} AND (archived = 0 OR archived IS NULL) ORDER BY authority`);
        return (rows[0] as unknown as any[]).map((r: any) => r.authority as string);
      }),
    create: protectedProcedure
      .input(z.object({
        type: z.string(), employee: z.string(), caseNumber: z.string().optional(),
        investigationNumber: z.string().optional(), subject: z.string().optional(),
        complainant: z.string().optional(), accused: z.string().optional(),
        authority: z.string().optional(), damage: z.string().optional(),
        lastActions: z.string().optional(), caseStatus: z.string().optional(),
        documentation: z.string().optional(), caseReceived: z.string().optional(),
        lastFollowup: z.string().optional(), expiry: z.string().optional(),
        remainingDays: z.string().optional(), branch: z.string().optional(),
        province: z.string().optional(), city: z.string().optional(),
        currency: z.enum(["IQD", "USD", "both"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "cases");
        await caseService.checkDuplicateCaseNumber(input.caseNumber);
        const payload = caseService.prepareCaseData({ ...input }, ctx.user!);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "create_case", details: `إضافة قضية: ${input.subject || input.caseNumber}` });
        if (authz.hasPrivilegedAccess(ctx.user!)) {
          await db.insertCase({ ...payload, createdBy: ctx.user!.id });
          return { success: true, pending: false };
        }
        await submitPendingOperation({
          tableName: "cases",
          operationType: "add",
          data: { ...payload, createdBy: ctx.user!.id },
          submittedBy: ctx.user!.id,
          submittedByName: ctx.user!.displayName ?? ctx.user!.username,
          detail: String(input.subject || input.caseNumber || ""),
        });
        await notifyOwner({ title: "عملية معلقة جديدة", content: `قام ${ctx.user!.displayName} بإرسال طلب إضافة قضية جديدة بعنوان: ${input.subject || input.caseNumber}` }).catch(() => {});
        return { success: true, pending: true };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "cases");
        const original = await caseService.assertCaseAccess(ctx.user!, input.id);
        if (input.data.caseNumber) {
          await caseService.checkDuplicateCaseNumber(String(input.data.caseNumber), input.id);
        }
        const safeData = caseService.prepareCaseData(input.data, ctx.user!);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "update_case", details: `تعديل قضية رقم ${input.id}` });
        if (authz.hasPrivilegedAccess(ctx.user!)) {
          await db.updateCase(input.id, safeData);
          await caseService.auditCaseChange(ctx.user!, "update", input.id, "تعديل قضية", original as any, safeData);
          if (Object.prototype.hasOwnProperty.call(safeData, "lastActions")) {
            await legalReviewFollowupService.syncLegalReviewFollowupAfterCaseUpdate(input.id, {
              approvedBy: ctx.user!.id,
              force: true,
            });
          }
          return { success: true, pending: false };
        }
        const changedData: Record<string, any> = {};
        for (const [key, newVal] of Object.entries(safeData)) {
          const origVal = original ? (original as any)[key] : undefined;
          if (String(newVal ?? "") !== String(origVal ?? "")) {
            changedData[key] = newVal;
          }
        }
        await submitPendingOperation({
          tableName: "cases",
          recordId: input.id,
          operationType: "edit",
          data: changedData,
          submittedBy: ctx.user!.id,
          submittedByName: ctx.user!.displayName ?? ctx.user!.username,
          detail: `قضية #${input.id}`,
        });
        await notifyOwner({ title: "عملية معلقة جديدة", content: `قام ${ctx.user!.displayName} بإرسال طلب تعديل قضية` }).catch(() => {});
        return { success: true, pending: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "cases");
        const original = await caseService.assertCaseAccess(ctx.user!, input.id);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "delete_case", details: `حذف قضية رقم ${input.id}` });
        if (authz.hasPrivilegedAccess(ctx.user!)) {
          await db.deleteCase(input.id);
          await caseService.auditCaseChange(ctx.user!, "delete", input.id, "حذف قضية", original as any, null);
          return { success: true, pending: false };
        }
        await submitPendingOperation({
          tableName: "cases",
          recordId: input.id,
          operationType: "delete",
          data: {},
          submittedBy: ctx.user!.id,
          submittedByName: ctx.user!.displayName ?? ctx.user!.username,
          detail: `قضية #${input.id}`,
        });
        await notifyOwner({ title: "عملية معلقة جديدة", content: `قام ${ctx.user!.displayName} بإرسال طلب حذف قضية` }).catch(() => {});
        return { success: true, pending: true };
      }),
    archive: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "cases");
        if (!authz.canArchiveCases(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك أرشفة القضايا" });
        }
        const original = await caseService.assertCaseAccess(ctx.user!, input.id);
        await db.archiveCase(input.id);
        await caseService.auditCaseChange(ctx.user!, "archive", input.id, "أرشفة قضية", original as any, { archived: true });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "archive_case", details: `أرشفة قضية رقم ${input.id}` });
        return { success: true };
      }),
    reassign: adminProcedure
      .input(z.object({ id: z.number(), newEmployee: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const caseData = await db.getCaseById(input.id);
        if (!caseData) throw new TRPCError({ code: "NOT_FOUND", message: "القضية غير موجودة" });
        const allUsers = await db.getAllUsers();
        const targetUser = allUsers.find(u => u.displayName === input.newEmployee);
        if (!targetUser) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف غير موجود في النظام" });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "reassign_case", details: `تدوير قضية ${caseData.caseNumber} من ${caseData.employee} إلى ${input.newEmployee}` });
        await db.updateCase(input.id, { employee: input.newEmployee });
        await caseService.auditCaseChange(ctx.user!, "reassign", input.id, `تدوير إلى ${input.newEmployee}`, caseData as any, { employee: input.newEmployee });
        await db.createNotification({
          userId: targetUser.id,
          title: "قضية جديدة موكلة إليك",
          message: `تم تحويل القضية ${caseData.caseNumber || caseData.subject} إليك من قبل المدير`,
          type: "info",
        });
        return { success: true };
      }),
    transfer: protectedProcedure
      .input(z.object({ id: z.number(), newType: z.string() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "cases");
        const caseData = await caseService.assertCaseAccess(ctx.user!, input.id);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "transfer_case", details: `تحويل قضية ${caseData.caseNumber} من ${caseData.type} إلى ${input.newType}` });
        if (authz.hasPrivilegedAccess(ctx.user!)) {
          await db.updateCase(input.id, { type: input.newType });
          await caseService.auditCaseChange(ctx.user!, "transfer", input.id, `تحويل النوع إلى ${input.newType}`, caseData as any, { type: input.newType });
          return { success: true, pending: false };
        }
        await submitPendingOperation({
          tableName: "cases",
          recordId: input.id,
          operationType: "edit",
          data: { type: input.newType },
          submittedBy: ctx.user!.id,
          submittedByName: ctx.user!.displayName ?? ctx.user!.username,
          detail: `تحويل من ${caseData.type} إلى ${input.newType}`,
        });
        await notifyOwner({ title: "عملية معلقة جديدة", content: `قام ${ctx.user!.displayName} بطلب تحويل قضية من ${caseData.type} إلى ${input.newType}` }).catch(() => {});
        return { success: true, pending: true };
      }),
      // تقرير القضايا ذات الضرر
    damageReport: protectedProcedure
      .query(async ({ ctx }) => {
        if (!authz.canAccessCaseReports(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك عرض التقارير" });
        }
        const db2 = await db.getDb();
        if (!db2) return { cases: [], totalIQD: 0, totalUSD: 0 };
        const { cases: casesTable } = await import('../drizzle/schema');
        const { sql: sqlFn } = await import('drizzle-orm');
        let rows: any[];
        if (!authz.canViewAllCases(ctx.user!)) {
          rows = await db2.select().from(casesTable)
            .where(sqlFn`${casesTable.damage} IS NOT NULL AND ${casesTable.damage} != '' AND ${casesTable.damage} REGEXP '[0-9]' AND ${casesTable.employee} = ${ctx.user!.displayName} AND (${casesTable.archived} = 0 OR ${casesTable.archived} IS NULL)`)
            .limit(500);
        } else {
          rows = await db2.select().from(casesTable)
            .where(sqlFn`${casesTable.damage} IS NOT NULL AND ${casesTable.damage} != '' AND ${casesTable.damage} REGEXP '[0-9]' AND (${casesTable.archived} = 0 OR ${casesTable.archived} IS NULL)`)
            .limit(500);
        }
        let totalIQD = 0, totalUSD = 0;
        for (const r of rows) {
          const num = parseFloat(String(r.damage ?? '').replace(/,/g, ''));
          if (!isNaN(num)) {
            if (r.currency === 'USD') totalUSD += num;
            else if (r.currency === 'both') { totalIQD += num; totalUSD += num; }
            else totalIQD += num;
          }
        }
        return { cases: rows, totalIQD, totalUSD };
      }),
    // تقرير القضايا المقامة من المصرف ضد الغير
    bankAsComplainantReport: protectedProcedure
      .query(async ({ ctx }) => {
        if (!authz.canAccessCaseReports(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك عرض التقارير" });
        }
        const db2 = await db.getDb();
        if (!db2) return [];
        const { cases: casesTable } = await import('../drizzle/schema');
        const { sql: sqlFn } = await import('drizzle-orm');
        if (!authz.canViewAllCases(ctx.user!)) {
          return db2.select().from(casesTable)
            .where(sqlFn`(${casesTable.complainant} LIKE '%مصرف%' OR ${casesTable.complainant} LIKE '%الرافدين%') AND ${casesTable.employee} = ${ctx.user!.displayName} AND (${casesTable.archived} = 0 OR ${casesTable.archived} IS NULL)`)
            .limit(500);
        }
        return db2.select().from(casesTable)
          .where(sqlFn`(${casesTable.complainant} LIKE '%مصرف%' OR ${casesTable.complainant} LIKE '%الرافدين%') AND (${casesTable.archived} = 0 OR ${casesTable.archived} IS NULL)`)
          .limit(500);
      }),
    // تقرير القضايا المقامة من الغير ضد المصرف
    bankAsAccusedReport: protectedProcedure
      .query(async ({ ctx }) => {
        if (!authz.canAccessCaseReports(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك عرض التقارير" });
        }
        const db2 = await db.getDb();
        if (!db2) return [];
        const { cases: casesTable } = await import('../drizzle/schema');
        const { sql: sqlFn } = await import('drizzle-orm');
        if (!authz.canViewAllCases(ctx.user!)) {
          return db2.select().from(casesTable)
            .where(sqlFn`(${casesTable.accused} LIKE '%مصرف%' OR ${casesTable.accused} LIKE '%الرافدين%') AND ${casesTable.employee} = ${ctx.user!.displayName} AND (${casesTable.archived} = 0 OR ${casesTable.archived} IS NULL)`)
            .limit(500);
        }
        return db2.select().from(casesTable)
          .where(sqlFn`(${casesTable.accused} LIKE '%مصرف%' OR ${casesTable.accused} LIKE '%الرافدين%') AND (${casesTable.archived} = 0 OR ${casesTable.archived} IS NULL)`)
          .limit(500);
      }),
  }),
  // Generic table data
  tableData: router({
    list: protectedProcedure
      .input(z.object({ tableName: z.string() }))
      .query(async ({ input, ctx }) => {
        authz.assertAllowedTableName(input.tableName);
        authz.assertTableAccess(ctx.user!, input.tableName);
        const filters = authz.scopeEmployeeFilter(ctx.user!);
        return db.getTableRecords(input.tableName, filters);
      }),
    listPaged: protectedProcedure
      .input(z.object({
        tableName: z.string(),
        page: z.number().optional(),
        pageSize: z.number().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        authz.assertAllowedTableName(input.tableName);
        authz.assertTableAccess(ctx.user!, input.tableName);
        const filters = authz.scopeEmployeeFilter(ctx.user!, { search: input.search });
        return db.getTableRecordsPaged(input.tableName, { ...filters, page: input.page, pageSize: input.pageSize });
      }),
    create: protectedProcedure
      .input(z.object({ tableName: z.string(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ input, ctx }) => {
        authz.assertAllowedTableName(input.tableName);
        authz.assertTableAccess(ctx.user!, input.tableName);
        authz.assertTableWrite(ctx.user!, input.tableName);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "create_record", details: `إضافة سجل في ${input.tableName}` });
        const prepared = prepareGenericTableData(input.tableName, authz.sanitizeWritableData(input.data), ctx.user!);
        if (isPropertyTable(input.tableName)) {
          const num = String(prepared.propertyNumber ?? "").trim();
          if (num && await db.propertyNumberExists(input.tableName, num)) {
            throw new TRPCError({ code: "CONFLICT", message: "رقم العقار مسجّل مسبقاً في النظام" });
          }
        }
        if (authz.hasPrivilegedAccess(ctx.user!)) {
          await db.insertTableRecord(input.tableName, { ...prepared, createdBy: ctx.user!.id });
          return { success: true, pending: false };
        } else {
          await submitPendingOperation({
            tableName: input.tableName,
            operationType: "add",
            data: { ...prepared, createdBy: ctx.user!.id, employee: prepared.employee ?? ctx.user!.displayName },
            submittedBy: ctx.user!.id,
            submittedByName: ctx.user!.displayName ?? ctx.user!.username,
          });
          await notifyOwner({ title: "عملية معلقة جديدة", content: `قام ${ctx.user!.displayName} بإرسال طلب إضافة سجل في ${input.tableName}` }).catch(() => {});
          return { success: true, pending: true };
        }
      }),
    update: protectedProcedure
      .input(z.object({ tableName: z.string(), id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ input, ctx }) => {
        authz.assertAllowedTableName(input.tableName);
        authz.assertTableAccess(ctx.user!, input.tableName);
        authz.assertTableWrite(ctx.user!, input.tableName);
        const original = await db.getTableRecord(input.tableName, input.id);
        if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "السجل غير موجود" });
        authz.assertOwnsEmployeeRecord(
          ctx.user!,
          authz.getRecordEmployee(original as Record<string, unknown>),
          undefined,
          authz.getRecordCreatedBy(original as Record<string, unknown>),
        );
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "update_record", details: `تعديل سجل ${input.id} في ${input.tableName}` });
        const safeData = prepareGenericTableData(input.tableName, authz.sanitizeWritableData(input.data), ctx.user!, { isUpdate: true });
        if (isPropertyTable(input.tableName)) {
          const num = String(safeData.propertyNumber ?? (original as any).propertyNumber ?? "").trim();
          if (num && await db.propertyNumberExists(input.tableName, num, input.id)) {
            throw new TRPCError({ code: "CONFLICT", message: "رقم العقار مسجّل مسبقاً في النظام" });
          }
        }
        if (authz.hasPrivilegedAccess(ctx.user!)) {
          await db.updateTableRecord(input.tableName, input.id, safeData);
          return { success: true, pending: false };
        } else {
          // Fetch original and store only changed fields
          const changedData: Record<string, any> = {};
          for (const [key, newVal] of Object.entries(safeData)) {
            const origVal = original ? (original as any)[key] : undefined;
            if (String(newVal ?? "") !== String(origVal ?? "")) {
              changedData[key] = newVal;
            }
          }
          await submitPendingOperation({
            tableName: input.tableName,
            recordId: input.id,
            operationType: "edit",
            data: changedData,
            submittedBy: ctx.user!.id,
            submittedByName: ctx.user!.displayName ?? ctx.user!.username,
            detail: `سجل #${input.id}`,
          });
          await notifyOwner({ title: "عملية معلقة جديدة", content: `قام ${ctx.user!.displayName} بإرسال طلب تعديل سجل في ${input.tableName}` }).catch(() => {});
          return { success: true, pending: true };
        }
      }),
    delete: protectedProcedure
      .input(z.object({ tableName: z.string(), id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertAllowedTableName(input.tableName);
        authz.assertTableAccess(ctx.user!, input.tableName);
        authz.assertTableWrite(ctx.user!, input.tableName);
        const original = await db.getTableRecord(input.tableName, input.id);
        if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "السجل غير موجود" });
        authz.assertOwnsEmployeeRecord(
          ctx.user!,
          authz.getRecordEmployee(original as Record<string, unknown>),
          undefined,
          authz.getRecordCreatedBy(original as Record<string, unknown>),
        );
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "delete_record", details: `حذف سجل ${input.id} من ${input.tableName}` });
        if (authz.hasPrivilegedAccess(ctx.user!)) {
          await db.deleteTableRecord(input.tableName, input.id);
          return { success: true, pending: false };
        } else {
          await submitPendingOperation({
            tableName: input.tableName,
            recordId: input.id,
            operationType: "delete",
            data: {},
            submittedBy: ctx.user!.id,
            submittedByName: ctx.user!.displayName ?? ctx.user!.username,
            detail: `سجل #${input.id}`,
          });
          await notifyOwner({ title: "عملية معلقة جديدة", content: `قام ${ctx.user!.displayName} بإرسال طلب حذف سجل من ${input.tableName}` }).catch(() => {});
          return { success: true, pending: true };
        }
      }),
    bulkDelete: protectedProcedure
      .input(z.object({ tableName: z.string(), ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        authz.assertAllowedTableName(input.tableName);
        authz.assertTableAccess(ctx.user!, input.tableName);
        authz.assertTableWrite(ctx.user!, input.tableName);
        // Non-admin: only allow bulk delete if all records belong to employee
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          for (const id of input.ids) {
            const original = await db.getTableRecord(input.tableName, id);
            if (!original) continue;
            authz.assertOwnsEmployeeRecord(
          ctx.user!,
          authz.getRecordEmployee(original as Record<string, unknown>),
          undefined,
          authz.getRecordCreatedBy(original as Record<string, unknown>),
        );
          }
          for (const id of input.ids) {
            await submitPendingOperation({
              tableName: input.tableName,
              recordId: id,
              operationType: "delete",
              data: {},
              submittedBy: ctx.user!.id,
              submittedByName: ctx.user!.displayName ?? ctx.user!.username,
              detail: `سجل #${id}`,
            });
          }
          await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "bulk_delete_record_request", details: `طلب حذف ${input.ids.length} سجل من ${input.tableName}` });
          return { success: true, pending: true };
        }
        await db.bulkDeleteTableRecords(input.tableName, input.ids);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "bulk_delete_record", details: `حذف ${input.ids.length} سجل من ${input.tableName}` });
        return { success: true, pending: false };
      }),
  }),

  // Pending operations management
  pending: router({
    count: adminProcedure.query(async () => db.getPendingOperationsCount("pending")),
    mySubmissions: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(200).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const result = await db.getPendingOperationsBySubmitter(ctx.user!.id, input?.status, {
          page: input?.page,
          pageSize: input?.pageSize,
        });
        const items = await pendingService.enrichPendingOperations(result.items);
        return { ...result, items };
      }),
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const op = await db.getPendingOperationById(input.id);
        if (!op) throw new TRPCError({ code: "NOT_FOUND", message: "العملية غير موجودة" });
        return pendingService.enrichPendingOperation(op);
      }),
    list: adminProcedure
      .input(z.object({
        status: z.string().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(200).optional(),
      }).optional())
      .query(async ({ input }) => {
        const result = await db.getPendingOperations(input?.status, {
          page: input?.page,
          pageSize: input?.pageSize,
        });
        const items = await pendingService.enrichPendingOperations(result.items);
        return { ...result, items };
      }),
    approve: adminProcedure
      .input(z.object({ id: z.number(), modifiedData: z.record(z.string(), z.any()).optional() }))
      .mutation(async ({ input, ctx }) => {
        return pendingService.approvePendingOperation(input.id, ctx.user!, input.modifiedData);
      }),
    reject: adminProcedure
      .input(z.object({ id: z.number(), note: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        return pendingService.rejectPendingOperation(input.id, ctx.user!, input.note);
      }),
  }),

  // Notifications
  notifications: router({
    list: protectedProcedure
      .input(z.object({ type: z.string().optional(), limit: z.number().max(200).optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.getNotificationsForUser(
          ctx.user!.id,
          authz.employeeName(ctx.user!),
          input?.limit ?? 100,
          input?.type,
        );
      }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return db.getUnreadNotificationCountForUser(ctx.user!.id, authz.employeeName(ctx.user!));
    }),
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const ok = await db.markNotificationRead(input.id, ctx.user!);
        if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك تعديل هذا الإشعار" });
        return { success: true };
      }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await db.markAllNotificationsRead(ctx.user!.id, authz.employeeName(ctx.user!));
      return { success: true };
    }),
    // جلب إشعارات الموظف بالاسم (للمراسلات المُحالة)
    listForEmployee: protectedProcedure
      .input(z.object({ employeeName: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!authz.hasPrivilegedAccess(ctx.user!) && input.employeeName !== ctx.user!.displayName) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك عرض إشعارات موظف آخر" });
        }
        return db.getNotificationsForEmployee(input.employeeName);
      }),
    // إجراء على إشعار مراسلة (قبول/رفض)
    handleCorrespondenceNotification: protectedProcedure
      .input(z.object({ notificationId: z.number(), action: z.enum(['read', 'dismiss']) }))
      .mutation(async ({ input, ctx }) => {
        const ok = await db.markNotificationRead(input.notificationId, ctx.user!);
        if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك تعديل هذا الإشعار" });
        return { success: true };
      }),
    // تنبيه Deadline المراسلات - يُستدعى من الواجهة
    checkDeadlineAlerts: protectedProcedure.mutation(async ({ ctx }) => {
      authz.assertSectionAccess(ctx.user!, "correspondence");
      const employee = !authz.hasPrivilegedAccess(ctx.user!) ? ctx.user!.displayName : undefined;
      const alerts = await db.getCorrespondenceDeadlineAlerts(employee);
      let created = 0;
      for (const item of alerts) {
        const userId = await correspondenceService.resolveUserIdByEmployeeName(item.employee);
        if (!userId) continue;
        await db.createNotificationOncePerDay({
          userId,
          title: "تنبيه: موعد نهائي قريب للمراسلة",
          message: `الكتاب "${item.subject || item.bookNumber || item.autoNumber || "#" + item.id}" موعده النهائي ${item.deadline} (باقي يوم أو يومان)`,
          type: "deadline_alert",
          relatedId: item.id,
        });
        created++;
      }
      return { created };
    }),
    // Send expiry notification to employee
    sendExpiryAlert: adminProcedure
      .input(z.object({ caseId: z.number(), employeeId: z.number() }))
      .mutation(async ({ input }) => {
        const caseData = await db.getCaseById(input.caseId);
        if (!caseData) throw new TRPCError({ code: "NOT_FOUND" });
        await db.createNotification({
          userId: input.employeeId,
          title: "تنبيه: قضية تقترب من الانتهاء",
          message: `القضية رقم ${caseData.caseNumber} - ${caseData.subject} تقترب من تاريخ الانتهاء (${caseData.expiry})`,
          type: "expiry_alert",
          relatedId: input.caseId,
        });
        return { success: true };
      }),
  }),

  // Chat / Meeting Room — للمدير والإداري فقط
  chat: router({
    groupMessages: adminProcedure.query(async ({ ctx }) => {
      await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "view_chat", details: "عرض غرفة الاجتماعات" });
      return db.getChatMessages(null);
    }),
    directMessages: adminProcedure
      .input(z.object({ otherUserId: z.number() }))
      .query(async ({ input, ctx }) => {
        await db.markChatMessagesRead(ctx.user!.id, input.otherUserId);
        return db.getDirectMessages(ctx.user!.id, input.otherUserId);
      }),
    send: adminProcedure
      .input(z.object({ recipientId: z.number().nullable(), message: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.sendChatMessage({
          senderId: ctx.user!.id,
          senderName: ctx.user!.displayName,
          recipientId: input.recipientId,
          message: input.message,
        });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "send_message", details: input.recipientId ? "رسالة خاصة" : "رسالة جماعية" });
        return { success: true };
      }),
    unreadCount: adminProcedure.query(async ({ ctx }) => {
      return db.getUnreadChatCount(ctx.user!.id);
    }),
  }),

  // Dashboard
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      const employee = authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!);
      const submittedBy = authz.hasPrivilegedAccess(ctx.user!) ? undefined : ctx.user!.id;
      return db.getDashboardStats({ province: PLATFORM_GOVERNORATE, employee, submittedBy });
    }),
    enhanced: protectedProcedure
      .input(z.object({ period: z.enum(["week", "month", "year"]).optional() }).optional())
      .query(async ({ input, ctx }) => {
        const employee = authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!);
        const submittedBy = authz.hasPrivilegedAccess(ctx.user!) ? undefined : ctx.user!.id;
        const stats = await db.getEnhancedDashboardStats(input?.period ?? undefined, {
          province: PLATFORM_GOVERNORATE,
          employee,
          submittedBy,
        });
        if (!stats || authz.hasPrivilegedAccess(ctx.user!)) return stats;
        return { ...stats, investigationCount: 0 };
      }),
    employeeRatings: protectedProcedure.query(async ({ ctx }) => {
      authz.assertPrivileged(ctx.user!);
      return db.getEmployeeRatings({ province: PLATFORM_GOVERNORATE });
    }),
    expiringCases: protectedProcedure.query(async ({ ctx }) => {
      const employee = authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!);
      return db.getExpiringCasesSoon({ province: PLATFORM_GOVERNORATE, employee, days: 30, limit: 100 });
    }),
    activityStats: adminProcedure.query(async () => {
      return db.getUserActivityStats();
    }),
    activityLog: adminProcedure
      .input(z.object({
        limit: z.number().max(500).optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(500).optional(),
        action: z.string().optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getActivityLog(input ?? {});
      }),
  }),

  activity: router({
    list: adminProcedure
      .input(z.object({
        limit: z.number().max(500).optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(500).optional(),
        action: z.string().optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional())
      .query(async ({ input }) => db.getActivityLog(input ?? {})),
  }),

  // Audit Log
  audit: router({
    list: adminProcedure
      .input(z.object({
        limit: z.number().max(500).optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(500).optional(),
        tableName: z.string().optional(),
        recordId: z.number().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAuditLog(input ?? undefined);
      }),
  }),

  // Attachments
  attachments: router({
    list: protectedProcedure
      .input(z.object({ caseId: z.number(), tableName: z.string() }))
      .query(async ({ input, ctx }) => {
        await attachmentAccess.assertAttachmentRecordAccess(ctx.user!, input.tableName, input.caseId);
        return db.getAttachments(input.caseId, input.tableName);
      }),
    upload: protectedProcedure
      .input(z.object({
        caseId: z.number(),
        tableName: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileKey: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await attachmentAccess.assertAttachmentRecordAccess(ctx.user!, input.tableName, input.caseId, true);
        bindUploadedFile(ctx.user!.id, input.fileKey, input.fileUrl);
        await db.createAttachment({
          ...input,
          uploadedBy: ctx.user!.id,
          uploadedByName: ctx.user!.displayName,
        });
        await db.createAuditEntry({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "upload",
          tableName: "case_attachments",
          recordId: input.caseId,
          description: `رفع ملف: ${input.fileName}`,
        });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const att = await db.getAttachmentById(input.id);
        if (!att) throw new TRPCError({ code: "NOT_FOUND" });
        await attachmentAccess.assertAttachmentRecordAccess(ctx.user!, att.tableName, att.caseId, true);
        await db.deleteAttachment(input.id);
        await db.createAuditEntry({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "delete",
          tableName: "case_attachments",
          recordId: att.caseId,
          description: `حذف مرفق: ${att.fileName}`,
        });
        return { success: true };
      }),
  }),

  // Case Detail
  caseDetail: router({
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "cases");
        const caseData = await db.getCaseById(input.id);
        if (!caseData) return null;
        authz.assertCaseRecordAccess(ctx.user!, caseData.employee, undefined, caseData.createdBy);
        const auditLogResult = await db.getAuditLog({ tableName: "cases", recordId: input.id, limit: 50 });
        return { ...caseData, auditHistory: auditLogResult.items };
      }),
  }),

  search: router({
    global: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        const isAdmin = authz.hasPrivilegedAccess(ctx.user!);
        return db.globalSearch(input.query, {
          employeeName: isAdmin ? undefined : ctx.user!.displayName ?? undefined,
          employeeUserId: isAdmin ? undefined : ctx.user!.id,
          includeUsers: isAdmin,
          includeInvestigation: isAdmin,
        });
      }),
  }),
  // Custom Sections
  customSections: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const sections = await db.getCustomSections();
      if (authz.hasPrivilegedAccess(ctx.user!)) return sections;
      // For non-admin: only visible sections (as defined in section_config)
      const configs = await db.getSectionConfigs();
      const visibleKeys = new Set(
        configs.filter((c: any) => c.visible).map((c: any) => c.sectionKey),
      );
      return sections.filter((s: any) => visibleKeys.has(`custom-${s.slug}`));
    }),
    getBySlug: protectedProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input, ctx }) => {
        const section = await db.getCustomSectionBySlug(input.slug);
        if (!section) return null;
        if (authz.hasPrivilegedAccess(ctx.user!)) return section;
        const cfg = await db.getSectionConfigByKey(`custom-${section.slug}`);
        if (cfg && cfg.visible) return section;
        throw new TRPCError({ code: "FORBIDDEN", message: "القسم غير متاح" });
      }),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        icon: z.string().optional(),
        fields: z.array(z.object({
          key: z.string(),
          label: z.string(),
          type: z.enum(["text", "textarea", "date", "number", "select"]),
          showInTable: z.boolean(),
          options: z.array(z.string()).optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.createCustomSection({ ...input, createdBy: ctx.user!.id });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "create_custom_section", details: `إنشاء قسم مخصص: ${input.name}` });
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteCustomSection(input.id);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "delete_custom_section", details: `حذف قسم مخصص رقم ${input.id}` });
        return { success: true };
      }),
    records: protectedProcedure
      .input(z.object({ sectionId: z.number(), page: z.number().optional(), pageSize: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        // Check section visibility for non-admin
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          // Resolve section slug then check section_config visibility
          const all = await db.getCustomSections();
          const section = all.find((s: any) => s.id === input.sectionId);
          if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "القسم غير موجود" });
          const cfg = await db.getSectionConfigByKey(`custom-${section.slug}`);
          if (!cfg || !cfg.visible) throw new TRPCError({ code: "FORBIDDEN", message: "القسم غير متاح" });
        }
        const scope = authz.hasPrivilegedAccess(ctx.user!) ? undefined : { scopeUserId: ctx.user!.id };
        return db.getCustomSectionRecords(input.sectionId, {
          page: input.page,
          pageSize: input.pageSize,
          ...scope,
        });
      }),
    recordsPaged: protectedProcedure
      .input(z.object({ sectionId: z.number(), page: z.number().optional(), pageSize: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          const all = await db.getCustomSections();
          const section = all.find((s: any) => s.id === input.sectionId);
          if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "القسم غير موجود" });
          const cfg = await db.getSectionConfigByKey(`custom-${section.slug}`);
          if (!cfg || !cfg.visible) throw new TRPCError({ code: "FORBIDDEN", message: "القسم غير متاح" });
        }
        const scope = authz.hasPrivilegedAccess(ctx.user!) ? undefined : { scopeUserId: ctx.user!.id };
        return db.getCustomSectionRecordsPaged(input.sectionId, {
          page: input.page,
          pageSize: input.pageSize,
          ...scope,
        });
      }),
    addRecord: adminProcedure
      .input(z.object({ sectionId: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ input, ctx }) => {
        await db.createCustomSectionRecord({ sectionId: input.sectionId, data: input.data, createdBy: ctx.user!.id });
        return { success: true };
      }),
    updateRecord: adminProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ input, ctx }) => {
        await db.updateCustomSectionRecord(input.id, input.data);
        return { success: true };
      }),
    deleteRecord: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteCustomSectionRecord(input.id);
        return { success: true };
      }),
    bulkDeleteRecords: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.bulkDeleteCustomSectionRecords(input.ids);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "bulk_delete_custom_records", details: `حذف ${input.ids.length} سجل من قسم مخصص` });
        return { success: true };
      }),
  }),
  // CMS - Section Configuration
  cms: router({
    getSections: protectedProcedure.query(async ({ ctx }) => {
      return db.getSectionConfigsForUser(authz.hasPrivilegedAccess(ctx.user!));
    }),
    updateSection: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), icon: z.string().optional(), visible: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const before = await db.getSectionConfigs().then((rows) => rows.find((r: any) => r.id === id));
        await db.updateSectionConfig(id, data);
        const after = await db.getSectionConfigs().then((rows) => rows.find((r: any) => r.id === id));
        await db.createAuditEntry({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "cms_update_section",
          tableName: "section_config",
          recordId: id,
          description: `تعديل إعدادات القسم ${before?.sectionKey || id}`,
          oldData: before ?? null,
          newData: after ?? null,
        });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "update_section_config", details: `تعديل إعدادات قسم رقم ${id}` });
        return { success: true };
      }),
    reorderSections: adminProcedure
      .input(z.object({ items: z.array(z.object({ id: z.number(), sortOrder: z.number() })) }))
      .mutation(async ({ input, ctx }) => {
        const before = await db.getSectionConfigs();
        await db.updateSectionOrder(input.items);
        const after = await db.getSectionConfigs();
        await db.createAuditEntry({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "cms_reorder_sections",
          tableName: "section_config",
          description: "إعادة ترتيب الأقسام",
          oldData: before,
          newData: after,
        });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "reorder_sections", details: "إعادة ترتيب الأقسام" });
        return { success: true };
      }),
    addColumn: adminProcedure
      .input(z.object({
        sectionKey: z.string().min(1).max(128),
        column: z.object({
          key: z.string()
            .min(3)
            .max(64)
            .regex(/^extra_[a-z0-9_]+_\d+$/i, "صيغة مفتاح العمود غير صحيحة"),
          label: z.string().min(1).max(64),
          type: z.enum(["text", "textarea", "date", "number", "select"]),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        const section = await db.getSectionConfigByKey(input.sectionKey);
        if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "القسم غير موجود" });
        if (!section.isBuiltIn) throw new TRPCError({ code: "BAD_REQUEST", message: "إضافة الأعمدة مدعومة للأقسام المدمجة فقط" });
        const beforeCols = section.columns ?? null;
        await db.addBuiltInSectionColumn(input.sectionKey, input.column);
        const after = await db.getSectionConfigByKey(input.sectionKey);
        await db.createAuditEntry({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "cms_add_column",
          tableName: "section_config",
          recordId: section.id,
          description: `إضافة عمود ${input.column.key} للقسم ${input.sectionKey}`,
          oldData: { columns: beforeCols },
          newData: { columns: after?.columns ?? null },
        });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "add_column", details: `إضافة عمود ${input.column.label} للقسم ${input.sectionKey}` });
        return { success: true };
      }),
    removeColumn: adminProcedure
      .input(z.object({
        sectionKey: z.string().min(1).max(128),
        columnKey: z.string().min(1).max(64),
      }))
      .mutation(async ({ input, ctx }) => {
        const section = await db.getSectionConfigByKey(input.sectionKey);
        if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "القسم غير موجود" });
        const beforeCols = section.columns ?? null;
        await db.removeBuiltInSectionColumn(input.sectionKey, input.columnKey);
        const after = await db.getSectionConfigByKey(input.sectionKey);
        await db.createAuditEntry({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "cms_remove_column",
          tableName: "section_config",
          recordId: section.id,
          description: `حذف/إخفاء عمود ${input.columnKey} من القسم ${input.sectionKey}`,
          oldData: { columns: beforeCols },
          newData: { columns: after?.columns ?? null },
        });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "remove_column", details: `حذف عمود ${input.columnKey} من القسم ${input.sectionKey}` });
        return { success: true };
      }),
    renameColumn: adminProcedure
      .input(z.object({
        sectionKey: z.string().min(1).max(128),
        columnKey: z.string().min(1).max(64),
        newLabel: z.string().min(1).max(64),
      }))
      .mutation(async ({ input, ctx }) => {
        const section = await db.getSectionConfigByKey(input.sectionKey);
        if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "القسم غير موجود" });
        const beforeCols = section.columns ?? null;
        await db.renameBuiltInSectionColumn(input.sectionKey, input.columnKey, input.newLabel);
        const after = await db.getSectionConfigByKey(input.sectionKey);
        await db.createAuditEntry({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "cms_rename_column",
          tableName: "section_config",
          recordId: section.id,
          description: `تغيير اسم عمود ${input.columnKey} في القسم ${input.sectionKey}`,
          oldData: { columns: beforeCols },
          newData: { columns: after?.columns ?? null },
        });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "rename_column", details: `تغيير اسم عمود ${input.columnKey} إلى ${input.newLabel}` });
        return { success: true };
      }),
    importData: adminProcedure
      .input(z.object({ sectionId: z.number(), records: z.array(z.record(z.string(), z.any())) }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.importRecordsToCustomSection(input.sectionId, input.records, ctx.user!.id);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "import_data", details: `استيراد ${result.count} سجل للقسم رقم ${input.sectionId}` });
        return result;
      }),
    importBuiltIn: adminProcedure
      .input(z.object({ sectionKey: z.string(), records: z.array(z.record(z.string(), z.any())) }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.importRecordsToBuiltInSection(input.sectionKey, input.records, ctx.user!.id);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "import_builtin", details: `استيراد ${result.count} سجل للقسم ${input.sectionKey}` });
        return result;
      }),
    getSettings: publicProcedure.query(async () => {
      return db.getPublicAppSettings();
    }),
    updateSettings: adminProcedure
      .input(z.object({ logoUrl: z.string().optional(), primaryColor: z.string().optional(), accentColor: z.string().optional(), fontFamily: z.string().optional(), darkMode: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const before = await db.getAppSettings();
        if (input.logoUrl) {
          const logoKey = extractStorageKeyFromUrl(input.logoUrl);
          if (logoKey) {
            bindUploadedFile(ctx.user!.id, logoKey, input.logoUrl);
          }
        }
        await db.updateAppSettings(input);
        const after = await db.getAppSettings();
        await db.createAuditEntry({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "cms_update_settings",
          tableName: "app_settings",
          description: "تحديث إعدادات المظهر",
          oldData: before,
          newData: after,
        });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "update_settings", details: "تحديث إعدادات المظهر" });
        return { success: true };
      }),
  }),
  // Custom Case Types
  customCaseTypes: router({
    list: protectedProcedure.query(async () => {
      return db.getCustomCaseTypes();
    }),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.createCustomCaseType({ name: input.name, createdBy: ctx.user!.id });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "create_case_type", details: `إضافة نوع قضية: ${input.name}` });
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteCustomCaseType(input.id);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "delete_case_type", details: `حذف نوع قضية رقم ${input.id}` });
        return { success: true };
      }),
  }),

  // ==========================================
  // المراسلات الرسمية - Official Correspondence
  // ==========================================
  correspondence: router({
    list: protectedProcedure
      .input(z.object({
        type: z.enum(["inbox", "outbox"]),
        employee: z.string().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
        archived: z.boolean().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(200).optional(),
      }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "correspondence");
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "البريد الوارد والصادر متاح للمدير والإداري فقط" });
        }
        const filters: any = { ...input };
        if (filters.status === "all") delete filters.status;
        return db.getCorrespondence(input.type, filters);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const record = await db.getCorrespondenceById(input.id);
        if (!record) return null;
        const isPrivileged = authz.hasPrivilegedAccess(ctx.user!);
        const hasAssignment = !isPrivileged
          ? await db.hasAssignmentForEmployee(input.id, authz.employeeName(ctx.user!))
          : false;
        if (isPrivileged) {
          authz.assertSectionAccess(ctx.user!, "correspondence");
        } else if (!hasAssignment) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك الوصول إلى هذه المراسلة" });
        }
        authz.assertCorrespondenceAccess(ctx.user!, record, { hasAssignment });
        return record;
      }),
    stats: protectedProcedure.query(async ({ ctx }) => {
      authz.assertSectionAccess(ctx.user!, "correspondence");
      if (!authz.hasPrivilegedAccess(ctx.user!)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "إحصائيات المراسلات متاحة للمدير والإداري فقط" });
      }
      return db.getCorrespondenceStats();
    }),
    myAssignments: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        search: z.string().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(200).optional(),
      }))
      .query(async ({ input, ctx }) => {
        return db.getMyAssignments(authz.employeeName(ctx.user!), input);
      }),
    myAssignmentStats: protectedProcedure.query(async ({ ctx }) => {
      return db.getMyAssignmentStats(authz.employeeName(ctx.user!));
    }),
    linkableCases: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "correspondence");
        if (!canAccessSection(ctx.user!, "cases")) return [];
        const filters: { search?: string; pageSize: number; employees?: string[] } = {
          pageSize: 100,
          search: input?.search,
        };
        if (!authz.canViewAllCases(ctx.user!)) {
          filters.employees = [authz.employeeName(ctx.user!)];
        }
        const result = await db.getCasesList(filters);
        return (result.items ?? []).map((c) => ({
          id: c.id,
          caseNumber: c.caseNumber,
          subject: c.subject,
          employee: c.employee,
        }));
      }),
    create: protectedProcedure
      .input(z.object({ type: z.enum(["inbox", "outbox"]), bookNumber: z.string().optional(), subject: z.string().optional(), senderEntity: z.string().optional(), receiverEntity: z.string().optional(), correspondenceDate: z.string().optional(), receivedDate: z.string().optional(), employee: z.string().optional(), employeeId: z.number().optional(), status: z.string().optional(), priority: z.string().optional(), parentId: z.number().optional(), deadline: z.string().optional(), attachmentUrl: z.string().optional(), attachmentKey: z.string().optional(), notes: z.string().optional(), relatedCaseId: z.number().optional(), relatedCaseNumber: z.string().optional(), mandobOutNumber: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "correspondence");
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "إضافة المراسلات متاحة للمدير والإداري فقط" });
        }
        bindUploadedFile(ctx.user!.id, input.attachmentKey, input.attachmentUrl);
        const payload = await correspondenceService.prepareCorrespondenceCreate(ctx.user!, input as Record<string, unknown> & { type: "inbox" | "outbox" });
        const id = await db.createCorrespondence(payload);
        await correspondenceService.registerCorrespondenceEntities(ctx.user!, {
          type: input.type,
          senderEntity: input.senderEntity,
          receiverEntity: input.receiverEntity,
        });
        await correspondenceService.addCorrespondenceTrail(id, "received", ctx.user!, { notes: input.subject || input.bookNumber });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "create_correspondence", details: `إضافة مراسلة ${input.type === "inbox" ? "واردة" : "صادرة"}: ${input.subject || input.bookNumber}` });
        return { success: true, id, autoNumber: payload.autoNumber, officialNumber: payload.officialNumber, legalOutNumber: payload.legalOutNumber };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), bookNumber: z.string().optional(), subject: z.string().optional(), senderEntity: z.string().optional(), receiverEntity: z.string().optional(), correspondenceDate: z.string().optional(), receivedDate: z.string().optional(), employee: z.string().optional(), employeeId: z.number().optional(), status: z.string().optional(), priority: z.string().optional(), parentId: z.number().optional(), deadline: z.string().optional(), attachmentUrl: z.string().optional(), attachmentKey: z.string().optional(), notes: z.string().optional(), relatedCaseId: z.number().optional(), relatedCaseNumber: z.string().optional(), mandobOutNumber: z.string().optional(), legalOutNumber: z.number().int().min(1).optional() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await db.getCorrespondenceById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        authz.assertCorrespondenceAccess(ctx.user!, existing);
        authz.assertSectionWrite(ctx.user!, "correspondence");
        bindUploadedFile(
          ctx.user!.id,
          input.attachmentKey,
          input.attachmentUrl,
          existing.attachmentKey,
        );
        const { id, employeeId, relatedCaseId, ...raw } = input;
        let data = correspondenceService.sanitizeCorrespondenceUpdate(ctx.user!, raw as Record<string, unknown>);
        if (authz.hasPrivilegedAccess(ctx.user!) && employeeId) {
          data.employee = await correspondenceService.resolveEmployeeField(ctx.user!, { employeeId });
        }
        if (relatedCaseId !== undefined) {
          const caseFields = await correspondenceService.resolveCaseFields(relatedCaseId, ctx.user!);
          data = { ...data, ...caseFields };
        }
        if (input.legalOutNumber !== undefined && existing.type === "outbox" && authz.hasPrivilegedAccess(ctx.user!)) {
          data.legalOutNumber = input.legalOutNumber;
        }
        data = await correspondenceService.applyOfficialOutNumberUpdate(
          { ...existing, legalOutNumber: (data.legalOutNumber as number | undefined) ?? existing.legalOutNumber },
          data,
        );
        if (input.legalOutNumber !== undefined && existing.type === "outbox") {
          await db.syncLastApprovedLegalOutNumber(input.legalOutNumber);
        }
        if (input.status && input.status !== existing.status) {
          await correspondenceService.addCorrespondenceTrail(id, input.status === "completed" ? "executed" : "noted", ctx.user!, { notes: `تغيير الحالة إلى ${input.status}` });
        }
        await db.updateCorrespondence(id, data);
        if (input.senderEntity !== undefined || input.receiverEntity !== undefined) {
          await correspondenceService.registerCorrespondenceEntities(ctx.user!, {
            type: existing.type as "inbox" | "outbox",
            senderEntity: (data.senderEntity as string | undefined) ?? existing.senderEntity ?? undefined,
            receiverEntity: (data.receiverEntity as string | undefined) ?? existing.receiverEntity ?? undefined,
          });
        }
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "update_correspondence", details: `تحديث مراسلة رقم ${id}` });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await db.getCorrespondenceById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        authz.assertCorrespondenceAccess(ctx.user!, existing);
        authz.assertSectionWrite(ctx.user!, "correspondence");
        await db.deleteCorrespondence(input.id);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "delete_correspondence", details: `حذف مراسلة رقم ${input.id}` });
        return { success: true };
      }),
    archive: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await db.getCorrespondenceById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        authz.assertCorrespondenceAccess(ctx.user!, existing);
        authz.assertSectionWrite(ctx.user!, "correspondence");
        await db.archiveCorrespondence(input.id);
        await correspondenceService.addCorrespondenceTrail(input.id, "archived", ctx.user!);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "archive_correspondence", details: `أرشفة مراسلة رقم ${input.id}` });
        return { success: true };
      }),
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        for (const id of input.ids) {
          const existing = await db.getCorrespondenceById(id);
          if (existing) authz.assertCorrespondenceAccess(ctx.user!, existing);
        }
        await db.bulkDeleteCorrespondence(input.ids);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "bulk_delete_correspondence", details: `حذف ${input.ids.length} مراسلة` });
        return { success: true };
      }),
    trail: protectedProcedure
      .input(z.object({ correspondenceId: z.number() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "correspondence");
        const record = await db.getCorrespondenceById(input.correspondenceId);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        authz.assertCorrespondenceAccess(ctx.user!, record);
        return db.getTrail(input.correspondenceId);
      }),
    addTrail: protectedProcedure
      .input(z.object({ correspondenceId: z.number(), action: z.string(), fromUser: z.string().optional(), toUser: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "correspondence");
        const record = await db.getCorrespondenceById(input.correspondenceId);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        authz.assertCorrespondenceAccess(ctx.user!, record);
        await db.addTrailEntry(input);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "add_trail", details: `إضافة تتبع للمراسلة ${input.correspondenceId}: ${input.action}` });
        return { success: true };
      }),
    assignments: protectedProcedure
      .input(z.object({ correspondenceId: z.number() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "correspondence");
        const record = await db.getCorrespondenceById(input.correspondenceId);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        authz.assertCorrespondenceAccess(ctx.user!, record);
        return db.getAssignments(input.correspondenceId);
      }),
    addAssignment: protectedProcedure
      .input(z.object({ correspondenceId: z.number(), assignedTo: z.string(), task: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "correspondence");
        const record = await db.getCorrespondenceById(input.correspondenceId);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        authz.assertCorrespondenceAccess(ctx.user!, record);
        await db.addAssignment(input);
        await correspondenceService.addCorrespondenceTrail(input.correspondenceId, "forwarded", ctx.user!, { toUser: input.assignedTo, notes: input.task });
        await db.createNotification({
          userId: null,
          title: "إحالة مراسلة جديدة إليك",
          message: `تم إحالة الكتاب "${record.subject || record.bookNumber || "#" + input.correspondenceId}" إليك من قِبل ${ctx.user!.displayName || ctx.user!.username}${input.task ? "\nالمهمة: " + input.task : ""}`,
          type: "correspondence_assigned",
          relatedId: input.correspondenceId,
          targetEmployee: input.assignedTo,
        });
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "assign_correspondence", details: `إحالة المراسلة ${input.correspondenceId} إلى ${input.assignedTo}` });
        return { success: true };
      }),
    updateAssignment: protectedProcedure
      .input(z.object({ id: z.number(), status: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const assignment = await db.getAssignmentById(input.id);
        if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "الإحالة غير موجودة" });
        const record = await db.getCorrespondenceById(assignment.correspondenceId);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        const isPrivileged = authz.hasPrivilegedAccess(ctx.user!);
        if (isPrivileged) {
          authz.assertCorrespondenceAccess(ctx.user!, record);
          authz.assertSectionWrite(ctx.user!, "correspondence");
        } else {
          const emp = authz.employeeName(ctx.user!);
          if (assignment.assignedTo !== emp) {
            throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق لك تعديل هذه الإحالة" });
          }
        }
        await db.updateAssignmentStatus(input.id, input.status);
        if (input.status === "completed") {
          await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "complete_assignment", details: `إكمال إحالة رقم ${input.id}` });
        }
        return { success: true };
      }),
    replies: protectedProcedure
      .input(z.object({ parentId: z.number() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "correspondence");
        const parent = await db.getCorrespondenceById(input.parentId);
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "المراسلة غير موجودة" });
        authz.assertCorrespondenceAccess(ctx.user!, parent);
        return db.getCorrespondenceReplies(input.parentId);
      }),
    dailyReport: adminProcedure
      .input(z.object({ date: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return db.getDailyReport(input?.date);
      }),
    overdueReport: protectedProcedure
      .query(async ({ ctx }) => {
        authz.assertSectionAccess(ctx.user!, "correspondence");
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "تقرير المتأخرات متاح للمدير والإداري فقط" });
        }
        return db.getOverdueCorrespondence();
      }),
    performanceStats: adminProcedure
      .query(async () => {
        return db.getPerformanceStats();
      }),
    runDeadlineReminders: adminProcedure
      .mutation(async () => correspondenceDeadlineScheduler.scheduleCorrespondenceDeadlineReminders()),
    entities: router({
      list: protectedProcedure
        .input(z.object({ search: z.string().optional(), kind: z.enum(["sender", "receiver", "both"]).optional() }).optional())
        .query(async ({ input, ctx }) => {
          authz.assertSectionAccess(ctx.user!, "correspondence");
          return db.getCorrespondenceEntities(input ?? undefined);
        }),
      suggest: protectedProcedure
        .input(z.object({ field: z.enum(["sender", "receiver"]), search: z.string().optional() }))
        .query(async ({ input, ctx }) => {
          authz.assertSectionAccess(ctx.user!, "correspondence");
          return db.suggestCorrespondenceEntities(input.field, input.search);
        }),
      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1).max(256),
          entityKind: z.enum(["sender", "receiver", "both"]).optional(),
          category: z.string().max(128).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          authz.assertSectionWrite(ctx.user!, "correspondence");
          const id = await db.createCorrespondenceEntity({
            name: input.name,
            entityKind: input.entityKind,
            category: input.category,
            createdBy: ctx.user!.id,
          });
          await db.logActivity({
            userId: ctx.user!.id,
            username: ctx.user!.username,
            action: "create_correspondence_entity",
            details: `إضافة جهة للدليل: ${input.name}`,
          });
          return { success: true, id };
        }),
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteCorrespondenceEntity(input.id);
          await db.logActivity({
            userId: ctx.user!.id,
            username: ctx.user!.username,
            action: "delete_correspondence_entity",
            details: `حذف جهة من الدليل رقم ${input.id}`,
          });
          return { success: true };
        }),
    }),
    outboxNumbering: router({
      get: adminProcedure.query(async () => db.getOutboxNumberingSettings()),
      update: adminProcedure
        .input(z.object({ lastApprovedLegalOutNumber: z.number().int().min(0).optional(), officeCode: z.string().min(1).max(16).optional() }))
        .mutation(async ({ input, ctx }) => {
          await db.updateOutboxNumberingSettings(input);
          await db.logActivity({
            userId: ctx.user!.id,
            username: ctx.user!.username,
            action: "update_outbox_numbering",
            details: `اعتماد آخر رقم صادر قانوني: ${input.lastApprovedLegalOutNumber ?? "—"}`,
          });
          return { success: true };
        }),
    }),
  }),
  // ==========================================
  // المواعيد والتذكيرات - Appointments & Reminders
  // ==========================================
  appointments: router({
    list: protectedProcedure
      .input(z.object({ employee: z.string().optional(), status: z.string().optional(), month: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "appointments");
        const filters: any = { ...(input || {}) };
        if (!authz.hasPrivilegedAccess(ctx.user!)) filters.employee = ctx.user!.displayName;
        return db.getAppointments(filters);
      }),
    upcoming: protectedProcedure
      .input(z.object({ limit: z.number().max(50).optional() }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "appointments");
        const employee = !authz.hasPrivilegedAccess(ctx.user!) ? ctx.user!.displayName : undefined;
        return db.getUpcomingAppointments(employee, input?.limit ?? 15);
      }),
    linkableCases: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "appointments");
        if (!canAccessSection(ctx.user!, "cases")) return [];
        const filters: { search?: string; pageSize: number; employees?: string[] } = {
          pageSize: 100,
          search: input?.search,
        };
        if (!authz.canViewAllCases(ctx.user!)) {
          filters.employees = [authz.employeeName(ctx.user!)];
        }
        const result = await db.getCasesList(filters);
        return (result.items ?? []).map((c) => ({
          id: c.id,
          caseNumber: c.caseNumber,
          subject: c.subject,
          employee: c.employee,
        }));
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "appointments");
        const record = await db.getAppointmentById(input.id);
        if (!record) return null;
        authz.assertAppointmentAccess(ctx.user!, record);
        return record;
      }),
    create: protectedProcedure
      .input(appointmentInputSchema)
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "appointments");
        const payload = await appointmentService.prepareAppointmentCreate(ctx.user!, input as Record<string, unknown>);
        const id = await db.createAppointment(payload);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "create_appointment", details: `إضافة موعد: ${input.title}` });
        return { success: true, id };
      }),
    update: protectedProcedure
      .input(appointmentUpdateSchema)
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "appointments");
        const existing = await db.getAppointmentById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "الموعد غير موجود" });
        authz.assertAppointmentAccess(ctx.user!, existing);
        const { id, ...raw } = input;
        let data = appointmentService.sanitizeAppointmentUpdate(ctx.user!, raw as Record<string, unknown>, existing);
        if (authz.hasPrivilegedAccess(ctx.user!) && raw.employeeId) {
          const employeeFields = await appointmentService.resolveEmployeeFields(ctx.user!, {
            employeeId: raw.employeeId,
            employee: raw.employee,
          });
          data = { ...data, ...employeeFields };
        } else if (!authz.hasPrivilegedAccess(ctx.user!)) {
          delete (data as any).employee;
          delete (data as any).employeeId;
        }
        if (raw.caseId !== undefined) {
          const caseFields = await appointmentService.resolveCaseFields(raw.caseId, ctx.user!);
          data = { ...data, ...caseFields };
        }
        await db.updateAppointment(id, data);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "update_appointment", details: `تحديث موعد رقم ${id}` });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "appointments");
        const existing = await db.getAppointmentById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "الموعد غير موجود" });
        authz.assertAppointmentAccess(ctx.user!, existing);
        await db.deleteAppointment(input.id);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "delete_appointment", details: `حذف موعد رقم ${input.id}` });
        return { success: true };
      }),
    checkConflicts: protectedProcedure
      .input(z.object({ date: z.string(), time: z.string(), employee: z.string(), excludeId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "appointments");
        appointmentService.assertEmployeeScheduleAccess(ctx.user!, input.employee);
        return db.checkAppointmentConflicts(input.date, input.time, input.employee, input.excludeId);
      }),
    employeeAvailability: protectedProcedure
      .input(z.object({ date: z.string(), employee: z.string(), employeeId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "appointments");
        appointmentService.assertEmployeeScheduleAccess(ctx.user!, input.employee, input.employeeId);
        return db.getEmployeeAppointmentsOnDate(input.date, input.employee);
      }),
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        for (const id of input.ids) {
          const existing = await db.getAppointmentById(id);
          if (existing) authz.assertAppointmentAccess(ctx.user!, existing);
        }
        await db.bulkDeleteAppointments(input.ids);
        await db.logActivity({ userId: ctx.user!.id, username: ctx.user!.username, action: "bulk_delete_appointments", details: `حذف ${input.ids.length} موعد` });
        return { success: true };
      }),
    runReminders: adminProcedure
      .mutation(async () => appointmentReminderService.runAppointmentReminders()),
  }),

  // ==========================================
  // طلبات المراجعة القانونية - Legal Review Requests
  // ==========================================
  legalReviews: router({
    openCount: protectedProcedure.query(async ({ ctx }) => {
      authz.assertSectionAccess(ctx.user!, "legal_reviews");
      const userId = authz.hasPrivilegedAccess(ctx.user!) ? undefined : ctx.user!.id;
      return db.getLegalReviewOpenCount({ userId });
    }),
    createBlock: protectedProcedure.query(async ({ ctx }) => {
      authz.assertSectionAccess(ctx.user!, "legal_reviews");
      return legalReviewFollowupService.getLegalReviewCreateBlockers(ctx.user!);
    }),
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
        assignedTo: z.string().optional(),
        search: z.string().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(200).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "legal_reviews");
        const filters: any = { ...(input || {}) };
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          filters.userId = ctx.user!.id;
          delete filters.assignedTo;
        }
        const result = await db.getLegalReviews(filters);
        const items = await db.enrichLegalReviewsWithCases(result.items);
        return { ...result, items };
      }),
    linkableCases: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "legal_reviews");
        if (!canAccessSection(ctx.user!, "cases")) return [];
        const filters: { search?: string; pageSize: number; employees?: string[] } = {
          pageSize: 100,
          search: input?.search,
        };
        if (!authz.canViewAllCases(ctx.user!)) {
          filters.employees = [authz.employeeName(ctx.user!)];
        }
        const result = await db.getCasesList(filters);
        return (result.items ?? []).map((c) => ({
          id: c.id,
          caseNumber: c.caseNumber,
          subject: c.subject,
          employee: c.employee,
        }));
      }),
    approve: protectedProcedure
      .input(z.object({ id: z.number(), reviewNotes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
        }
        return legalReviewService.approveLegalReview(input.id, ctx.user!, input.reviewNotes);
      }),
    reject: protectedProcedure
      .input(z.object({ id: z.number(), reviewNotes: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!authz.hasPrivilegedAccess(ctx.user!)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
        }
        return legalReviewService.rejectLegalReview(input.id, ctx.user!, input.reviewNotes);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "legal_reviews");
        const review = await db.getLegalReviewById(input.id);
        if (!review) return undefined;
        authz.assertLegalReviewAccess(ctx.user!, review);
        return review;
      }),
    trail: protectedProcedure
      .input(z.object({ reviewId: z.number() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "legal_reviews");
        const review = await db.getLegalReviewById(input.reviewId);
        if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });
        authz.assertLegalReviewAccess(ctx.user!, review);
        return db.getLegalReviewTrail(input.reviewId);
      }),
    addTrail: protectedProcedure
      .input(z.object({ reviewId: z.number(), action: z.string(), notes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "legal_reviews");
        const review = await db.getLegalReviewById(input.reviewId);
        if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });
        authz.assertLegalReviewAccess(ctx.user!, review);
        await legalReviewService.addLegalReviewTrail(input.reviewId, input.action, ctx.user!, input.notes);
        await db.logActivity({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "add_legal_review_trail",
          details: `تتبع طلب مراجعة #${input.reviewId}: ${input.action}`,
        });
        return { success: true };
      }),
    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        reviewDate: z.string(),
        location: z.string().optional(),
        priority: z.string().optional(),
        description: z.string().optional(),
        assignedTo: z.string().optional(),
        assignedToId: z.number().optional(),
        requestDate: z.string().optional(),
        relatedCaseId: z.number().optional(),
        attachmentUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "legal_reviews");
        await legalReviewFollowupService.assertCanCreateLegalReview(ctx.user!);
        if (input.relatedCaseId) {
          await caseService.assertOptionalCaseAccess(ctx.user!, input.relatedCaseId);
        }
        bindUploadedFileFromUrl(ctx.user!.id, input.attachmentUrl);
        const payload = legalReviewService.prepareLegalReviewCreate(ctx.user!, input as Record<string, unknown>);
        const id = await db.createLegalReview(payload);
        if (input.assignedToId && authz.hasPrivilegedAccess(ctx.user!)) {
          await legalReviewService.notifyLegalReviewAssigned(id, input.assignedToId, input.title);
        }
        await legalReviewService.addLegalReviewTrail(id, "created", ctx.user!, input.title);
        await db.logActivity({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "create_legal_review",
          details: `إنشاء طلب مراجعة: ${input.title}`,
        });
        return { success: true, id };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        reviewDate: z.string().optional(),
        location: z.string().optional(),
        priority: z.string().optional(),
        description: z.string().optional(),
        assignedTo: z.string().optional(),
        assignedToId: z.number().optional(),
        status: z.string().optional(),
        reviewNotes: z.string().optional(),
        requestDate: z.string().optional(),
        relatedCaseId: z.number().optional(),
        attachmentUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "legal_reviews");
        const { id, ...raw } = input;
        const existing = await db.getLegalReviewById(id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });
        authz.assertLegalReviewAccess(ctx.user!, existing);
        if (raw.relatedCaseId) {
          await caseService.assertOptionalCaseAccess(ctx.user!, raw.relatedCaseId);
        }
        bindUploadedFileFromUrl(ctx.user!.id, raw.attachmentUrl, existing.attachmentUrl);
        const data = legalReviewService.sanitizeLegalReviewUpdate(ctx.user!, raw as Record<string, unknown>);
        await db.updateLegalReview(id, data);
        if (input.assignedToId && authz.hasPrivilegedAccess(ctx.user!) && input.assignedToId !== existing.assignedToId) {
          await legalReviewService.notifyLegalReviewAssigned(id, input.assignedToId, existing.title);
          await legalReviewService.addLegalReviewTrail(id, "assigned", ctx.user!, input.assignedTo ?? undefined);
        }
        if (input.status && authz.hasPrivilegedAccess(ctx.user!) && input.status !== existing.status) {
          await legalReviewService.addLegalReviewTrail(id, `status_${input.status}`, ctx.user!);
        }
        await db.logActivity({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "update_legal_review",
          details: `تحديث طلب مراجعة رقم ${id}`,
        });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "legal_reviews");
        const existing = await db.getLegalReviewById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المراجعة غير موجود" });
        authz.assertLegalReviewDelete(ctx.user!, existing);
        await db.deleteLegalReview(input.id);
        await db.logActivity({
          userId: ctx.user!.id,
          username: ctx.user!.username,
          action: "delete_legal_review",
          details: `حذف طلب مراجعة رقم ${input.id}`,
        });
        return { success: true };
      }),
    submitFollowup: protectedProcedure
      .input(z.object({ id: z.number(), lastActions: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        authz.assertSectionWrite(ctx.user!, "legal_reviews");
        return legalReviewFollowupService.submitLegalReviewFollowup(input.id, ctx.user!, input.lastActions);
      }),
    approveFollowup: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        return legalReviewFollowupService.approveLegalReviewFollowup(input.id, ctx.user!);
      }),
    rejectFollowup: protectedProcedure
      .input(z.object({ id: z.number(), note: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        return legalReviewFollowupService.rejectLegalReviewFollowup(input.id, ctx.user!, input.note);
      }),
    runFollowupReminders: adminProcedure
      .mutation(async () => legalReviewFollowupService.runLegalReviewFollowupReminders()),
  }),

  // ==========================================
  // تلغرام - Telegram Notifications
  // ==========================================
  telegram: router({
    /** Generate a secure link code for the current user */
    generateLinkCode: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { generateLinkCode, getBotInfo } = await import("./telegram");
        const code = await generateLinkCode(ctx.user!.id);
        const botInfo = await getBotInfo();
        const botUsername = botInfo.username || "LegalUnitBot";
        return { code, botUsername, deepLink: `https://t.me/${botUsername}?start=${code}` };
      }),
    /** Get current Telegram link status for the logged-in user */
    getStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const user = await db.getUserById(ctx.user!.id);
        return {
          linked: !!(user as any)?.telegramChatId,
        };
      }),
    /** Admin: send a manual alert to a specific employee about their delayed cases */
    sendAlert: adminProcedure
      .input(z.object({
        userId: z.number(),
        message: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const { notifyUserByTelegram } = await import("./telegram");
        const sent = await notifyUserByTelegram(input.userId, `🔔 <b>تنبيه من الإدارة</b>\n\n${input.message}`);
        return { sent };
      }),
    /** Admin: trigger expiry check and send notifications for all expiring cases */
    checkExpiry: adminProcedure
      .mutation(async () => {
        const { checkAndNotifyExpiringCases } = await import("./telegram");
        return checkAndNotifyExpiringCases();
      }),
    /** Admin: set the Telegram webhook URL */
    setWebhook: adminProcedure
      .input(z.object({ webhookUrl: z.string().url() }))
      .mutation(async ({ input }) => {
        const { setWebhook } = await import("./telegram");
        const ok = await setWebhook(input.webhookUrl);
        return { ok };
      }),
    /** Admin: unlink a user's Telegram account */
    unlinkUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        const db2 = await db.getDb();
        if (!db2) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db2.update(usersTable).set({ telegramChatId: null, telegramLinkCode: null }).where(eq(usersTable.id, input.userId));
        return { success: true };
      }),
    /** User: unlink own Telegram account */
    unlinkSelf: protectedProcedure
      .mutation(async ({ ctx }) => {
        const db2 = await db.getDb();
        if (!db2) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db2.update(usersTable).set({ telegramChatId: null, telegramLinkCode: null }).where(eq(usersTable.id, ctx.user!.id));
        return { success: true };
      }),
  }),
  // ==========================================
  // خريطة القضايا - Cases Map
  // ==========================================
  casesMap: router({
    stats: protectedProcedure
      .input(z.object({
        timeFilter: z.string().optional(),
        compare: z.boolean().optional(),
        caseType: z.string().optional(),
        caseStatus: z.string().optional(),
        branch: z.string().optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "cases");
        const employee = authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!);
        return db.getCasesMapStats({ ...(input ?? {}), employee });
      }),
    branchStats: protectedProcedure
      .input(z.object({ branchName: z.string() }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "cases");
        const employee = authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!);
        return db.getBranchStats(input.branchName, employee);
      }),
  }),
  // ==========================================
  // الموقف الفصلي - Quarterly Status
  // ==========================================
  quarterlyStatus: router({
    integrityStats: protectedProcedure
      .query(async ({ ctx }) => {
        authz.assertSectionAccess(ctx.user!, "quarterly_status");
        const employee = authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!);
        return db.getIntegrityCasesStats({ province: PLATFORM_GOVERNORATE, employee });
      }),
    integrityCases: protectedProcedure
      .input(z.object({
        statusFilter: z.string().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(200).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "quarterly_status");
        const employee = authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!);
        return db.getIntegrityCases(input?.statusFilter, {
          province: PLATFORM_GOVERNORATE,
          employee,
          page: input?.page,
          pageSize: input?.pageSize,
        });
      }),
    periodicReport: protectedProcedure
      .input(z.object({
        periodType: z.enum(["monthly", "quarterly", "annual"]),
        year: z.number(),
        month: z.number().optional(),
        quarter: z.number().optional(),
        statusFilter: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        authz.assertSectionAccess(ctx.user!, "quarterly_status");
        const employee = authz.canViewAllCases(ctx.user!) ? undefined : authz.employeeName(ctx.user!);
        return db.getPeriodicReport(input.periodType, input.year, input.month, input.quarter, input.statusFilter, { province: PLATFORM_GOVERNORATE, employee });
      }),
  }),
});
export type AppRouter = typeof appRouter;
