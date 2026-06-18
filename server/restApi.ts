/**
 * REST API endpoints for Mobile App
 * All endpoints use JWT Bearer token authentication (same token as web app cookie)
 * POST /api/auth/login returns a token that should be sent as: Authorization: Bearer <token>
 */
import { Router, Request, Response, NextFunction } from "express";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { authenticateLocalUserRest, LoginError } from "./_core/authService";
import * as authz from "./_core/authorization";
import { submitPendingOperation } from "./_core/pendingNotifications";
import * as pendingService from "./_core/pendingService";
import * as legalReviewService from "./_core/legalReviewService";
import * as legalReviewFollowupService from "./_core/legalReviewFollowupService";
import * as appointmentService from "./_core/appointmentService";
import * as correspondenceService from "./_core/correspondenceService";
import * as caseService from "./_core/caseService";
import { PLATFORM_GOVERNORATE } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logServerError, sanitizeClientError } from "./_core/sanitizeError";

const router = Router();

function forbidden(res: Response, message = "غير مصرح") {
  return res.status(403).json({ error: message, code: "FORBIDDEN" });
}

function internalError(res: Response, err: unknown, context?: string) {
  if (context) logServerError(`REST ${context}`, err);
  else logServerError("REST", err);
  return res.status(500).json({ error: sanitizeClientError(err), code: "INTERNAL_SERVER_ERROR" });
}

function mapServiceError(res: Response, err: unknown) {
  if (err instanceof TRPCError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "BAD_REQUEST" ? 400 : 403;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  return internalError(res, err);
}

function assertTableRecordAccess(req: AuthRequest, res: Response, record: Record<string, unknown> | null | undefined): boolean {
  if (!record) return false;
  try {
    authz.assertOwnsEmployeeRecord(
      req.user,
      authz.getRecordEmployee(record),
      "لا يحق لك الوصول إلى هذا السجل",
      authz.getRecordCreatedBy(record),
    );
    return true;
  } catch (err) {
    if (err instanceof TRPCError) {
      forbidden(res, err.message);
      return false;
    }
    throw err;
  }
}

function assertCasesRestAccess(req: AuthRequest) {
  authz.assertSectionAccess(req.user!, "cases");
}

function assertCasesRestWrite(req: AuthRequest) {
  authz.assertSectionWrite(req.user!, "cases");
}

function assertTableRestAccess(req: AuthRequest, tableName: string) {
  authz.assertTableAccess(req.user!, tableName);
}

// ============ AUTH MIDDLEWARE ============
interface AuthRequest extends Request {
  user?: any;
}

async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "يجب تسجيل الدخول", code: "UNAUTHORIZED" });
    }
    const token = authHeader.slice(7);
    const session = await sdk.verifySession(token);
    if (!session) {
      return res.status(401).json({ error: "جلسة غير صالحة أو منتهية", code: "UNAUTHORIZED" });
    }
    const user = await db.getUserById(session.userId);
    if (!user) {
      return res.status(401).json({ error: "المستخدم غير موجود", code: "UNAUTHORIZED" });
    }
    if (Number(user.active) === 0) {
      return res.status(403).json({ error: "الحساب معطّل", code: "FORBIDDEN" });
    }
    if (Number(user.tokenVersion ?? 0) !== session.tokenVersion) {
      return res.status(401).json({ error: "جلسة غير صالحة", code: "UNAUTHORIZED" });
    }
    if (Number(user.mustChangePassword) === 1) {
      return res.status(403).json({
        error: "يجب تغيير كلمة المرور أولاً",
        code: "MUST_CHANGE_PASSWORD",
      });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "خطأ في المصادقة", code: "UNAUTHORIZED" });
  }
}

// ============ AUTH ROUTES ============

// POST /api/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    }
    const user = await authenticateLocalUserRest(req, username, password);
    await db.updateUserLastSignIn(user.id);
    await db.logActivity({ userId: user.id, username: user.username, action: "login_mobile", details: "تسجيل دخول من تطبيق الموبايل" });
    const token = await sdk.createSessionToken(
      user.id,
      user.username,
      user.role,
      Number(user.tokenVersion ?? 0),
    );
    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        mustChangePassword: Number(user.mustChangePassword) === 1,
        specialization: user.specialization,
        jobTitle: user.jobTitle,
        phone: user.phone,
      },
    });
  } catch (err: any) {
    if (err instanceof LoginError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/auth/me - get current user info
router.get("/auth/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = req.user;
  return res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    specialization: user.specialization,
    jobTitle: user.jobTitle,
    phone: user.phone,
  });
});

// ============ CASES ROUTES ============

// GET /api/cases
router.get("/cases", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCasesRestAccess(req);
    const filters: any = {};
    if (req.query.types) filters.types = (req.query.types as string).split(",");
    if (req.query.employees) filters.employees = (req.query.employees as string).split(",");
    if (req.query.search) filters.search = req.query.search as string;
    if (req.query.authorities) filters.authorities = (req.query.authorities as string).split(",");
    if (req.query.caseStatuses) filters.caseStatuses = (req.query.caseStatuses as string).split(",");
    if (req.query.currencies) filters.currencies = (req.query.currencies as string).split(",");
    if (req.query.caseReceivedFrom) filters.caseReceivedFrom = req.query.caseReceivedFrom as string;
    if (req.query.caseReceivedTo) filters.caseReceivedTo = req.query.caseReceivedTo as string;
    if (req.query.lastFollowupFrom) filters.lastFollowupFrom = req.query.lastFollowupFrom as string;
    if (req.query.lastFollowupTo) filters.lastFollowupTo = req.query.lastFollowupTo as string;
    if (req.query.expiryFrom) filters.expiryFrom = req.query.expiryFrom as string;
    if (req.query.expiryTo) filters.expiryTo = req.query.expiryTo as string;
    if (!authz.canViewAllCases(req.user!)) {
      filters.employees = [authz.employeeName(req.user!)];
    }
    const cases = await db.getAllCases(Object.keys(filters).length > 0 ? filters : undefined);
    return res.json({ success: true, data: cases, count: cases.length });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// GET /api/cases/:id
router.get("/cases/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCasesRestAccess(req);
    const id = parseInt(req.params.id);
    const c = await db.getCaseById(id);
    if (!c) return res.status(404).json({ error: "القضية غير موجودة" });
    authz.assertCaseRecordAccess(req.user!, c.employee, undefined, c.createdBy);
    return res.json({ success: true, data: c });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// POST /api/cases
router.post("/cases", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCasesRestWrite(req);
    const { type } = req.body ?? {};
    if (!type) {
      return res.status(400).json({ error: "حقل النوع مطلوب" });
    }
    const prepared = caseService.prepareCaseData(req.body as Record<string, unknown>, req.user);
    prepared.createdBy = req.user.id;
    if (authz.hasPrivilegedAccess(req.user)) {
      await caseService.checkDuplicateCaseNumber(prepared.caseNumber as string | undefined);
      await db.insertCase(prepared);
      await db.logActivity({ userId: req.user.id, username: req.user.username, action: "create_case_mobile", details: `إضافة قضية من الموبايل` });
      return res.json({ success: true, pending: false });
    }
    await submitPendingOperation({
      tableName: "cases",
      recordId: 0,
      operationType: "add",
      data: prepared,
      submittedBy: req.user.id,
      submittedByName: req.user.displayName ?? req.user.username,
      detail: String(prepared.subject || prepared.caseNumber || ""),
    });
    await db.logActivity({ userId: req.user.id, username: req.user.username, action: "create_case_mobile_pending", details: `طلب إضافة قضية من الموبايل` });
    return res.json({ success: true, pending: true });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// PUT /api/cases/:id
router.put("/cases/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCasesRestWrite(req);
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: "معرف القضية غير صالح" });
    const existing = await db.getCaseById(id);
    if (!existing) return res.status(404).json({ error: "القضية غير موجودة" });
    authz.assertCaseRecordAccess(req.user!, existing.employee, undefined, existing.createdBy);
    const { id: _id, createdAt, updatedAt, createdBy, ...raw } = req.body;
    const safeData = caseService.prepareCaseData(raw as Record<string, unknown>, req.user);
    if (authz.hasPrivilegedAccess(req.user)) {
      await caseService.checkDuplicateCaseNumber(
        safeData.caseNumber as string | undefined,
        id,
      );
      await db.updateCase(id, safeData);
      await db.logActivity({ userId: req.user.id, username: req.user.username, action: "update_case_mobile", details: `تعديل قضية رقم ${id} من الموبايل` });
      return res.json({ success: true, pending: false });
    }
    const changedData: Record<string, any> = {};
    for (const [key, newVal] of Object.entries(safeData)) {
      const origVal = (existing as any)[key];
      if (String(newVal ?? "") !== String(origVal ?? "")) {
        changedData[key] = newVal;
      }
    }
    await submitPendingOperation({
      tableName: "cases",
      recordId: id,
      operationType: "edit",
      data: changedData,
      submittedBy: req.user.id,
      submittedByName: req.user.displayName ?? req.user.username,
      detail: `قضية #${id}`,
    });
    await db.logActivity({ userId: req.user.id, username: req.user.username, action: "update_case_mobile_pending", details: `طلب تعديل قضية رقم ${id} من الموبايل` });
    return res.json({ success: true, pending: true });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// DELETE /api/cases/:id
router.delete("/cases/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCasesRestWrite(req);
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: "معرف القضية غير صالح" });
    const existing = await db.getCaseById(id);
    if (!existing) return res.status(404).json({ error: "القضية غير موجودة" });
    authz.assertCaseRecordAccess(req.user!, existing.employee, undefined, existing.createdBy);
    if (authz.hasPrivilegedAccess(req.user)) {
      await db.deleteCase(id);
      await db.logActivity({ userId: req.user.id, username: req.user.username, action: "delete_case_mobile", details: `حذف قضية رقم ${id} من الموبايل` });
      return res.json({ success: true, pending: false });
    }
    await submitPendingOperation({
      tableName: "cases",
      recordId: id,
      operationType: "delete",
      data: {},
      submittedBy: req.user.id,
      submittedByName: req.user.displayName ?? req.user.username,
      detail: `قضية #${id}`,
    });
    await db.logActivity({ userId: req.user.id, username: req.user.username, action: "delete_case_mobile_pending", details: `طلب حذف قضية رقم ${id} من الموبايل` });
    return res.json({ success: true, pending: true });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ CORRESPONDENCES ROUTES ============

const restCorrespondenceCreateSchema = z.object({
  type: z.enum(["inbox", "outbox"]),
  bookNumber: z.string().optional(),
  subject: z.string().optional(),
  senderEntity: z.string().optional(),
  receiverEntity: z.string().optional(),
  correspondenceDate: z.string().optional(),
  receivedDate: z.string().optional(),
  employee: z.string().optional(),
  employeeId: z.coerce.number().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  parentId: z.coerce.number().optional(),
  deadline: z.string().optional(),
  attachmentUrl: z.string().optional(),
  attachmentKey: z.string().optional(),
  notes: z.string().optional(),
  relatedCaseId: z.coerce.number().optional(),
  relatedCaseNumber: z.string().optional(),
  mandobOutNumber: z.string().optional(),
});

const restCorrespondenceUpdateSchema = restCorrespondenceCreateSchema.partial().omit({ type: true });

function assertCorrespondenceRestAccess(req: AuthRequest) {
  authz.assertSectionAccess(req.user!, "correspondence");
}

function assertCorrespondenceRestWrite(req: AuthRequest) {
  authz.assertSectionWrite(req.user!, "correspondence");
}

// GET /api/correspondences
router.get("/correspondences", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCorrespondenceRestAccess(req);
    const type = (req.query.type as "inbox" | "outbox") || "inbox";
    const filters: any = authz.scopeEmployeeFilter(req.user!);
    if (req.query.status && req.query.status !== "all") filters.status = req.query.status as string;
    if (req.query.search) filters.search = req.query.search as string;
    if (req.query.archived) filters.archived = req.query.archived === "true";
    const page = req.query.page ? Math.max(1, parseInt(req.query.page as string, 10)) : 1;
    const pageSize = req.query.pageSize ? Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10))) : 200;
    const result = await db.getCorrespondence(type, { ...filters, page, pageSize });
    return res.json({ success: true, data: result.items, total: result.total, count: result.items.length });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// GET /api/correspondences/stats — must be before /:id
router.get("/correspondences/stats", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCorrespondenceRestAccess(req);
    const employee = !authz.hasPrivilegedAccess(req.user!)
      ? req.user!.displayName
      : (req.query.employee as string | undefined);
    const stats = await db.getCorrespondenceStats(employee);
    return res.json({ success: true, data: stats });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// GET /api/correspondences/:id
router.get("/correspondences/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCorrespondenceRestAccess(req);
    const id = parseInt(req.params.id);
    const data = await db.getCorrespondenceById(id);
    if (!data) return res.status(404).json({ error: "المراسلة غير موجودة" });
    try {
      authz.assertCorrespondenceAccess(req.user!, data);
    } catch {
      return forbidden(res, "لا يحق لك الوصول إلى هذه المراسلة");
    }
    return res.json({ success: true, data });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// POST /api/correspondences
router.post("/correspondences", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCorrespondenceRestWrite(req);
    const parsed = restCorrespondenceCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
    const payload = await correspondenceService.prepareCorrespondenceCreate(req.user!, parsed.data as Record<string, unknown> & { type: "inbox" | "outbox" });
    const id = await db.createCorrespondence(payload);
    await correspondenceService.addCorrespondenceTrail(id, "received", req.user!, { notes: parsed.data.subject || parsed.data.bookNumber });
    await db.logActivity({
      userId: req.user!.id,
      username: req.user!.username,
      action: "create_correspondence",
      details: `إضافة مراسلة: ${parsed.data.subject || parsed.data.bookNumber}`,
    });
    return res.status(201).json({ success: true, id, autoNumber: payload.autoNumber, officialNumber: payload.officialNumber, legalOutNumber: payload.legalOutNumber });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
    return internalError(res, err);
  }
});

// PUT /api/correspondences/:id
router.put("/correspondences/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCorrespondenceRestWrite(req);
    const id = parseInt(req.params.id);
    const existing = await db.getCorrespondenceById(id);
    if (!existing) return res.status(404).json({ error: "المراسلة غير موجودة" });
    try {
      authz.assertCorrespondenceAccess(req.user!, existing);
    } catch {
      return forbidden(res, "لا يحق لك تعديل هذه المراسلة");
    }
    const parsed = restCorrespondenceUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
    let data = correspondenceService.sanitizeCorrespondenceUpdate(req.user!, parsed.data as Record<string, unknown>);
    if (parsed.data.relatedCaseId !== undefined) {
      const caseFields = await correspondenceService.resolveCaseFields(parsed.data.relatedCaseId, req.user!);
      data = { ...data, ...caseFields };
    }
    data = await correspondenceService.applyOfficialOutNumberUpdate(existing, data);
    await db.updateCorrespondence(id, data);
    await db.logActivity({
      userId: req.user!.id,
      username: req.user!.username,
      action: "update_correspondence",
      details: `تحديث مراسلة رقم ${id}`,
    });
    return res.json({ success: true, message: "تم تحديث المراسلة" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// DELETE /api/correspondences/:id
router.delete("/correspondences/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCorrespondenceRestWrite(req);
    const id = parseInt(req.params.id);
    const existing = await db.getCorrespondenceById(id);
    if (!existing) return res.status(404).json({ error: "المراسلة غير موجودة" });
    try {
      authz.assertCorrespondenceAccess(req.user!, existing);
    } catch {
      return forbidden(res, "لا يحق لك حذف هذه المراسلة");
    }
    await db.deleteCorrespondence(id);
    await db.logActivity({
      userId: req.user!.id,
      username: req.user!.username,
      action: "delete_correspondence",
      details: `حذف مراسلة رقم ${id}`,
    });
    return res.json({ success: true, message: "تم حذف المراسلة" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// POST /api/correspondences/:id/archive
router.post("/correspondences/:id/archive", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCorrespondenceRestWrite(req);
    const id = parseInt(req.params.id);
    const existing = await db.getCorrespondenceById(id);
    if (!existing) return res.status(404).json({ error: "المراسلة غير موجودة" });
    authz.assertCorrespondenceAccess(req.user!, existing);
    await db.archiveCorrespondence(id);
    await correspondenceService.addCorrespondenceTrail(id, "archived", req.user!);
    return res.json({ success: true, message: "تمت الأرشفة" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// ============ FORGERIES (FORGED CHECKS) ============

// GET /api/forgeries
router.get("/forgeries", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertTableRestAccess(req, "forged_checks");
    const filters = authz.scopeEmployeeFilter(req.user);
    if (req.query.search) filters.search = req.query.search as string;
    const data = await db.getTableRecords("forged_checks", filters);
    return res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// GET /api/forgeries/:id
router.get("/forgeries/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertTableRestAccess(req, "forged_checks");
    const id = parseInt(req.params.id);
    const data = await db.getTableRecord("forged_checks", id);
    if (!data) return res.status(404).json({ error: "السجل غير موجود" });
    if (!assertTableRecordAccess(req, res, data as Record<string, unknown>)) return;
    return res.json({ success: true, data });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ INVESTIGATIONS ============

// GET /api/investigations
router.get("/investigations", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertTableRestAccess(req, "investigation_cases");
    const filters = authz.scopeEmployeeFilter(req.user);
    if (req.query.search) filters.search = req.query.search as string;
    const data = await db.getTableRecords("investigation_cases", filters);
    return res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// GET /api/investigations/:id
router.get("/investigations/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertTableRestAccess(req, "investigation_cases");
    const id = parseInt(req.params.id);
    const data = await db.getTableRecord("investigation_cases", id);
    if (!data) return res.status(404).json({ error: "السجل غير موجود" });
    if (!assertTableRecordAccess(req, res, data as Record<string, unknown>)) return;
    return res.json({ success: true, data });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ COMPENSATION CASES ============

// GET /api/compensation-cases
router.get("/compensation-cases", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertTableRestAccess(req, "compensation_cases");
    const filters = authz.scopeEmployeeFilter(req.user);
    if (req.query.search) filters.search = req.query.search as string;
    const data = await db.getTableRecords("compensation_cases", filters);
    return res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ PERSONAL GUARANTEES ============

// GET /api/personal-guarantees
router.get("/personal-guarantees", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertTableRestAccess(req, "personal_guarantees");
    const filters = authz.scopeEmployeeFilter(req.user);
    if (req.query.search) filters.search = req.query.search as string;
    const data = await db.getTableRecords("personal_guarantees", filters);
    return res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ BANK PROPERTIES ============

// GET /api/bank-properties
router.get("/bank-properties", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertTableRestAccess(req, "bank_properties");
    const filters = authz.scopeEmployeeFilter(req.user);
    if (req.query.search) filters.search = req.query.search as string;
    const data = await db.getTableRecords("bank_properties", filters);
    return res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ MORTGAGED PROPERTIES ============

// GET /api/mortgaged-properties
router.get("/mortgaged-properties", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertTableRestAccess(req, "mortgaged_properties");
    const filters = authz.scopeEmployeeFilter(req.user);
    if (req.query.search) filters.search = req.query.search as string;
    const data = await db.getTableRecords("mortgaged_properties", filters);
    return res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ APPOINTMENTS ============

const restAppointmentCreateSchema = z.object({
  title: z.string().min(1),
  appointmentDate: z.string().min(1),
  appointmentTime: z.string().optional(),
  appointmentType: z.string().optional(),
  caseId: z.coerce.number().optional(),
  caseNumber: z.string().optional(),
  location: z.string().optional(),
  employee: z.string().optional(),
  employeeId: z.coerce.number().optional(),
  reminderBefore: z.string().optional(),
  notes: z.string().optional(),
});

const restAppointmentUpdateSchema = restAppointmentCreateSchema.partial().extend({
  status: z.enum(["upcoming", "completed", "cancelled"]).optional(),
});

function assertAppointmentRestAccess(req: AuthRequest) {
  authz.assertSectionAccess(req.user!, "appointments");
}

function assertAppointmentRestWrite(req: AuthRequest) {
  authz.assertSectionWrite(req.user!, "appointments");
}

// GET /api/appointments
router.get("/appointments", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertAppointmentRestAccess(req);
    const filters: any = authz.scopeEmployeeFilter(req.user!);
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.month) filters.month = req.query.month as string;
    const data = await db.getAppointments(filters);
    return res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// GET /api/appointments/upcoming
router.get("/appointments/upcoming", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertAppointmentRestAccess(req);
    const employee = !authz.hasPrivilegedAccess(req.user!)
      ? req.user!.displayName
      : (req.query.employee as string | undefined);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const data = await db.getUpcomingAppointments(employee, limit);
    return res.json({ success: true, data, count: data.length });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// GET /api/appointments/conflicts
router.get("/appointments/conflicts", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertAppointmentRestAccess(req);
    const date = String(req.query.date || "");
    const time = String(req.query.time || "");
    const employee = String(req.query.employee || "");
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : undefined;
    if (!date || !employee) return res.status(400).json({ error: "التاريخ والموظف مطلوبان" });
    appointmentService.assertEmployeeScheduleAccess(req.user!, employee);
    const data = await db.checkAppointmentConflicts(date, time, employee, excludeId);
    return res.json({ success: true, data });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// GET /api/appointments/availability
router.get("/appointments/availability", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertAppointmentRestAccess(req);
    const date = String(req.query.date || "");
    const employee = String(req.query.employee || "");
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
    if (!date || !employee) return res.status(400).json({ error: "التاريخ والموظف مطلوبان" });
    appointmentService.assertEmployeeScheduleAccess(req.user!, employee, employeeId);
    const data = await db.getEmployeeAppointmentsOnDate(date, employee);
    return res.json({ success: true, data });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// GET /api/appointments/:id
router.get("/appointments/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertAppointmentRestAccess(req);
    const id = parseInt(req.params.id);
    const data = await db.getAppointmentById(id);
    if (!data) return res.status(404).json({ error: "الموعد غير موجود" });
    try {
      authz.assertAppointmentAccess(req.user!, data);
    } catch {
      return forbidden(res, "لا يحق لك الوصول إلى هذا الموعد");
    }
    return res.json({ success: true, data });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// POST /api/appointments
router.post("/appointments", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertAppointmentRestWrite(req);
    const parsed = restAppointmentCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
    const payload = await appointmentService.prepareAppointmentCreate(req.user!, parsed.data as Record<string, unknown>);
    const id = await db.createAppointment(payload);
    await db.logActivity({
      userId: req.user!.id,
      username: req.user!.username,
      action: "create_appointment",
      details: `إضافة موعد: ${parsed.data.title}`,
    });
    return res.status(201).json({ success: true, id, message: "تمت إضافة الموعد" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
    return internalError(res, err);
  }
});

// PUT /api/appointments/:id
router.put("/appointments/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertAppointmentRestWrite(req);
    const id = parseInt(req.params.id);
    const existing = await db.getAppointmentById(id);
    if (!existing) return res.status(404).json({ error: "الموعد غير موجود" });
    try {
      authz.assertAppointmentAccess(req.user!, existing);
    } catch {
      return forbidden(res, "لا يحق لك تعديل هذا الموعد");
    }
    const parsed = restAppointmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
    let data = appointmentService.sanitizeAppointmentUpdate(req.user!, parsed.data as Record<string, unknown>, existing);
    if (authz.hasPrivilegedAccess(req.user!) && parsed.data.employeeId) {
      const employeeFields = await appointmentService.resolveEmployeeFields(req.user!, {
        employeeId: parsed.data.employeeId,
        employee: parsed.data.employee,
      });
      data = { ...data, ...employeeFields };
    }
    if (parsed.data.caseId !== undefined) {
      const caseFields = await appointmentService.resolveCaseFields(parsed.data.caseId, req.user!);
      data = { ...data, ...caseFields };
    }
    await db.updateAppointment(id, data);
    await db.logActivity({
      userId: req.user!.id,
      username: req.user!.username,
      action: "update_appointment",
      details: `تحديث موعد رقم ${id}`,
    });
    return res.json({ success: true, message: "تم تحديث الموعد" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
    return internalError(res, err);
  }
});

// DELETE /api/appointments/:id
router.delete("/appointments/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertAppointmentRestWrite(req);
    const id = parseInt(req.params.id);
    const existing = await db.getAppointmentById(id);
    if (!existing) return res.status(404).json({ error: "الموعد غير موجود" });
    try {
      authz.assertAppointmentAccess(req.user!, existing);
    } catch {
      return forbidden(res, "لا يحق لك حذف هذا الموعد");
    }
    await db.deleteAppointment(id);
    await db.logActivity({
      userId: req.user!.id,
      username: req.user!.username,
      action: "delete_appointment",
      details: `حذف موعد رقم ${id}`,
    });
    return res.json({ success: true, message: "تم حذف الموعد" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// ============ QUARTERLY REPORT ============

// GET /api/quarterly-report
router.get("/quarterly-report", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    authz.assertSectionAccess(req.user!, "quarterly_status");
    const statusFilter = req.query.status as string | undefined;
    const employee = authz.canViewAllCases(req.user!) ? undefined : authz.employeeName(req.user!);
    const page = req.query.page ? Math.max(1, parseInt(req.query.page as string, 10)) : 1;
    const pageSize = req.query.pageSize ? Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10))) : 100;
    const casesResult = await db.getIntegrityCases(statusFilter, { province: PLATFORM_GOVERNORATE, employee, page, pageSize });
    const stats = await db.getIntegrityCasesStats({ province: PLATFORM_GOVERNORATE, employee });
    return res.json({ success: true, data: { cases: casesResult.items, stats, total: casesResult.total } });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// GET /api/quarterly-report/periodic
router.get("/quarterly-report/periodic", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    authz.assertSectionAccess(req.user!, "quarterly_status");
    const periodType = (req.query.periodType as "monthly" | "quarterly" | "annual") || "quarterly";
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : undefined;
    const statusFilter = req.query.status as string | undefined;
    const employee = authz.canViewAllCases(req.user!) ? undefined : authz.employeeName(req.user!);
    const data = await db.getPeriodicReport(periodType, year, month, quarter, statusFilter, { province: PLATFORM_GOVERNORATE, employee });
    return res.json({ success: true, data });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ DASHBOARD STATS ============

// GET /api/dashboard/stats
router.get("/dashboard/stats", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const employee = authz.hasPrivilegedAccess(req.user!) || authz.canViewAllCases(req.user!)
      ? undefined
      : authz.employeeName(req.user!);
    const submittedBy = authz.hasPrivilegedAccess(req.user!) ? undefined : req.user!.id;
    const stats = await db.getDashboardStats({ province: PLATFORM_GOVERNORATE, employee, submittedBy });
    return res.json({ success: true, data: stats });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// GET /api/dashboard/employee-ratings
router.get("/dashboard/employee-ratings", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user!)) {
      return forbidden(res, "غير مصرح — للمدير أو الإداري فقط");
    }
    const data = await db.getEmployeeRatings();
    return res.json({ success: true, data });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// GET /api/dashboard/activity-log
router.get("/dashboard/activity-log", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user)) {
      return forbidden(res, "غير مصرح — للمدير والإداري فقط");
    }
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 500) : 200;
    const page = req.query.page ? Math.max(1, parseInt(req.query.page as string, 10)) : undefined;
    const pageSize = req.query.pageSize ? Math.min(500, Math.max(1, parseInt(req.query.pageSize as string, 10))) : undefined;
    const result = await db.getActivityLog({ limit, page, pageSize });
    return res.json({ success: true, data: result.items, total: result.total });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// ============ NOTIFICATIONS ============

// GET /api/notifications
router.get("/notifications", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 200) : 100;
    const data = await db.getNotificationsForUser(
      req.user.id,
      authz.employeeName(req.user),
      limit,
      type,
    );
    return res.json({ success: true, data });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// GET /api/notifications/unread-count
router.get("/notifications/unread-count", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const count = await db.getUnreadNotificationCountForUser(req.user.id, authz.employeeName(req.user));
    return res.json({ success: true, count });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// POST /api/notifications/:id/read
router.post("/notifications/:id/read", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const ok = await db.markNotificationRead(id, req.user);
    if (!ok) return forbidden(res, "لا يحق لك تعديل هذا الإشعار");
    return res.json({ success: true });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// POST /api/notifications/read-all
router.post("/notifications/read-all", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await db.markAllNotificationsRead(req.user.id, authz.employeeName(req.user));
    return res.json({ success: true });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// ============ PENDING APPROVALS ============

// GET /api/pending/count
router.get("/pending/count", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user)) return forbidden(res, "غير مصرح — للمدير أو الإداري");
    const count = await db.getPendingOperationsCount("pending");
    return res.json({ success: true, count });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// GET /api/pending/my
router.get("/pending/my", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const data = await db.getPendingOperationsBySubmitter(req.user.id, status);
    return res.json({ success: true, data });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// GET /api/pending
router.get("/pending", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user)) return forbidden(res, "غير مصرح — للمدير أو الإداري");
    const status = req.query.status as string | undefined;
    const ops = await db.getPendingOperations(status);
    const data = await pendingService.enrichPendingOperations(ops);
    return res.json({ success: true, data });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// GET /api/pending/:id
router.get("/pending/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const op = await db.getPendingOperationById(id);
    if (!op) return res.status(404).json({ error: "العملية غير موجودة" });
    if (!authz.hasPrivilegedAccess(req.user) && op.submittedBy !== req.user.id) {
      return forbidden(res, "لا يحق لك عرض هذا الطلب");
    }
    const data = await pendingService.enrichPendingOperation(op);
    return res.json({ success: true, data });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// POST /api/pending/:id/approve
router.post("/pending/:id/approve", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user)) return forbidden(res, "غير مصرح — للمدير أو الإداري");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const result = await pendingService.approvePendingOperation(id, req.user, req.body?.modifiedData);
    return res.json(result);
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// POST /api/pending/:id/reject
router.post("/pending/:id/reject", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user)) return forbidden(res, "غير مصرح — للمدير أو الإداري");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const result = await pendingService.rejectPendingOperation(id, req.user, req.body?.note);
    return res.json(result);
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ USERS (Admin only) ============

// GET /api/users
router.get("/users", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const users = await db.getAllUsers();
    return res.json({
      success: true,
      data: users.map((u: any) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        specialization: u.specialization,
        jobTitle: u.jobTitle,
        phone: u.phone,
        lastSignIn: u.lastSignIn,
      })),
    });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// ============ LEGAL REVIEWS ============

function assertLegalReviewRestAccess(req: AuthRequest) {
  authz.assertSectionAccess(req.user!, "legal_reviews");
}

function assertLegalReviewRestWrite(req: AuthRequest) {
  authz.assertSectionWrite(req.user!, "legal_reviews");
}

// POST /api/legal-reviews (create new review request)
router.post("/legal-reviews", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertLegalReviewRestWrite(req);
    await legalReviewFollowupService.assertCanCreateLegalReview(req.user!);
    const { title, reviewDate, location, priority, description, assignedTo, assignedToId, requestDate, relatedCaseId, attachmentUrl } = req.body;
    if (!title) return res.status(400).json({ error: "عنوان الطلب مطلوب" });
    if (relatedCaseId) {
      await caseService.assertOptionalCaseAccess(req.user!, Number(relatedCaseId));
    }
    const priorityMap: Record<string, string> = { high: "urgent", low: "normal", medium: "medium", urgent: "urgent", normal: "normal" };
    const mappedPriority = (priority && priorityMap[priority]) ? priorityMap[priority] : "normal";
    const payload = legalReviewService.prepareLegalReviewCreate(req.user!, {
      title,
      reviewDate: reviewDate || new Date().toISOString().split("T")[0],
      location,
      priority: mappedPriority,
      description,
      assignedTo,
      assignedToId: assignedToId ? Number(assignedToId) : undefined,
      requestDate,
      relatedCaseId: relatedCaseId ? Number(relatedCaseId) : undefined,
      attachmentUrl,
    });
    const id = await db.createLegalReview(payload);
    if (assignedToId && authz.hasPrivilegedAccess(req.user!)) {
      await legalReviewService.notifyLegalReviewAssigned(id, Number(assignedToId), title);
    }
    await legalReviewService.addLegalReviewTrail(id, "created", req.user!, title);
    await db.logActivity({ userId: req.user!.id, username: req.user!.username, action: "create_legal_review", details: `إنشاء طلب مراجعة: ${title}` });
    return res.status(201).json({ success: true, id, message: "تم تقديم الطلب بنجاح" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
    return internalError(res, err);
  }
});

// GET /api/legal-reviews/create-block
router.get("/legal-reviews/create-block", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertLegalReviewRestAccess(req);
    const block = await legalReviewFollowupService.getLegalReviewCreateBlockers(req.user!);
    return res.json({ success: true, data: block });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// GET /api/legal-reviews/:id
router.get("/legal-reviews/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertLegalReviewRestAccess(req);
    const id = Number(req.params.id);
    const review = await db.getLegalReviewById(id);
    if (!review) return res.status(404).json({ error: "الطلب غير موجود" });
    if (!authz.hasPrivilegedAccess(req.user!)) {
      if (review.createdBy !== req.user!.id && review.assignedToId !== req.user!.id) {
        return forbidden(res, "غير مصرح");
      }
    }
    return res.json({ success: true, data: review });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// PUT /api/legal-reviews/:id
router.put("/legal-reviews/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertLegalReviewRestWrite(req);
    const id = Number(req.params.id);
    const existing = await db.getLegalReviewById(id);
    if (!existing) return res.status(404).json({ error: "الطلب غير موجود" });
    authz.assertLegalReviewAccess(req.user!, existing);
    const data = legalReviewService.sanitizeLegalReviewUpdate(req.user!, req.body);
    await db.updateLegalReview(id, data);
    if (req.body.assignedToId && authz.hasPrivilegedAccess(req.user!) && Number(req.body.assignedToId) !== existing.assignedToId) {
      await legalReviewService.notifyLegalReviewAssigned(id, Number(req.body.assignedToId), existing.title);
      await legalReviewService.addLegalReviewTrail(id, "assigned", req.user!, req.body.assignedTo);
    }
    await db.logActivity({ userId: req.user!.id, username: req.user!.username, action: "update_legal_review", details: `تحديث طلب مراجعة رقم ${id}` });
    return res.json({ success: true, message: "تم التحديث" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// DELETE /api/legal-reviews/:id
router.delete("/legal-reviews/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertLegalReviewRestWrite(req);
    const id = Number(req.params.id);
    const existing = await db.getLegalReviewById(id);
    if (!existing) return res.status(404).json({ error: "الطلب غير موجود" });
    authz.assertLegalReviewDelete(req.user!, existing);
    await db.deleteLegalReview(id);
    await db.logActivity({ userId: req.user!.id, username: req.user!.username, action: "delete_legal_review", details: `حذف طلب مراجعة رقم ${id}` });
    return res.json({ success: true, message: "تم الحذف" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// GET /api/legal-reviews
router.get("/legal-reviews", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertLegalReviewRestAccess(req);
    const filters: any = {};
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.priority) filters.priority = req.query.priority as string;
    if (req.query.search) filters.search = req.query.search as string;
    if (req.query.assignedTo) filters.assignedTo = req.query.assignedTo as string;
    if (!authz.hasPrivilegedAccess(req.user!)) {
      filters.userId = req.user!.id;
    }
    if (req.query.page) filters.page = Math.max(1, parseInt(req.query.page as string, 10));
    if (req.query.pageSize) filters.pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10)));
    const result = await db.getLegalReviews(Object.keys(filters).length > 0 ? filters : undefined);
    return res.json({ success: true, data: result.items, total: result.total, count: result.items.length });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

// POST /api/legal-reviews/:id/approve
router.post("/legal-reviews/:id/approve", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user!)) return forbidden(res, "غير مصرح");
    const id = Number(req.params.id);
    const { reviewNotes } = req.body;
    await legalReviewService.approveLegalReview(id, req.user!, reviewNotes);
    return res.json({ success: true, message: "تمت الموافقة" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    return internalError(res, err);
  }
});

// POST /api/legal-reviews/:id/reject
router.post("/legal-reviews/:id/reject", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user!)) return forbidden(res, "غير مصرح");
    const id = Number(req.params.id);
    const { reviewNotes } = req.body;
    if (!reviewNotes) return res.status(400).json({ error: "يرجى ذكر سبب الرفض" });
    await legalReviewService.rejectLegalReview(id, req.user!, reviewNotes);
    return res.json({ success: true, message: "تم الرفض" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    return internalError(res, err);
  }
});

// POST /api/legal-reviews/:id/followup
router.post("/legal-reviews/:id/followup", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    authz.assertSectionWrite(req.user!, "legal_reviews");
    const id = Number(req.params.id);
    const { lastActions } = req.body;
    if (!lastActions?.trim()) return res.status(400).json({ error: "يرجى إدخال آخر الإجراءات" });
    await legalReviewFollowupService.submitLegalReviewFollowup(id, req.user!, lastActions);
    return res.json({ success: true, message: "تم إرسال المتابعة للموافقة" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
    return internalError(res, err);
  }
});

// POST /api/legal-reviews/:id/followup/approve
router.post("/legal-reviews/:id/followup/approve", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user!)) return forbidden(res, "غير مصرح");
    const id = Number(req.params.id);
    const result = await legalReviewFollowupService.approveLegalReviewFollowup(id, req.user!);
    return res.json({ success: true, message: "تم اعتماد المتابعة وتحديث القضية", caseId: result.caseId });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
    return internalError(res, err);
  }
});

// POST /api/legal-reviews/:id/followup/reject
router.post("/legal-reviews/:id/followup/reject", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user!)) return forbidden(res, "غير مصرح");
    const id = Number(req.params.id);
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: "يرجى ذكر سبب الرفض" });
    await legalReviewFollowupService.rejectLegalReviewFollowup(id, req.user!, note);
    return res.json({ success: true, message: "تم رفض المتابعة" });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
    return internalError(res, err);
  }
});

// ============ CASES MAP STATS ============

// GET /api/cases-map
router.get("/cases-map", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    assertCasesRestAccess(req);
    const timeFilter = req.query.timeFilter as string | undefined;
    const employee = authz.canViewAllCases(req.user!) ? undefined : authz.employeeName(req.user!);
    const data = await db.getCasesMapStats({ timeFilter, employee });
    return res.json({ success: true, data });
  } catch (err: any) {
    return mapServiceError(res, err);
  }
});

// ============ PERFORMANCE STATS ============

// GET /api/performance-stats
router.get("/performance-stats", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!authz.hasPrivilegedAccess(req.user!)) {
      return forbidden(res, "غير مصرح — للمدير أو الإداري فقط");
    }
    const data = await db.getPerformanceStats();
    return res.json({ success: true, data });
  } catch (err: any) {
    return internalError(res, err);
  }
});

// ============ OVERDUE CORRESPONDENCE ============

// GET /api/overdue-correspondence
router.get("/overdue-correspondence", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    authz.assertSectionAccess(req.user!, "correspondence");
    const all = await db.getOverdueCorrespondence();
    const data = authz.hasPrivilegedAccess(req.user!)
      ? all
      : all.filter((r: { employee?: string | null }) => r.employee === req.user!.displayName);
    return res.json({ success: true, data });
  } catch (err: any) {
    if (err.code === "FORBIDDEN") return forbidden(res, err.message);
    return internalError(res, err);
  }
});

export default router;
