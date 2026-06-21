import { eq, and, desc, like, or, sql, asc, inArray, count, isNotNull, isNull, ne, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { hashPassword } from "./_core/password";
import {
  users, InsertUser,
  cases,
  compensationCases,
  personalGuarantees,
  investigationCases,
  bankProperties,
  mortgagedProperties,
  antiCorruptionReports,
  generalFiles,
  pendingOperations,
  notifications,
  chatMessages,
  activityLog,
  forgedChecks,
  customSections,
  customSectionRecords,
  customCaseTypes,
  correspondenceEntities,
  sectionConfig,
  appSettings,
  correspondence,
  correspondenceTrail,
  correspondenceAssignments,
  correspondenceOutboxNumbering,
  correspondenceAutoNumbering,
  appointments,
  legalReviews,
  legalReviewTrail,
  auditLog,
  caseAttachments,
} from "../drizzle/schema";
import { normalizeProvinceName, MAP_ALERT_PROCESSING_THRESHOLD } from "../shared/mapUtils";
import { DAMAGE_HAS_AMOUNT_SQL_REGEX } from "../shared/damageUtils";
import { findBranchByField, aggregateBranchStatsById } from "../shared/branchUtils";
import { getBranchMatchPatterns, CASE_PAGE_SIZE_DEFAULT, CASE_PAGE_SIZE_MAX, normalizeCasePayload } from "../shared/caseUtils";
import { prepareGenericTableData, isPropertyTable } from "../shared/tableRecordUtils";
import { DEFAULT_BUILTIN_SECTIONS, isBuiltinSectionKey, isManageableCmsSection } from "../shared/cmsSections";
import { getPlatformBranches } from "../shared/branchUtils";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ===== User functions =====
export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getActiveUserPicklist() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.active, 1))
    .orderBy(asc(users.displayName));
}

export async function getCasesByIds(ids: number[]) {
  const db = await getDb();
  if (!db || !ids.length) return [];
  return db.select().from(cases).where(inArray(cases.id, ids));
}

export async function getTableRecordsByIds(tableName: string, ids: number[]) {
  const db = await getDb();
  if (!db || !ids.length) return [];
  const table = tableMap[tableName];
  if (!table) return [];
  return db.select().from(table).where(inArray(table.id, ids));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    role: users.role,
    specialization: users.specialization,
    jobTitle: users.jobTitle,
    phone: users.phone,
    branch: users.branch,
    permissions: users.permissions,
    active: users.active,
    mustChangePassword: users.mustChangePassword,
    telegramChatId: users.telegramChatId,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.createdAt));
}

export async function countPrivilegedUsers(excludeId?: number) {
  const db = await getDb();
  if (!db) return 0;
  const conds = [or(eq(users.role, "admin"), eq(users.role, "supervisor"))!];
  if (excludeId != null) conds.push(ne(users.id, excludeId));
  const [row] = await db.select({ c: sql<number>`count(*)` }).from(users).where(and(...conds));
  return row?.c ?? 0;
}

/** @deprecated استخدم countPrivilegedUsers */
export async function countAdmins(excludeId?: number) {
  return countPrivilegedUsers(excludeId);
}

export async function incrementUserTokenVersion(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, id));
}

export async function syncEmployeeDisplayName(userId: number, oldName: string, newName: string) {
  const db = await getDb();
  if (!db || !oldName.trim() || oldName === newName) return;
  const tablesWithEmployee = [
    cases, compensationCases, personalGuarantees, investigationCases,
    bankProperties, mortgagedProperties, antiCorruptionReports, generalFiles, forgedChecks,
  ];
  for (const table of tablesWithEmployee) {
    try {
      if ("employee" in table) {
        await db.update(table).set({ employee: newName }).where(eq((table as any).employee, oldName));
      }
    } catch (err) {
      console.warn("[users] syncEmployeeDisplayName failed for table:", err);
    }
  }
  try {
    await db.update(correspondence).set({ employee: newName }).where(eq(correspondence.employee, oldName));
    await db.update(appointments).set({ employee: newName }).where(eq(appointments.employee, oldName));
  } catch {
    // optional tables
  }
}

export async function getUserActivityLog(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const user = await getUserById(userId);
  if (!user) return [];
  return db.select().from(activityLog)
    .where(or(eq(activityLog.userId, userId), eq(activityLog.username, user.username))!)
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

export async function getUserRecordStats(userId: number, displayName: string) {
  const db = await getDb();
  if (!db) return { cases: 0, correspondence: 0, appointments: 0 };
  const nameCond = or(eq(cases.employee, displayName), eq(cases.createdBy, userId))!;
  const [caseRow] = await db.select({ c: sql<number>`count(*)` }).from(cases).where(nameCond);
  const [corrRow] = await db.select({ c: sql<number>`count(*)` }).from(correspondence)
    .where(or(eq(correspondence.employee, displayName), eq(correspondence.createdBy, userId))!);
  const [apptRow] = await db.select({ c: sql<number>`count(*)` }).from(appointments)
    .where(or(eq(appointments.employee, displayName), eq(appointments.createdBy, userId))!);
  return {
    cases: caseRow?.c ?? 0,
    correspondence: corrRow?.c ?? 0,
    appointments: apptRow?.c ?? 0,
  };
}

export async function createUser(data: {
  username: string;
  password: string;
  displayName: string;
  role: "user" | "admin" | "supervisor";
  specialization?: string;
  jobTitle?: string;
  phone?: string;
  branch?: string;
  permissions?: Record<string, boolean>;
  mustChangePassword?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  const hashedPassword = await hashPassword(data.password);
  await db.insert(users).values({
    openId: `local_${data.username}`,
    username: data.username,
    password: hashedPassword,
    displayName: data.displayName,
    name: data.displayName,
    role: data.role,
    loginMethod: "local",
    specialization: data.specialization ?? null,
    jobTitle: data.jobTitle ?? null,
    phone: data.phone ?? null,
    branch: data.branch ?? null,
    permissions: data.role === "user" ? (data.permissions ?? null) : null,
    mustChangePassword: data.mustChangePassword ? 1 : 0,
    active: 1,
    tokenVersion: 0,
  });
}

export async function updateUser(id: number, data: Partial<{
  displayName: string;
  name: string;
  role: "user" | "admin" | "supervisor";
  specialization: string;
  jobTitle: string;
  phone: string;
  branch: string;
  permissions: any;
  active: number;
  mustChangePassword: number;
}>) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, id));
}

export async function updateUserPassword(id: number, newPassword: string, options?: { clearMustChange?: boolean; bumpToken?: boolean }) {
  const db = await getDb();
  if (!db) return;
  const hashedPassword = await hashPassword(newPassword);
  const patch: Record<string, unknown> = { password: hashedPassword };
  if (options?.clearMustChange) patch.mustChangePassword = 0;
  if (options?.bumpToken !== false) {
    await db.update(users).set({ ...patch, tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, id));
    return;
  }
  await db.update(users).set(patch).where(eq(users.id, id));
}

export async function updateUserLastSignIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(users).values(user).onDuplicateKeyUpdate({
      set: { lastSignedIn: new Date() },
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
  }
}

// ===== Cases functions =====
export type CaseListFilters = {
  types?: string[];
  employees?: string[];
  search?: string;
  authorities?: string[];
  damageStatuses?: string[];
  currencies?: string[];
  caseStatuses?: string[];
  provinces?: string[];
  branches?: string[];
  caseReceivedFrom?: string;
  caseReceivedTo?: string;
  lastFollowupFrom?: string;
  lastFollowupTo?: string;
  expiryFrom?: string;
  expiryTo?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

function notArchivedCaseCondition() {
  return or(eq(cases.archived, 0), sql`${cases.archived} IS NULL`)!;
}

function buildCaseConditions(filters?: CaseListFilters) {
  const conditions = [];

  if (!filters?.includeArchived) {
    conditions.push(notArchivedCaseCondition());
  }
  if (filters?.types && filters.types.length > 0) conditions.push(inArray(cases.type, filters.types));
  if (filters?.employees && filters.employees.length > 0) conditions.push(inArray(cases.employee, filters.employees));
  if (filters?.authorities && filters.authorities.length > 0) conditions.push(inArray(cases.authority, filters.authorities));
  if (filters?.currencies && filters.currencies.length > 0) conditions.push(inArray(cases.currency as any, filters.currencies));
  if (filters?.caseStatuses && filters.caseStatuses.length > 0) conditions.push(inArray(cases.caseStatus, filters.caseStatuses));
  if (filters?.provinces && filters.provinces.length > 0) conditions.push(inArray(cases.province, filters.provinces));

  if (filters?.branches && filters.branches.length > 0) {
    const branchOr: ReturnType<typeof like>[] = [];
    for (const bf of filters.branches) {
      for (const pattern of getBranchMatchPatterns(bf)) {
        branchOr.push(like(cases.branch, `%${pattern}%`));
        branchOr.push(eq(cases.branch, pattern));
      }
    }
    if (branchOr.length > 0) conditions.push(or(...branchOr)!);
  }

  if (filters?.caseReceivedFrom) conditions.push(sql`STR_TO_DATE(${cases.caseReceived}, '%Y-%m-%d') >= STR_TO_DATE(${filters.caseReceivedFrom}, '%Y-%m-%d')`);
  if (filters?.caseReceivedTo) conditions.push(sql`STR_TO_DATE(${cases.caseReceived}, '%Y-%m-%d') <= STR_TO_DATE(${filters.caseReceivedTo}, '%Y-%m-%d')`);
  if (filters?.lastFollowupFrom) conditions.push(sql`STR_TO_DATE(${cases.lastFollowup}, '%Y-%m-%d') >= STR_TO_DATE(${filters.lastFollowupFrom}, '%Y-%m-%d')`);
  if (filters?.lastFollowupTo) conditions.push(sql`STR_TO_DATE(${cases.lastFollowup}, '%Y-%m-%d') <= STR_TO_DATE(${filters.lastFollowupTo}, '%Y-%m-%d')`);
  if (filters?.expiryFrom) conditions.push(sql`STR_TO_DATE(${cases.expiry}, '%Y-%m-%d') >= STR_TO_DATE(${filters.expiryFrom}, '%Y-%m-%d')`);
  if (filters?.expiryTo) conditions.push(sql`STR_TO_DATE(${cases.expiry}, '%Y-%m-%d') <= STR_TO_DATE(${filters.expiryTo}, '%Y-%m-%d')`);

  if (filters?.damageStatuses && filters.damageStatuses.length > 0) {
    const dmgConditions = [];
    if (filters.damageStatuses.includes("has_damage")) {
      dmgConditions.push(sql`${cases.damage} REGEXP ${DAMAGE_HAS_AMOUNT_SQL_REGEX}`);
    }
    if (filters.damageStatuses.includes("no_damage")) {
      dmgConditions.push(or(
        sql`${cases.damage} = ''`,
        sql`${cases.damage} IS NULL`,
        sql`(${cases.damage} LIKE '%لايوجد%' OR ${cases.damage} LIKE '%لا يوجد%') AND ${cases.damage} NOT REGEXP ${DAMAGE_HAS_AMOUNT_SQL_REGEX}`,
      )!);
    }
    if (filters.damageStatuses.includes("unspecified")) {
      dmgConditions.push(sql`${cases.damage} IS NULL`);
    }
    if (dmgConditions.length > 0) conditions.push(or(...dmgConditions)!);
  }

  if (filters?.search) {
    conditions.push(
      or(
        like(cases.subject, `%${filters.search}%`),
        like(cases.caseNumber, `%${filters.search}%`),
        like(cases.accused, `%${filters.search}%`),
        like(cases.complainant, `%${filters.search}%`),
        like(cases.authority, `%${filters.search}%`),
      )!,
    );
  }

  return conditions;
}

export async function getCasesList(filters?: CaseListFilters) {
  const db = await getDb();
  if (!db) return { items: [] as typeof cases.$inferSelect[], total: 0, page: 1, pageSize: CASE_PAGE_SIZE_DEFAULT };

  const conditions = buildCaseConditions(filters);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters?.pageSize ?? CASE_PAGE_SIZE_DEFAULT), CASE_PAGE_SIZE_MAX);
  const offset = (page - 1) * pageSize;

  const [items, totalRow] = await Promise.all([
    db.select().from(cases).where(whereClause).orderBy(desc(cases.id)).limit(pageSize).offset(offset),
    db.select({ total: count() }).from(cases).where(whereClause),
  ]);

  return { items, total: totalRow[0]?.total ?? 0, page, pageSize };
}

export async function getAllCases(filters?: CaseListFilters) {
  const result = await getCasesList({
    ...filters,
    page: 1,
    pageSize: filters?.pageSize ?? CASE_PAGE_SIZE_MAX,
  });
  return result.items;
}

export async function findDuplicateCase(caseNumber: string, excludeId?: number) {
  const db = await getDb();
  if (!db || !caseNumber.trim()) return undefined;
  const conditions = [eq(cases.caseNumber, caseNumber.trim()), or(eq(cases.archived, 0), sql`${cases.archived} IS NULL`)!];
  if (excludeId) conditions.push(sql`${cases.id} != ${excludeId}`);
  const result = await db.select().from(cases).where(and(...conditions)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getCaseEmployees(employeeScope?: string) {
  const db = await getDb();
  if (!db) return [];
  if (employeeScope) {
    const rows = await db.selectDistinct({ employee: cases.employee }).from(cases)
      .where(and(eq(cases.employee, employeeScope), or(eq(cases.archived, 0), sql`${cases.archived} IS NULL`)!));
    return rows.map((r) => r.employee).filter(Boolean) as string[];
  }
  const rows = await db.selectDistinct({ employee: cases.employee }).from(cases)
    .where(and(isNotNull(cases.employee), sql`${cases.employee} != ''`, or(eq(cases.archived, 0), sql`${cases.archived} IS NULL`)!));
  return rows.map((r) => r.employee).filter(Boolean) as string[];
}

export async function getCaseById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function insertCase(data: any) {
  const db = await getDb();
  if (!db) return;
  return db.insert(cases).values(data);
}

export async function updateCase(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  await db.update(cases).set(data).where(eq(cases.id, id));
}

export async function deleteCase(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(caseAttachments).where(and(eq(caseAttachments.caseId, id), eq(caseAttachments.tableName, "cases")));
  await db.delete(cases).where(eq(cases.id, id));
}

export async function archiveCase(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(cases).set({ archived: 1 }).where(eq(cases.id, id));
}

export async function deleteAttachmentsByCaseId(caseId: number, tableName = "cases") {
  const db = await getDb();
  if (!db) return;
  await db.delete(caseAttachments).where(and(eq(caseAttachments.caseId, caseId), eq(caseAttachments.tableName, tableName)));
}

// ===== Generic CRUD for other tables =====
function buildPlatformBranchCondition(branchColumn: any) {
  const branches = getPlatformBranches();
  const parts: any[] = [or(isNull(branchColumn), eq(branchColumn, ""))!];
  for (const branch of branches) {
    parts.push(eq(branchColumn, branch.name));
    parts.push(like(branchColumn, `%${branch.name}%`));
    parts.push(eq(branchColumn, `فرع ${branch.name}`));
    parts.push(eq(branchColumn, branch.branchNumber));
    for (const alias of branch.aliases ?? []) {
      parts.push(eq(branchColumn, alias));
      parts.push(like(branchColumn, `%${alias}%`));
    }
  }
  return or(...parts)!;
}

function appendTableSearchConditions(tableName: string, table: any, filters: { search?: string }, conditions: any[]) {
  if (!filters?.search) return;
  const q = `%${filters.search}%`;
  const searchParts: any[] = [like(table.employee, q)];
  if ("complainant" in table) searchParts.push(like(table.complainant, q));
  if ("entity" in table) searchParts.push(like(table.entity, q));
  if ("caseTitle" in table) searchParts.push(like(table.caseTitle, q));
  if ("subject" in table) searchParts.push(like(table.subject, q));
  if ("debtorName" in table) searchParts.push(like(table.debtorName, q));
  if ("guarantor" in table) searchParts.push(like(table.guarantor, q));
  if ("debtAmount" in table) searchParts.push(like(table.debtAmount, q));
  if ("paymentDetails" in table) searchParts.push(like(table.paymentDetails, q));
  if ("amount" in table) searchParts.push(like(table.amount, q));
  if ("actions" in table) searchParts.push(like(table.actions, q));
  if ("notes" in table) searchParts.push(like(table.notes, q));
  if ("status" in table) searchParts.push(like(table.status, q));
  if ("branch" in table) searchParts.push(like(table.branch, q));
  if ("caseNumber" in table) searchParts.push(like(table.caseNumber, q));
  if ("checkNumber" in table) searchParts.push(like(table.checkNumber, q));
  if ("propertyName" in table) searchParts.push(like(table.propertyName, q));
  if ("propertyNumber" in table) searchParts.push(like(table.propertyNumber, q));
  if ("location" in table) searchParts.push(like(table.location, q));
  if ("ownerName" in table) searchParts.push(like(table.ownerName, q));
  if ("relatedCaseNumber" in table) searchParts.push(like(table.relatedCaseNumber, q));
  if ("fileTitle" in table) searchParts.push(like(table.fileTitle, q));
  if ("subject" in table) searchParts.push(like(table.subject, q));
  if ("fileCategory" in table) searchParts.push(like(table.fileCategory, q));
  if ("relatedInvestigationNumber" in table) searchParts.push(like(table.relatedInvestigationNumber, q));
  conditions.push(or(...searchParts)!);
}

const tableMap: Record<string, any> = {
  compensation_cases: compensationCases,
  personal_guarantees: personalGuarantees,
  investigation_cases: investigationCases,
  bank_properties: bankProperties,
  mortgaged_properties: mortgagedProperties,
  general_files: generalFiles,
  forged_checks: forgedChecks,
};

export async function getTableRecords(
  tableName: string,
  filters?: { employee?: string; userId?: number; search?: string },
  limit = 500,
) {
  const db = await getDb();
  if (!db) return [];
  const table = tableMap[tableName];
  if (!table) return [];
  const max = Math.min(Math.max(1, limit), 500);

  const conditions: any[] = [];
  if (filters?.employee) {
    if (filters.userId != null && "createdBy" in table) {
      conditions.push(or(eq(table.employee, filters.employee), eq(table.createdBy, filters.userId))!);
    } else {
      conditions.push(eq(table.employee, filters.employee));
    }
  }
  if (tableName === "investigation_cases") {
    conditions.push(buildPlatformBranchCondition(table.branch));
  }
  if (tableName === "bank_properties" || tableName === "mortgaged_properties") {
    conditions.push(buildPlatformBranchCondition(table.branch));
  }
  if (tableName === "forged_checks" && "entity" in table) {
    conditions.push(buildPlatformBranchCondition(table.entity));
  }
  appendTableSearchConditions(tableName, table, filters ?? {}, conditions);

  const order =
    tableName === "forged_checks"
      ? asc(table.id)
      : desc(table.id);

  if (conditions.length > 0) {
    return db.select().from(table).where(and(...conditions)).orderBy(order).limit(max);
  }
  return db.select().from(table).orderBy(order).limit(max);
}

export async function getTableRecordsPaged(
  tableName: string,
  filters?: { employee?: string; search?: string; page?: number; pageSize?: number; userId?: number },
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 50 };
  const table = tableMap[tableName];
  if (!table) return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 50 };

  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters?.pageSize ?? 50), 200);

  const conditions: any[] = [];
  if (filters?.employee) {
    if (filters.userId != null && "createdBy" in table) {
      conditions.push(or(eq(table.employee, filters.employee), eq(table.createdBy, filters.userId))!);
    } else {
      conditions.push(eq(table.employee, filters.employee));
    }
  }
  if (tableName === "investigation_cases") {
    conditions.push(buildPlatformBranchCondition(table.branch));
  }
  if (tableName === "bank_properties" || tableName === "mortgaged_properties") {
    conditions.push(buildPlatformBranchCondition(table.branch));
  }
  if (tableName === "forged_checks" && "entity" in table) {
    conditions.push(buildPlatformBranchCondition(table.entity));
  }
  appendTableSearchConditions(tableName, table, filters ?? {}, conditions);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const order =
    tableName === "forged_checks"
      ? asc(table.id)
      : desc(table.id);

  const totalRow = whereClause
    ? await db.select({ c: sql<number>`count(*)` }).from(table).where(whereClause)
    : await db.select({ c: sql<number>`count(*)` }).from(table);
  const total = totalRow[0]?.c ?? 0;

  const items = whereClause
    ? await db.select().from(table).where(whereClause).orderBy(order).limit(pageSize).offset((page - 1) * pageSize)
    : await db.select().from(table).orderBy(order).limit(pageSize).offset((page - 1) * pageSize);

  return { items, total, page, pageSize };
}

export async function getTableRecord(tableName: string, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const table = tableMap[tableName];
  if (!table) return undefined;
  const result = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function insertTableRecord(tableName: string, data: any) {
  const db = await getDb();
  if (!db) return;
  const table = tableMap[tableName];
  if (!table) return;
  return db.insert(table).values(data);
}

export async function propertyNumberExists(
  tableName: "bank_properties" | "mortgaged_properties",
  propertyNumber: string,
  excludeId?: number,
): Promise<boolean> {
  const db = await getDb();
  const trimmed = propertyNumber?.trim();
  if (!db || !trimmed) return false;
  const tables: Array<{ name: typeof tableName; table: typeof bankProperties }> = [
    { name: "bank_properties", table: bankProperties },
    { name: "mortgaged_properties", table: mortgagedProperties },
  ];
  for (const { name, table } of tables) {
    const conds: any[] = [eq(table.propertyNumber, trimmed)];
    if (name === tableName && excludeId != null) conds.push(ne(table.id, excludeId));
    const rows = await db.select({ id: table.id }).from(table).where(and(...conds)).limit(1);
    if (rows.length > 0) return true;
  }
  return false;
}

export async function updateTableRecord(tableName: string, id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const table = tableMap[tableName];
  if (!table) return;
  await db.update(table).set(data).where(eq(table.id, id));
}

export async function deleteTableRecord(tableName: string, id: number) {
  const db = await getDb();
  if (!db) return;
  const table = tableMap[tableName];
  if (!table) return;
  await db.delete(table).where(eq(table.id, id));
}

export async function bulkDeleteTableRecords(tableName: string, ids: number[]) {
  const db = await getDb();
  if (!db) return;
  const table = tableMap[tableName];
  if (!table) return;
  if (!ids.length) return;
  await db.delete(table).where(inArray(table.id, ids));
}

// ===== Pending Operations =====
export async function getPendingOperations(
  status?: string,
  opts?: { page?: number; pageSize?: number },
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: opts?.pageSize ?? 50 };
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts?.pageSize ?? 50), 200);
  const statusCond = status ? eq(pendingOperations.status, status as any) : undefined;
  const whereClause = statusCond ? and(statusCond) : undefined;
  const totalRow = await db.select({ c: sql<number>`count(*)` }).from(pendingOperations)
    .where(whereClause ?? sql`1=1`);
  const total = totalRow[0]?.c ?? 0;
  const items = await db.select().from(pendingOperations)
    .where(whereClause ?? sql`1=1`)
    .orderBy(desc(pendingOperations.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export async function getPendingOperationsBySubmitter(
  submittedBy: number,
  status?: string,
  opts?: { page?: number; pageSize?: number },
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: opts?.pageSize ?? 50 };
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts?.pageSize ?? 50), 200);
  const conditions = [eq(pendingOperations.submittedBy, submittedBy)];
  if (status) conditions.push(eq(pendingOperations.status, status as any));
  const whereClause = and(...conditions);
  const totalRow = await db.select({ c: sql<number>`count(*)` }).from(pendingOperations).where(whereClause);
  const total = totalRow[0]?.c ?? 0;
  const items = await db.select().from(pendingOperations)
    .where(whereClause)
    .orderBy(desc(pendingOperations.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export async function getPendingOperationsCount(status = "pending") {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(pendingOperations)
    .where(eq(pendingOperations.status, status as any));
  return row?.count ?? 0;
}

export async function createPendingOperation(data: any): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [result] = await db.insert(pendingOperations).values(data);
  const insertId = Number((result as { insertId?: number })?.insertId);
  return insertId > 0 ? insertId : undefined;
}

export async function updatePendingOperation(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  await db.update(pendingOperations).set(data).where(eq(pendingOperations.id, id));
}

export async function claimPendingOperation(
  id: number,
  reviewerId: number,
  status: "approved" | "rejected",
  extra?: { reviewNote?: string | null },
) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const result = await dbConn.update(pendingOperations)
    .set({
      status: status as "pending" | "approved" | "rejected",
      reviewedBy: reviewerId,
      ...(extra?.reviewNote !== undefined ? { reviewNote: extra.reviewNote } : {}),
    })
    .where(and(
      eq(pendingOperations.id, id),
      eq(pendingOperations.status, "pending"),
    ));
  const affected = Number((result as { affectedRows?: number }[])[0]?.affectedRows ?? 0);
  if (!affected) return null;
  return getPendingOperationById(id);
}

export async function getPendingOperationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pendingOperations).where(eq(pendingOperations.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ===== Notifications =====
function notificationOwnership(userId: number, employeeName: string) {
  return or(eq(notifications.userId, userId), eq(notifications.targetEmployee, employeeName))!;
}

export async function getNotifications(userId: number) {
  return getNotificationsForUser(userId, "", 50);
}

export async function getNotificationsForUser(
  userId: number,
  employeeName: string,
  limit = 50,
  type?: string,
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    employeeName ? notificationOwnership(userId, employeeName) : eq(notifications.userId, userId),
  ];
  if (type) conditions.push(eq(notifications.type, type));
  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  return db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUnreadNotificationCount(userId: number) {
  return getUnreadNotificationCountForUser(userId, "");
}

export async function getUnreadNotificationCountForUser(userId: number, employeeName: string) {
  const db = await getDb();
  if (!db) return 0;
  const where = employeeName
    ? and(notificationOwnership(userId, employeeName), eq(notifications.isRead, 0))
    : and(eq(notifications.userId, userId), eq(notifications.isRead, 0));
  const result = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(where);
  return result[0]?.count ?? 0;
}

export async function createNotification(data: { userId?: number | null; title: string; message?: string; content?: string; type?: string; relatedId?: number; targetEmployee?: string }) {
  const db = await getDb();
  if (!db) return;
  let userId = data.userId ?? undefined;
  if (!userId && data.targetEmployee) {
    const [row] = await db.select({ id: users.id }).from(users)
      .where(eq(users.displayName, data.targetEmployee))
      .limit(1);
    userId = row?.id;
  }
  if (!userId && !data.targetEmployee) return;
  const insertData: any = {
    userId: userId ?? 0,
    title: data.title,
    message: data.message || data.content,
    type: data.type,
    relatedId: data.relatedId,
    targetEmployee: data.targetEmployee,
  };
  await db.insert(notifications).values(insertData);
}

/** تجنّب تكرار إشعار من نفس النوع لنفس المستخدم/السجل في اليوم */
export async function createNotificationOncePerDay(data: {
  userId: number;
  title: string;
  message?: string;
  type: string;
  relatedId?: number;
}) {
  const db = await getDb();
  if (!db) return;
  const conditions = [
    eq(notifications.userId, data.userId),
    eq(notifications.type, data.type),
    sql`DATE(${notifications.createdAt}) = CURDATE()`,
  ];
  if (data.relatedId != null) {
    conditions.push(eq(notifications.relatedId, data.relatedId));
  }
  const existing = await db.select({ id: notifications.id }).from(notifications)
    .where(and(...conditions))
    .limit(1);
  if (existing.length > 0) return;
  await createNotification(data);
}

export async function getNotificationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function markNotificationRead(
  id: number,
  user: { id: number; displayName?: string | null; name?: string | null; username: string },
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const notif = await getNotificationById(id);
  if (!notif) return false;
  const emp = user.displayName || user.name || user.username;
  const owned = notif.userId === user.id || (!!notif.targetEmployee && notif.targetEmployee === emp);
  if (!owned) return false;
  await db.update(notifications).set({ isRead: 1 }).where(eq(notifications.id, id));
  return true;
}

export async function getNotificationsForEmployee(employeeName: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications)
    .where(eq(notifications.targetEmployee, employeeName))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function getCorrespondenceDeadlineAlerts(employee?: string) {
  const db = await getDb();
  if (!db) return [];
  const { sql: sqlFn } = await import('drizzle-orm');
  // Get correspondence with deadline in 1-2 days that are not completed
  const conditions: any[] = [
    sqlFn`${correspondence.deadline} IS NOT NULL`,
    sqlFn`${correspondence.deadline} != ''`,
    sqlFn`DATEDIFF(STR_TO_DATE(${correspondence.deadline}, '%Y-%m-%d'), CURDATE()) BETWEEN 0 AND 2`,
    sqlFn`${correspondence.archived} = 0`,
    sqlFn`${correspondence.status} NOT IN ('completed')`,
  ];
  if (employee) {
    conditions.push(eq(correspondence.employee, employee));
  }
  return db.select().from(correspondence).where(and(...conditions)).limit(20);
}

export async function markAllNotificationsRead(userId: number, employeeName?: string) {
  const db = await getDb();
  if (!db) return;
  if (employeeName) {
    await db.update(notifications).set({ isRead: 1 })
      .where(notificationOwnership(userId, employeeName));
    return;
  }
  await db.update(notifications).set({ isRead: 1 }).where(eq(notifications.userId, userId));
}

// ===== Chat Messages =====
export async function getChatMessages(recipientId?: number | null, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  const max = Math.min(Math.max(1, limit), 500);
  if (recipientId === null || recipientId === undefined) {
    const rows = await db.select().from(chatMessages)
      .where(sql`${chatMessages.recipientId} IS NULL`)
      .orderBy(desc(chatMessages.createdAt))
      .limit(max);
    return rows.reverse();
  }
  const rows = await db.select().from(chatMessages)
    .where(eq(chatMessages.recipientId, recipientId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(max);
  return rows.reverse();
}

export async function getDirectMessages(userId1: number, userId2: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  const max = Math.min(Math.max(1, limit), 500);
  const rows = await db.select().from(chatMessages)
    .where(
      or(
        and(eq(chatMessages.senderId, userId1), eq(chatMessages.recipientId, userId2)),
        and(eq(chatMessages.senderId, userId2), eq(chatMessages.recipientId, userId1))
      )!
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(max);
  return rows.reverse();
}

export async function sendChatMessage(data: { senderId: number; senderName: string; recipientId: number | null; message: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(chatMessages).values(data);
}

export async function getUnreadChatCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(chatMessages)
    .where(and(eq(chatMessages.recipientId, userId), eq(chatMessages.isRead, 0)));
  return result[0]?.count ?? 0;
}

export async function markChatMessagesRead(userId: number, senderId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(chatMessages).set({ isRead: 1 })
    .where(and(eq(chatMessages.recipientId, userId), eq(chatMessages.senderId, senderId)));
}

// ===== Activity Log =====
export async function logActivity(data: { userId: number; username: string; action: string; details?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(activityLog).values(data);
}

export async function getActivityLog(filters: {
  limit?: number;
  page?: number;
  pageSize?: number;
  action?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters.pageSize ?? 100 };
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters.action) conditions.push(eq(activityLog.action, filters.action));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(
      like(activityLog.username, term),
      like(activityLog.details, term),
      like(activityLog.action, term),
    )!);
  }
  if (filters.dateFrom) {
    conditions.push(sql`${activityLog.createdAt} >= ${filters.dateFrom}`);
  }
  if (filters.dateTo) {
    conditions.push(sql`${activityLog.createdAt} <= ${filters.dateTo} 23:59:59`);
  }
  const pageSize = Math.min(filters.pageSize ?? filters.limit ?? 100, 500);
  const page = Math.max(1, filters.page ?? 1);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const totalRow = whereClause
    ? await db.select({ c: sql<number>`count(*)` }).from(activityLog).where(whereClause)
    : await db.select({ c: sql<number>`count(*)` }).from(activityLog);
  const total = totalRow[0]?.c ?? 0;
  const items = whereClause
    ? await db.select().from(activityLog).where(whereClause).orderBy(desc(activityLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize)
    : await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export async function getUserActivityStats() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    userId: activityLog.userId,
    username: activityLog.username,
    actionCount: sql<number>`count(*)`,
    lastActivity: sql<string>`MAX(${activityLog.createdAt})`,
  }).from(activityLog).groupBy(activityLog.userId, activityLog.username).orderBy(sql`count(*) DESC`);
}

// ===== Dashboard Stats =====
export async function getDashboardStats(filters?: { province?: string; employee?: string; submittedBy?: number }) {
  const db = await getDb();
  if (!db) return null;

  const scopeConds: any[] = [notArchivedCaseCondition()];
  if (filters?.province) scopeConds.push(eq(cases.province, filters.province));
  if (filters?.employee) scopeConds.push(eq(cases.employee, filters.employee));
  const scopeWhere = and(...scopeConds);

  const totalCases = scopeWhere
    ? await db.select({ count: sql<number>`count(*)` }).from(cases).where(scopeWhere)
    : await db.select({ count: sql<number>`count(*)` }).from(cases);
  const casesByType = scopeWhere
    ? await db.select({ type: cases.type, count: sql<number>`count(*)` }).from(cases).where(scopeWhere).groupBy(cases.type)
    : await db.select({ type: cases.type, count: sql<number>`count(*)` }).from(cases).groupBy(cases.type);
  const casesByStatus = scopeWhere
    ? await db.select({ status: cases.caseStatus, count: sql<number>`count(*)` }).from(cases).where(scopeWhere).groupBy(cases.caseStatus)
    : await db.select({ status: cases.caseStatus, count: sql<number>`count(*)` }).from(cases).groupBy(cases.caseStatus);
  const casesByEmployee = scopeWhere
    ? await db.select({ employee: cases.employee, count: sql<number>`count(*)` }).from(cases).where(scopeWhere).groupBy(cases.employee)
    : await db.select({ employee: cases.employee, count: sql<number>`count(*)` }).from(cases).groupBy(cases.employee);

  const pendingConds: any[] = [eq(pendingOperations.status, "pending")];
  if (filters?.submittedBy) pendingConds.push(eq(pendingOperations.submittedBy, filters.submittedBy));
  const pendingCount = await db.select({ count: sql<number>`count(*)` }).from(pendingOperations).where(and(...pendingConds));

  const legalReviewConds: any[] = [
    or(eq(legalReviews.status, "new"), eq(legalReviews.status, "in_review"))!,
  ];
  if (filters?.submittedBy) {
    legalReviewConds.push(or(
      eq(legalReviews.createdBy, filters.submittedBy),
      eq(legalReviews.assignedToId, filters.submittedBy),
    )!);
  }
  const openLegalReviews = await db.select({ count: sql<number>`count(*)` })
    .from(legalReviews)
    .where(and(...legalReviewConds));

  // Expired cases:
  const expiredConds: any[] = [
    sql`(${cases.caseStatus} IS NULL OR ${cases.caseStatus} NOT IN ('محسومة', 'مرفوضة', 'موحدة'))`,
    or(
      sql`${cases.lastFollowup} IS NULL`,
      sql`${cases.lastFollowup} = ''`,
      sql`STR_TO_DATE(${cases.lastFollowup}, '%Y-%m-%d') <= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      sql`STR_TO_DATE(${cases.lastFollowup}, '%Y/%m/%d') <= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    )!,
  ];
  if (scopeWhere) expiredConds.unshift(scopeWhere);
  const expiredCasesResult = await db.select({ count: sql<number>`count(*)` }).from(cases).where(and(...expiredConds));

  return {
    totalCases: totalCases[0]?.count ?? 0,
    casesByType,
    casesByStatus,
    casesByEmployee,
    pendingApprovals: pendingCount[0]?.count ?? 0,
    openLegalReviews: openLegalReviews[0]?.count ?? 0,
    expiredCases: expiredCasesResult[0]?.count ?? 0,
  };
}

export async function getExpiringCasesSoon(filters?: {
  province?: string;
  employee?: string;
  days?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const days = filters?.days ?? 30;
  const limit = Math.min(Math.max(1, filters?.limit ?? 100), 200);
  const conds: any[] = [
    notArchivedCaseCondition(),
    sql`${cases.expiry} IS NOT NULL AND ${cases.expiry} != ''`,
    sql`(
      (STR_TO_DATE(${cases.expiry}, '%Y-%m-%d') BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ${sql.raw(String(days))} DAY))
      OR (STR_TO_DATE(${cases.expiry}, '%Y/%m/%d') BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ${sql.raw(String(days))} DAY))
    )`,
  ];
  if (filters?.province) conds.push(eq(cases.province, filters.province));
  if (filters?.employee) conds.push(eq(cases.employee, filters.employee));
  return db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      subject: cases.subject,
      expiry: cases.expiry,
      employee: cases.employee,
    })
    .from(cases)
    .where(and(...conds))
    .orderBy(asc(cases.expiry))
    .limit(limit);
}

// ===== Employee Rating =====
export async function getEmployeeRatings(filters?: { province?: string; employee?: string }) {
  const db = await getDb();
  if (!db) return [];

  const scopeConds: any[] = [notArchivedCaseCondition()];
  if (filters?.province) scopeConds.push(eq(cases.province, filters.province));
  if (filters?.employee) scopeConds.push(eq(cases.employee, filters.employee));
  const scopeWhere = and(...scopeConds);
  
  // Get all cases grouped by employee
  const allCasesByEmployee = scopeWhere
    ? await db.select({ employee: cases.employee, total: sql<number>`count(*)` }).from(cases).where(scopeWhere).groupBy(cases.employee)
    : await db.select({ employee: cases.employee, total: sql<number>`count(*)` }).from(cases).groupBy(cases.employee);

  // Get cases that are NOT expired (expiry is in the future or null)
  const activeExpiryCond = or(
    sql`${cases.expiry} IS NULL`,
    sql`${cases.expiry} = ''`,
    sql`STR_TO_DATE(${cases.expiry}, '%Y-%m-%d') >= CURDATE()`,
    sql`STR_TO_DATE(${cases.expiry}, '%Y/%m/%d') >= CURDATE()`,
  )!;
  const activeWhere = scopeWhere ? and(scopeWhere, activeExpiryCond) : activeExpiryCond;
  const activeCasesByEmployee = await db
    .select({ employee: cases.employee, active: sql<number>`count(*)` })
    .from(cases)
    .where(activeWhere)
    .groupBy(cases.employee);

  // Get cases with recent follow-up (within 60 days)
  const followCond = or(
    sql`STR_TO_DATE(${cases.lastFollowup}, '%Y-%m-%d') >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)`,
    sql`STR_TO_DATE(${cases.lastFollowup}, '%Y/%m/%d') >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)`,
  )!;
  const followWhere = scopeWhere ? and(scopeWhere, followCond) : followCond;
  const followedUpCases = await db
    .select({ employee: cases.employee, followed: sql<number>`count(*)` })
    .from(cases)
    .where(followWhere)
    .groupBy(cases.employee);

  return { allCasesByEmployee, activeCasesByEmployee, followedUpCases };
}

// ===== Auto Expiry Notifications =====
export async function checkAndNotifyExpiringCases(userId: number, displayName: string) {
  const db = await getDb();
  if (!db) return;
  try {
    const expiringCases = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        subject: cases.subject,
        expiry: cases.expiry,
      })
      .from(cases)
      .where(
        and(
          eq(cases.employee, displayName),
          sql`${cases.expiry} IS NOT NULL AND ${cases.expiry} != ''`,
          sql`(
            (STR_TO_DATE(${cases.expiry}, '%Y-%m-%d') BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY))
            OR (STR_TO_DATE(${cases.expiry}, '%Y/%m/%d') BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY))
          )`,
        )!,
      )
      .limit(100);

    if (expiringCases.length === 0) return;

    const caseIds = expiringCases.map((c) => c.id);
    const alreadyNotified = await db
      .select({ relatedId: notifications.relatedId })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, "expiry_alert"),
          inArray(notifications.relatedId, caseIds),
          sql`DATE(${notifications.createdAt}) = CURDATE()`,
        )!,
      );

    const notifiedToday = new Set(
      alreadyNotified.map((n) => n.relatedId).filter((id): id is number => id != null),
    );

    for (const c of expiringCases) {
      if (notifiedToday.has(c.id)) continue;
      await db.insert(notifications).values({
        userId,
        title: "تنبيه: قضية تقترب من الانتهاء",
        message: `القضية رقم ${c.caseNumber} - ${c.subject} تنتهي بتاريخ ${c.expiry}`,
        type: "expiry_alert",
        relatedId: c.id,
      });
    }
  } catch (err) {
    console.warn("[Auto-Expiry] Error checking expiring cases:", err);
  }
}

// ===== Audit Log =====

export async function createAuditEntry(data: { userId: number; username: string; action: string; tableName?: string; recordId?: number; description?: string; oldData?: any; newData?: any }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values(data);
}

export async function getAuditLog(filters?: {
  limit?: number;
  page?: number;
  pageSize?: number;
  tableName?: string;
  recordId?: number;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 100 };
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.tableName) conditions.push(eq(auditLog.tableName, filters.tableName));
  if (filters?.recordId) conditions.push(eq(auditLog.recordId, filters.recordId));
  if (filters?.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(
      like(auditLog.username, term),
      like(auditLog.description, term),
      like(auditLog.action, term),
    )!);
  }
  const pageSize = Math.min(filters?.pageSize ?? filters?.limit ?? 100, 500);
  const page = Math.max(1, filters?.page ?? 1);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const totalRow = whereClause
    ? await db.select({ c: sql<number>`count(*)` }).from(auditLog).where(whereClause)
    : await db.select({ c: sql<number>`count(*)` }).from(auditLog);
  const total = totalRow[0]?.c ?? 0;
  const items = whereClause
    ? await db.select().from(auditLog).where(whereClause).orderBy(desc(auditLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize)
    : await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { items, total, page, pageSize };
}

// ===== Case Attachments =====
export async function getAttachments(caseId: number, tableName: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(caseAttachments)
    .where(and(eq(caseAttachments.caseId, caseId), eq(caseAttachments.tableName, tableName)))
    .orderBy(desc(caseAttachments.createdAt));
}

export async function createAttachment(data: { caseId: number; tableName: string; fileName: string; fileUrl: string; fileKey: string; fileSize?: number; mimeType?: string; uploadedBy: number; uploadedByName?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(caseAttachments).values(data);
}

export async function deleteAttachment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(caseAttachments).where(eq(caseAttachments.id, id));
}

export async function getAttachmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(caseAttachments).where(eq(caseAttachments.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAttachmentByFileKey(fileKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const trimmed = fileKey.trim();
  if (!trimmed) return undefined;
  const [row] = await db.select().from(caseAttachments).where(eq(caseAttachments.fileKey, trimmed)).limit(1);
  return row;
}

export async function getCorrespondenceByAttachmentKey(attachmentKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const trimmed = attachmentKey.trim();
  if (!trimmed) return undefined;
  const [row] = await db.select().from(correspondence).where(eq(correspondence.attachmentKey, trimmed)).limit(1);
  return row;
}

export async function getLegalReviewByAttachmentKey(fileKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const trimmed = fileKey.trim();
  if (!trimmed) return undefined;
  const marker = `/manus-storage/${trimmed}`;
  const [row] = await db.select().from(legalReviews)
    .where(sql`${legalReviews.attachmentUrl} LIKE ${`%${marker}%`}`)
    .limit(1);
  return row;
}

export async function getAssignmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(correspondenceAssignments)
    .where(eq(correspondenceAssignments.id, id))
    .limit(1);
  return row;
}

export async function getAppLogoStorageKey(): Promise<string | null> {
  const settings = await getPublicAppSettings();
  if (!settings.logoUrl?.includes("/manus-storage/")) return null;
  const marker = "/manus-storage/";
  const idx = settings.logoUrl.indexOf(marker);
  if (idx === -1) return null;
  const key = settings.logoUrl.slice(idx + marker.length).split("?")[0];
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

// ===== Global Search =====
export async function globalSearch(
  query: string,
  options?: { employeeName?: string; employeeUserId?: number; includeUsers?: boolean; includeInvestigation?: boolean },
) {
  const db = await getDb();
  if (!db) return [];
  const results: { type: string; id: number; title: string; subtitle?: string }[] = [];
  const q = `%${query}%`;

  const caseConditions = [
    or(like(cases.subject, q), like(cases.caseNumber, q), like(cases.accused, q), like(cases.complainant, q))!,
  ];
  if (options?.employeeName) {
    caseConditions.push(eq(cases.employee, options.employeeName));
  }

  const caseResults = await db
    .select({ id: cases.id, subject: cases.subject, caseNumber: cases.caseNumber, type: cases.type })
    .from(cases)
    .where(and(...caseConditions))
    .limit(10);
  for (const c of caseResults) {
    results.push({ type: "cases", id: c.id, title: c.subject || c.caseNumber || `قضية #${c.id}`, subtitle: c.type || undefined });
  }

  const compConditions = [or(like(compensationCases.caseTitle, q), like(compensationCases.guarantorName, q))!];
  if (options?.employeeName) compConditions.push(eq(compensationCases.employee, options.employeeName));

  const compResults = await db
    .select({ id: compensationCases.id, caseTitle: compensationCases.caseTitle, guarantorName: compensationCases.guarantorName })
    .from(compensationCases)
    .where(and(...compConditions))
    .limit(5);
  for (const c of compResults) {
    results.push({ type: "compensation", id: c.id, title: c.caseTitle || `تضمين #${c.id}`, subtitle: c.guarantorName || undefined });
  }

  const invConditions: any[] = [buildPlatformBranchCondition(investigationCases.branch)];
  if (options?.employeeName) invConditions.push(eq(investigationCases.employee, options.employeeName));
  const invSearch = or(like(investigationCases.subject, q), like(investigationCases.branch, q), like(investigationCases.caseNumber, q))!;
  invConditions.push(invSearch);

  if (options?.includeInvestigation !== false) {
    const invResults = await db
      .select({ id: investigationCases.id, subject: investigationCases.subject, branch: investigationCases.branch })
      .from(investigationCases)
      .where(and(...invConditions))
      .limit(5);
    for (const c of invResults) {
      results.push({ type: "investigation", id: c.id, title: c.subject || `تحقيقية #${c.id}`, subtitle: c.branch || undefined });
    }
  }

  const lrConditions: any[] = [or(like(legalReviews.title, q), like(legalReviews.description, q))!];
  if (options?.employeeUserId) {
    lrConditions.push(or(
      eq(legalReviews.createdBy, options.employeeUserId),
      eq(legalReviews.assignedToId, options.employeeUserId),
    )!);
  }
  const lrResults = await db
    .select({ id: legalReviews.id, title: legalReviews.title, status: legalReviews.status })
    .from(legalReviews)
    .where(and(...lrConditions))
    .limit(5);
  for (const r of lrResults) {
    results.push({ type: "legal_reviews", id: r.id, title: r.title, subtitle: r.status || undefined });
  }

  if (options?.includeUsers !== false) {
    const userResults = await db
      .select({ id: users.id, displayName: users.displayName, username: users.username })
      .from(users)
      .where(or(like(users.displayName, q), like(users.username, q))!)
      .limit(5);
    for (const u of userResults) {
      results.push({ type: "users", id: u.id, title: u.displayName, subtitle: u.username });
    }
  }

  return results;
}

// ===== Enhanced Dashboard Stats =====
export async function getEnhancedDashboardStats(
  period?: "week" | "month" | "year",
  filters?: { province?: string; employee?: string; submittedBy?: number },
) {
  const db = await getDb();
  if (!db) return null;

  let dateCondition;
  if (period === "week") {
    dateCondition = sql`${cases.createdAt} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
  } else if (period === "month") {
    dateCondition = sql`${cases.createdAt} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
  } else if (period === "year") {
    dateCondition = sql`${cases.createdAt} >= DATE_SUB(NOW(), INTERVAL 365 DAY)`;
  }

  const scopeConds: any[] = [notArchivedCaseCondition()];
  if (filters?.province) scopeConds.push(eq(cases.province, filters.province));
  if (filters?.employee) scopeConds.push(eq(cases.employee, filters.employee));
  const scopeWhere = and(...scopeConds);
  const baseWhere = dateCondition && scopeWhere ? and(dateCondition, scopeWhere) : (dateCondition || scopeWhere);

  const totalCases = baseWhere
    ? await db.select({ count: sql<number>`count(*)` }).from(cases).where(baseWhere)
    : await db.select({ count: sql<number>`count(*)` }).from(cases);

  const casesByType = baseWhere
    ? await db.select({ type: cases.type, count: sql<number>`count(*)` }).from(cases).where(baseWhere).groupBy(cases.type)
    : await db.select({ type: cases.type, count: sql<number>`count(*)` }).from(cases).groupBy(cases.type);

  const casesByStatus = baseWhere
    ? await db.select({ status: cases.caseStatus, count: sql<number>`count(*)` }).from(cases).where(baseWhere).groupBy(cases.caseStatus)
    : await db.select({ status: cases.caseStatus, count: sql<number>`count(*)` }).from(cases).groupBy(cases.caseStatus);

  const casesByEmployee = baseWhere
    ? await db.select({ employee: cases.employee, count: sql<number>`count(*)` }).from(cases).where(baseWhere).groupBy(cases.employee)
    : await db.select({ employee: cases.employee, count: sql<number>`count(*)` }).from(cases).groupBy(cases.employee);

  // Monthly trend (last 12 months)
  const monthlyConds: any[] = [
    sql`createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`,
    sql`(archived = 0 OR archived IS NULL)`,
  ];
  if (filters?.province) monthlyConds.push(sql`province = ${filters.province}`);
  if (filters?.employee) monthlyConds.push(sql`employee = ${filters.employee}`);
  const monthlyTrendRaw = await db.execute(sql`
    SELECT DATE_FORMAT(createdAt, '%Y-%m') as month, count(*) as count
    FROM cases
    WHERE ${and(...monthlyConds)}
    GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
    ORDER BY month
  `);
  const monthlyTrend = (monthlyTrendRaw[0] as unknown as { month: string; count: number }[]) || [];

  const pendingConds: any[] = [eq(pendingOperations.status, "pending")];
  if (filters?.submittedBy) pendingConds.push(eq(pendingOperations.submittedBy, filters.submittedBy));
  const pendingCount = await db.select({ count: sql<number>`count(*)` }).from(pendingOperations).where(and(...pendingConds));

  // Count other tables
  const compCount = await db.select({ count: sql<number>`count(*)` }).from(compensationCases);
  const invCountConds: any[] = [buildPlatformBranchCondition(investigationCases.branch)];
  if (filters?.employee) invCountConds.push(eq(investigationCases.employee, filters.employee));
  const invCount = await db.select({ count: sql<number>`count(*)` }).from(investigationCases).where(and(...invCountConds));
  const bankPropConds: any[] = [buildPlatformBranchCondition(bankProperties.branch)];
  if (filters?.employee) bankPropConds.push(eq(bankProperties.employee, filters.employee));
  const bankPropCount = await db.select({ count: sql<number>`count(*)` }).from(bankProperties).where(and(...bankPropConds));

  const mortPropConds: any[] = [buildPlatformBranchCondition(mortgagedProperties.branch)];
  if (filters?.employee) mortPropConds.push(eq(mortgagedProperties.employee, filters.employee));
  const mortPropCount = await db.select({ count: sql<number>`count(*)` }).from(mortgagedProperties).where(and(...mortPropConds));

  return {
    totalCases: totalCases[0]?.count ?? 0,
    casesByType,
    casesByStatus,
    casesByEmployee,
    monthlyTrend,
    pendingApprovals: pendingCount[0]?.count ?? 0,
    compensationCount: compCount[0]?.count ?? 0,
    investigationCount: invCount[0]?.count ?? 0,
    bankPropertiesCount: bankPropCount[0]?.count ?? 0,
    mortgagedPropertiesCount: mortPropCount[0]?.count ?? 0,
  };
}


// ===== Custom Sections =====
export async function getCustomSections() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customSections).orderBy(customSections.createdAt);
}

export async function getCustomSectionBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(customSections).where(eq(customSections.slug, slug));
  return rows[0] || null;
}

export async function getSectionConfigByKey(sectionKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(sectionConfig).where(eq(sectionConfig.sectionKey, sectionKey)).limit(1);
  return rows[0] || null;
}

export async function createCustomSection(data: { name: string; slug: string; icon?: string; fields: any[]; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(customSections).values(data);
  // Also create a section_config row to control visibility/order
  await db.insert(sectionConfig).values({
    sectionKey: `custom-${data.slug}`,
    name: data.name,
    icon: data.icon ?? "FileText",
    sortOrder: 500,
    visible: 1,
    isBuiltIn: 0,
    columns: null,
  });
  return { success: true };
}

export async function deleteCustomSection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const section = await db.select().from(customSections).where(eq(customSections.id, id)).limit(1);
  const slug = section[0]?.slug;
  await db.delete(customSectionRecords).where(eq(customSectionRecords.sectionId, id));
  await db.delete(customSections).where(eq(customSections.id, id));
  if (slug) {
    await db.delete(sectionConfig).where(eq(sectionConfig.sectionKey, `custom-${slug}`));
  }
  return { success: true };
}

export async function getCustomSectionRecords(
  sectionId: number,
  filters?: { page?: number; pageSize?: number; search?: string; scopeUserId?: number },
) {
  const db = await getDb();
  if (!db) return [];
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters?.pageSize ?? 200), 1000);
  const conditions: any[] = [eq(customSectionRecords.sectionId, sectionId)];
  if (filters?.scopeUserId != null) {
    conditions.push(eq(customSectionRecords.createdBy, filters.scopeUserId));
  }
  return db
    .select()
    .from(customSectionRecords)
    .where(and(...conditions))
    .orderBy(desc(customSectionRecords.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

export async function getCustomSectionRecordsPaged(
  sectionId: number,
  filters?: { page?: number; pageSize?: number; scopeUserId?: number },
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 50 };
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters?.pageSize ?? 50), 200);
  const conditions: any[] = [eq(customSectionRecords.sectionId, sectionId)];
  if (filters?.scopeUserId != null) {
    conditions.push(eq(customSectionRecords.createdBy, filters.scopeUserId));
  }
  const whereClause = and(...conditions);

  const totalRow = await db
    .select({ c: sql<number>`count(*)` })
    .from(customSectionRecords)
    .where(whereClause);
  const total = totalRow[0]?.c ?? 0;

  const items = await db
    .select()
    .from(customSectionRecords)
    .where(whereClause)
    .orderBy(desc(customSectionRecords.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items, total, page, pageSize };
}

export async function createCustomSectionRecord(data: { sectionId: number; data: any; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(customSectionRecords).values(data);
  return { success: true };
}

export async function updateCustomSectionRecord(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(customSectionRecords).set({ data }).where(eq(customSectionRecords.id, id));
  return { success: true };
}

export async function deleteCustomSectionRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(customSectionRecords).where(eq(customSectionRecords.id, id));
  return { success: true };
}

export async function bulkDeleteCustomSectionRecords(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (!ids.length) return { success: true };
  await db.delete(customSectionRecords).where(inArray(customSectionRecords.id, ids));
  return { success: true };
}

// ===== Custom Case Types =====
export async function getCustomCaseTypes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customCaseTypes).orderBy(customCaseTypes.createdAt);
}

export async function createCustomCaseType(data: { name: string; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(customCaseTypes).values(data);
  return { success: true };
}

export async function deleteCustomCaseType(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(customCaseTypes).where(eq(customCaseTypes.id, id));
  return { success: true };
}


// ===== Section Config (CMS) =====
export async function getSectionConfigsForUser(includeHidden: boolean) {
  const rows = await getSectionConfigs();
  if (includeHidden) return rows;
  return rows.filter((r) => Number(r.visible) === 1);
}

export async function getSectionConfigs() {
  const db = await getDb();
  if (!db) return [];

  try {
    const existing = await db.select().from(sectionConfig);
    const have = new Set(existing.map((r) => r.sectionKey));

    const missingBuiltin = DEFAULT_BUILTIN_SECTIONS.filter((d) => !have.has(d.sectionKey));
    if (missingBuiltin.length) {
      await db.insert(sectionConfig).values(missingBuiltin.map((m) => ({
        sectionKey: m.sectionKey,
        name: m.name,
        icon: m.icon,
        sortOrder: m.sortOrder,
        visible: 1,
        isBuiltIn: 1,
        columns: null,
      })));
    }

    // تصحيح isBuiltIn للأقسام المدمجة القديمة
    for (const row of existing) {
      if (isBuiltinSectionKey(row.sectionKey) && Number(row.isBuiltIn) !== 1) {
        await db.update(sectionConfig).set({ isBuiltIn: 1 }).where(eq(sectionConfig.id, row.id));
      }
    }

    // مزامنة الأقسام المخصصة القديمة مع section_config
    const customs = await db.select().from(customSections);
    for (const cs of customs) {
      const key = `custom-${cs.slug}`;
      if (!have.has(key)) {
        await db.insert(sectionConfig).values({
          sectionKey: key,
          name: cs.name,
          icon: cs.icon ?? "FileText",
          sortOrder: 500,
          visible: 1,
          isBuiltIn: 0,
          columns: null,
        });
        have.add(key);
      }
    }
  } catch (err) {
    console.warn("[CMS] section_config seed/sync failed:", err);
  }

  const rows = await db.select().from(sectionConfig).orderBy(asc(sectionConfig.sortOrder));
  return rows
    .filter(isManageableCmsSection)
    .map((row) => ({
      ...row,
      visible: Number(row.visible ?? 1),
      isBuiltIn: isBuiltinSectionKey(row.sectionKey) ? 1 : Number(row.isBuiltIn ?? 0),
    }));
}

export async function updateSectionConfig(id: number, data: Partial<{ name: string; icon: string; sortOrder: number; visible: number; columns: any }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sectionConfig).set(data).where(eq(sectionConfig.id, id));
  return { success: true };
}

export async function updateSectionOrder(items: { id: number; sortOrder: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const item of items) {
    await db.update(sectionConfig).set({ sortOrder: item.sortOrder }).where(eq(sectionConfig.id, item.id));
  }
  return { success: true };
}

export async function addBuiltInSectionColumn(sectionKey: string, column: { key: string; label: string; type: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(sectionConfig).where(eq(sectionConfig.sectionKey, sectionKey));
  if (!rows[0]) throw new Error("Section not found");
  const existing = (rows[0].columns as any[]) || [];
  if (existing.some((c: any) => c.key === column.key && !c._deleted)) {
    throw new Error("Column key already exists");
  }
  if (existing.length >= 200) {
    throw new Error("Too many columns for section");
  }
  existing.push(column);
  await db.update(sectionConfig).set({ columns: existing }).where(eq(sectionConfig.sectionKey, sectionKey));
  return { success: true };
}

export async function removeBuiltInSectionColumn(sectionKey: string, columnKey: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(sectionConfig).where(eq(sectionConfig.sectionKey, sectionKey));
  if (!rows[0]) throw new Error("Section not found");
  const existing = (rows[0].columns as any[]) || [];
  // Check if it's an extra column (added via CMS) - remove it entirely
  const isExtra = existing.find((c: any) => c.key === columnKey && !c._renamed && !c._deleted);
  if (isExtra) {
    const updated = existing.filter((c: any) => c.key !== columnKey);
    await db.update(sectionConfig).set({ columns: updated }).where(eq(sectionConfig.sectionKey, sectionKey));
  } else {
    // Mark built-in column as deleted
    const alreadyMarked = existing.find((c: any) => c.key === columnKey);
    if (alreadyMarked) {
      const updated = existing.map((c: any) => c.key === columnKey ? { ...c, _deleted: true } : c);
      await db.update(sectionConfig).set({ columns: updated }).where(eq(sectionConfig.sectionKey, sectionKey));
    } else {
      const updated = [...existing, { key: columnKey, label: columnKey, _deleted: true }];
      await db.update(sectionConfig).set({ columns: updated }).where(eq(sectionConfig.sectionKey, sectionKey));
    }
  }
  return { success: true };
}

export async function renameBuiltInSectionColumn(sectionKey: string, columnKey: string, newLabel: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(sectionConfig).where(eq(sectionConfig.sectionKey, sectionKey));
  if (!rows[0]) throw new Error("Section not found");
  const existing = (rows[0].columns as any[]) || [];
  const found = existing.find((c: any) => c.key === columnKey);
  if (found) {
    const updated = existing.map((c: any) => c.key === columnKey ? { ...c, label: newLabel, _renamed: true } : c);
    await db.update(sectionConfig).set({ columns: updated }).where(eq(sectionConfig.sectionKey, sectionKey));
  } else {
    // Built-in column not yet in columns array - add it with rename marker
    const updated = [...existing, { key: columnKey, label: newLabel, _renamed: true }];
    await db.update(sectionConfig).set({ columns: updated }).where(eq(sectionConfig.sectionKey, sectionKey));
  }
  return { success: true };
}

export async function importRecordsToCustomSection(sectionId: number, records: any[], createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const values = records.map((data) => ({ sectionId, data, createdBy }));
  let ok = 0;
  const errors: { index: number; message: string }[] = [];

  if (values.length > 0) {
    // Insert in batches; if a batch fails, fall back to row-by-row for that batch.
    for (let i = 0; i < values.length; i += 100) {
      const batch = values.slice(i, i + 100);
      try {
        await db.insert(customSectionRecords).values(batch);
        ok += batch.length;
      } catch (e: any) {
        for (let j = 0; j < batch.length; j++) {
          try {
            await db.insert(customSectionRecords).values(batch[j]);
            ok += 1;
          } catch (e2: any) {
            errors.push({ index: i + j, message: String(e2?.message || e2) });
          }
        }
      }
    }
  }

  return { success: true, count: ok, failed: values.length - ok, errors: errors.slice(0, 20) };
}

// ===== App Settings =====
export type PublicAppSettings = {
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  darkMode: boolean;
};

/** إعدادات المظهر العامة — لا تتضمن أسراراً أو بيانات حساسة */
export async function getPublicAppSettings(): Promise<PublicAppSettings> {
  return getAppSettings();
}

export async function getAppSettings() {
  const db = await getDb();
  const defaults = { logoUrl: "/logo.png", primaryColor: "#15803d", accentColor: "#b8860b", fontFamily: "Cairo", darkMode: false };
  if (!db) return defaults;

  // Preferred: app_settings (single row)
  try {
    const [row] = await db.select().from(appSettings).orderBy(desc(appSettings.updatedAt)).limit(1);
    if (row) {
      return {
        logoUrl: row.logoUrl || defaults.logoUrl,
        primaryColor: row.primaryColor || defaults.primaryColor,
        accentColor: row.accentColor || defaults.accentColor,
        fontFamily: row.fontFamily || defaults.fontFamily,
        darkMode: !!row.darkMode,
      };
    }
  } catch {
    // ignore and fallback
  }

  // Legacy fallback: section_config.columns under __app_settings__
  try {
    const [legacy] = await db.select().from(sectionConfig).where(eq(sectionConfig.sectionKey, "__app_settings__")).limit(1);
    const settings = legacy?.columns as any;
    return {
      logoUrl: settings?.logoUrl || defaults.logoUrl,
      primaryColor: settings?.primaryColor || defaults.primaryColor,
      accentColor: settings?.accentColor || defaults.accentColor,
      fontFamily: settings?.fontFamily || defaults.fontFamily,
      darkMode: settings?.darkMode || defaults.darkMode,
    };
  } catch {
    return defaults;
  }
}

export async function updateAppSettings(data: { logoUrl?: string; primaryColor?: string; accentColor?: string; fontFamily?: string; darkMode?: boolean }) {
  const db = await getDb();
  if (!db) return;
  const existing = await getAppSettings();
  const merged = { ...existing, ...data };
  // Preferred: app_settings (create/update singleton)
  try {
    const [row] = await db.select().from(appSettings).limit(1);
    if (row) {
      await db.update(appSettings).set({
        logoUrl: merged.logoUrl,
        primaryColor: merged.primaryColor,
        accentColor: merged.accentColor,
        fontFamily: merged.fontFamily,
        darkMode: merged.darkMode ? 1 : 0,
      }).where(eq(appSettings.id, row.id));
    } else {
      await db.insert(appSettings).values({
        logoUrl: merged.logoUrl,
        primaryColor: merged.primaryColor,
        accentColor: merged.accentColor,
        fontFamily: merged.fontFamily,
        darkMode: merged.darkMode ? 1 : 0,
      });
    }
    return;
  } catch {
    // ignore and fallback
  }

  // Legacy fallback: section_config.columns under __app_settings__
  const [legacy] = await db.select().from(sectionConfig).where(eq(sectionConfig.sectionKey, "__app_settings__")).limit(1);
  if (legacy) {
    await db.update(sectionConfig).set({ columns: merged as any }).where(eq(sectionConfig.sectionKey, "__app_settings__"));
  } else {
    await db.insert(sectionConfig).values({ sectionKey: "__app_settings__", name: "App Settings", isBuiltIn: 1, visible: 0, sortOrder: 999, columns: merged as any });
  }
}

// ===== Import Records to Built-in Section =====
// Valid DB columns for each built-in section (excludes id, createdBy, createdAt, updatedAt)
const VALID_COLUMNS: Record<string, string[]> = {
  "cases": ["type", "employee", "caseNumber", "investigationNumber", "subject", "complainant", "accused", "authority", "damage", "lastActions", "caseStatus", "documentation", "caseReceived", "lastFollowup", "expiry", "remainingDays", "currency"],
  "compensation": ["ministerialOrder", "administrativeOrder", "investigativeCase", "caseTitle", "guarantorName", "compensationAmount", "paymentDetails", "lastActions", "employee"],
  "guarantees": ["debtorName", "guarantor", "debtAmount", "paymentDetails", "lastActions", "employee"],
  "investigation": ["branch", "subject", "caseNumber", "receivedDate", "completionDate", "referredEmployee", "damage", "currency", "actions", "notes", "employee"],
  "bank-properties": ["propertyName", "propertyNumber", "branch", "propertyType", "possessionStatus", "location", "area", "relatedCaseNumber", "relatedCaseId", "notes", "employee"],
  "mortgaged-properties": ["propertyName", "propertyNumber", "branch", "ownerName", "mortgageAmount", "currency", "relatedCaseNumber", "relatedCaseId", "procedureStatus", "mortgageDate", "lastFollowup", "location", "area", "notes", "employee"],
  "forged-checks": ["checkNumber", "amount", "entity", "checkDate", "complainant", "employee", "actions", "notes", "status"],
  "general-files": [
    "fileTitle", "fileCategory", "subject", "fileStatus",
    "relatedCaseNumber", "relatedInvestigationNumber",
    "receivedDate", "lastFollowup", "lastActions",
    "notes", "employee", "employeeCustody",
  ],
};

export async function importRecordsToBuiltInSection(sectionKey: string, records: any[], createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const importer = await getUserById(createdBy);
  const importUser = {
    role: importer?.role ?? "admin",
    displayName: importer?.displayName ?? null,
    username: importer?.username ?? "import",
    name: importer?.name ?? null,
  };
  const tableMap: Record<string, any> = {
    "cases": cases,
    "compensation": compensationCases,
    "guarantees": personalGuarantees,
    "investigation": investigationCases,
    "bank-properties": bankProperties,
    "mortgaged-properties": mortgagedProperties,
    "forged-checks": forgedChecks,
    "general-files": generalFiles,
  };
  const tableNameMap: Record<string, string> = {
    "compensation": "compensation_cases",
    "guarantees": "personal_guarantees",
    "investigation": "investigation_cases",
    "bank-properties": "bank_properties",
    "mortgaged-properties": "mortgaged_properties",
    "forged-checks": "forged_checks",
    "general-files": "general_files",
  };
  const table = tableMap[sectionKey];
  if (!table) throw new Error("القسم غير موجود: " + sectionKey);

  const validCols = VALID_COLUMNS[sectionKey] || [];
  const prepared: { idx: number; data: any }[] = [];
  const errors: { index: number; message: string }[] = [];

  for (let idx = 0; idx < records.length; idx++) {
    const record = records[idx];
    const raw: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (validCols.includes(key) && value !== undefined && value !== null && value !== "") {
        raw[key] = String(value);
      }
    }
    if (!Object.keys(raw).length) continue;

    try {
      let insertData: Record<string, unknown>;
      if (sectionKey === "cases") {
        insertData = normalizeCasePayload(raw);
        const caseNumber = insertData.caseNumber as string | undefined;
        if (caseNumber?.trim()) {
          const dup = await findDuplicateCase(caseNumber.trim());
          if (dup) {
            errors.push({ index: idx, message: `رقم القضية "${caseNumber}" مستخدم مسبقاً` });
            continue;
          }
        }
      } else {
        const tableName = tableNameMap[sectionKey];
        if (!tableName) {
          errors.push({ index: idx, message: "جدول غير مدعوم للاستيراد" });
          continue;
        }
        insertData = prepareGenericTableData(tableName, raw, importUser);
        if (isPropertyTable(tableName)) {
          const num = typeof insertData.propertyNumber === "string" ? insertData.propertyNumber.trim() : "";
          if (num && await propertyNumberExists(tableName, num)) {
            errors.push({ index: idx, message: `رقم العقار "${num}" مستخدم مسبقاً` });
            continue;
          }
        }
      }
      insertData.createdBy = createdBy;
      prepared.push({ idx, data: insertData });
    } catch (e: any) {
      errors.push({ index: idx, message: String(e?.message || e) });
    }
  }

  let ok = 0;
  for (let i = 0; i < prepared.length; i += 200) {
    const batch = prepared.slice(i, i + 200);
    try {
      await db.insert(table).values(batch.map((b) => b.data));
      ok += batch.length;
    } catch (e: any) {
      for (const b of batch) {
        try {
          await db.insert(table).values(b.data);
          ok += 1;
        } catch (e2: any) {
          errors.push({ index: b.idx, message: String(e2?.message || e2) });
        }
      }
    }
  }

  return {
    count: ok,
    failed: prepared.length - ok,
    skipped: records.length - prepared.length - errors.length,
    errors: errors.slice(0, 20),
  };
}

// ==========================================
// المراسلات الرسمية - Official Correspondence
// ==========================================

export async function getCorrespondence(
  type: "inbox" | "outbox",
  filters?: { employee?: string; status?: string; search?: string; archived?: boolean; page?: number; pageSize?: number },
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 50 };
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters?.pageSize ?? 50), 200);
  const conditions: any[] = [eq(correspondence.type, type)];
  if (filters?.employee) conditions.push(eq(correspondence.employee, filters.employee));
  if (filters?.status && filters.status !== "all") {
    conditions.push(eq(correspondence.status, filters.status as any));
  }
  if (filters?.archived !== undefined) conditions.push(eq(correspondence.archived, filters.archived ? 1 : 0));
  else conditions.push(eq(correspondence.archived, 0));
  if (filters?.search) {
    conditions.push(or(
      like(correspondence.bookNumber, `%${filters.search}%`),
      like(correspondence.subject, `%${filters.search}%`),
      like(correspondence.senderEntity, `%${filters.search}%`),
      like(correspondence.receiverEntity, `%${filters.search}%`),
      like(correspondence.officialNumber, `%${filters.search}%`),
      like(correspondence.autoNumber, `%${filters.search}%`),
    ));
  }
  const whereClause = and(...conditions);
  const totalRow = await db.select({ c: sql<number>`count(*)` }).from(correspondence).where(whereClause);
  const total = totalRow[0]?.c ?? 0;
  const items = await db.select().from(correspondence).where(whereClause)
    .orderBy(desc(correspondence.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items, total, page, pageSize };
}

/** للتوافق مع REST — يعيد حتى 200 سجل */
export async function getCorrespondenceList(
  type: "inbox" | "outbox",
  filters?: { employee?: string; status?: string; search?: string; archived?: boolean },
) {
  const result = await getCorrespondence(type, { ...filters, page: 1, pageSize: 200 });
  return result.items;
}

export async function getCorrespondenceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(correspondence).where(eq(correspondence.id, id)).limit(1);
  return result[0];
}

export async function createCorrespondence(data: any) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(correspondence).values(data);
  return Number(result[0].insertId);
}

export async function updateCorrespondence(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  await db.update(correspondence).set(data).where(eq(correspondence.id, id));
}

export async function deleteCorrespondence(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(correspondenceTrail).where(eq(correspondenceTrail.correspondenceId, id));
  await db.delete(correspondenceAssignments).where(eq(correspondenceAssignments.correspondenceId, id));
  await db.delete(correspondence).where(eq(correspondence.id, id));
}

export async function archiveCorrespondence(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(correspondence).set({ archived: 1 }).where(eq(correspondence.id, id));
}

const OUTBOX_NUMBERING_ROW_ID = 1;

async function getMaxLegalOutNumberForYear(dbConn: NonNullable<Awaited<ReturnType<typeof getDb>>>, year: number) {
  const [row] = await dbConn
    .select({ maxNum: sql<number>`COALESCE(MAX(${correspondence.legalOutNumber}), 0)` })
    .from(correspondence)
    .where(and(
      eq(correspondence.type, "outbox"),
      sql`YEAR(${correspondence.createdAt}) = ${year}`,
    ));
  return Number(row?.maxNum ?? 0);
}

async function ensureOutboxNumberingRow(dbConn: NonNullable<Awaited<ReturnType<typeof getDb>>>, year: number) {
  const [row] = await dbConn.select().from(correspondenceOutboxNumbering).where(eq(correspondenceOutboxNumbering.id, OUTBOX_NUMBERING_ROW_ID)).limit(1);
  if (row) {
    if (row.counterYear !== year) {
      await dbConn.update(correspondenceOutboxNumbering).set({ counterYear: year, lastApprovedLegalOutNumber: 0 }).where(eq(correspondenceOutboxNumbering.id, OUTBOX_NUMBERING_ROW_ID));
      return { counterYear: year, lastApprovedLegalOutNumber: 0, officeCode: row.officeCode };
    }
    return row;
  }
  await dbConn.insert(correspondenceOutboxNumbering).values({
    id: OUTBOX_NUMBERING_ROW_ID,
    counterYear: year,
    lastApprovedLegalOutNumber: 0,
    officeCode: "573",
  });
  return { counterYear: year, lastApprovedLegalOutNumber: 0, officeCode: "573" };
}

export async function getOutboxNumberingSettings() {
  const dbConn = await getDb();
  const year = new Date().getFullYear();
  if (!dbConn) {
    return { counterYear: year, lastApprovedLegalOutNumber: 0, lastRecordedInSystem: 0, nextAutoNumber: 1, officeCode: "573" };
  }
  const row = await ensureOutboxNumberingRow(dbConn, year);
  const lastRecordedInSystem = await getMaxLegalOutNumberForYear(dbConn, year);
  const lastApprovedLegalOutNumber = row.lastApprovedLegalOutNumber ?? 0;
  return {
    counterYear: year,
    lastApprovedLegalOutNumber,
    lastRecordedInSystem,
    nextAutoNumber: computeNextLegalOutNumber(lastApprovedLegalOutNumber, lastRecordedInSystem),
    officeCode: row.officeCode,
  };
}

export async function updateOutboxNumberingSettings(data: { lastApprovedLegalOutNumber?: number; officeCode?: string }) {
  const dbConn = await getDb();
  if (!dbConn) return;
  const year = new Date().getFullYear();
  await ensureOutboxNumberingRow(dbConn, year);
  const patch: Record<string, unknown> = {};
  if (data.lastApprovedLegalOutNumber !== undefined) patch.lastApprovedLegalOutNumber = data.lastApprovedLegalOutNumber;
  if (data.officeCode !== undefined) patch.officeCode = data.officeCode;
  if (Object.keys(patch).length > 0) {
    await dbConn.update(correspondenceOutboxNumbering).set(patch).where(eq(correspondenceOutboxNumbering.id, OUTBOX_NUMBERING_ROW_ID));
  }
}

export async function syncLastApprovedLegalOutNumber(legalOutNumber: number) {
  const dbConn = await getDb();
  if (!dbConn || legalOutNumber < 1) return;
  const year = new Date().getFullYear();
  const row = await ensureOutboxNumberingRow(dbConn, year);
  if (legalOutNumber > (row.lastApprovedLegalOutNumber ?? 0)) {
    await dbConn.update(correspondenceOutboxNumbering).set({ lastApprovedLegalOutNumber: legalOutNumber }).where(eq(correspondenceOutboxNumbering.id, OUTBOX_NUMBERING_ROW_ID));
  }
}

/** يخصص رقم صادر الوحدة القانونية تلقائياً من آخر معتمد أو آخر مسجّل. */
export async function allocateLegalOutNumber(): Promise<{ legalOutNumber: number; officeCode: string }> {
  const dbConn = await getDb();
  if (!dbConn) return { legalOutNumber: 1, officeCode: "573" };
  const year = new Date().getFullYear();

  return dbConn.transaction(async (tx) => {
    const row = await ensureOutboxNumberingRow(tx as typeof dbConn, year);
    const maxRecorded = await getMaxLegalOutNumberForYear(tx as typeof dbConn, year);
    const legalOutNumber = computeNextLegalOutNumber(row.lastApprovedLegalOutNumber ?? 0, maxRecorded);
    await tx.update(correspondenceOutboxNumbering).set({ lastApprovedLegalOutNumber: legalOutNumber }).where(eq(correspondenceOutboxNumbering.id, OUTBOX_NUMBERING_ROW_ID));
    return { legalOutNumber, officeCode: row.officeCode };
  });
}

export async function getCorrespondenceStats(employee?: string) {
  const db = await getDb();
  if (!db) return { todayInbox: 0, todayOutbox: 0, processing: 0, delayed: 0, completedThisMonth: 0 };
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.substring(0, 7) + "-01";

  const statsQuery = db
    .select({
      todayInbox: sql<number>`SUM(CASE WHEN ${correspondence.type} = 'inbox' AND ${correspondence.receivedDate} = ${today} THEN 1 ELSE 0 END)`,
      todayOutbox: sql<number>`SUM(CASE WHEN ${correspondence.type} = 'outbox' AND (${correspondence.correspondenceDate} = ${today} OR ${correspondence.receivedDate} = ${today}) THEN 1 ELSE 0 END)`,
      processing: sql<number>`SUM(CASE WHEN ${correspondence.status} = 'processing' AND ${correspondence.archived} = 0 THEN 1 ELSE 0 END)`,
      delayed: sql<number>`SUM(CASE WHEN ${correspondence.status} = 'delayed' AND ${correspondence.archived} = 0 THEN 1 ELSE 0 END)`,
      completedThisMonth: sql<number>`SUM(CASE WHEN ${correspondence.status} = 'completed' AND ${correspondence.receivedDate} >= ${monthStart} THEN 1 ELSE 0 END)`,
    })
    .from(correspondence);

  const [row] = employee
    ? await statsQuery.where(eq(correspondence.employee, employee))
    : await statsQuery;

  return {
    todayInbox: Number(row?.todayInbox ?? 0),
    todayOutbox: Number(row?.todayOutbox ?? 0),
    processing: Number(row?.processing ?? 0),
    delayed: Number(row?.delayed ?? 0),
    completedThisMonth: Number(row?.completedThisMonth ?? 0),
  };
}

export async function getCorrespondenceEntities(filters?: { search?: string; kind?: "sender" | "receiver" | "both" }) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.kind && filters.kind !== "both") {
    conditions.push(or(
      eq(correspondenceEntities.entityKind, filters.kind),
      eq(correspondenceEntities.entityKind, "both"),
    )!);
  }
  if (filters?.search?.trim()) {
    conditions.push(like(correspondenceEntities.name, `%${filters.search.trim()}%`));
  }
  const q = dbConn.select().from(correspondenceEntities).orderBy(asc(correspondenceEntities.name));
  return conditions.length > 0 ? q.where(and(...conditions)) : q;
}

export async function suggestCorrespondenceEntities(field: "sender" | "receiver", search?: string) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const q = search?.trim() ? `%${search.trim()}%` : null;
  const kind = field === "sender" ? "sender" : "receiver";

  const directory = await getCorrespondenceEntities({ search: search?.trim(), kind: kind === "sender" ? "sender" : "receiver" });

  const historyCol = field === "sender" ? correspondence.senderEntity : correspondence.receiverEntity;
  const typeFilter = field === "sender" ? eq(correspondence.type, "inbox") : eq(correspondence.type, "outbox");
  const historyConditions = [typeFilter, isNotNull(historyCol)];
  if (q) historyConditions.push(like(historyCol, q));

  const historyRows = await dbConn
    .selectDistinct({ name: historyCol })
    .from(correspondence)
    .where(and(...historyConditions))
    .orderBy(asc(historyCol))
    .limit(50);

  const names = new Set<string>();
  const result: { id?: number; name: string; source: "directory" | "history"; category?: string | null }[] = [];

  for (const row of directory) {
    const name = row.name?.trim();
    if (!name || names.has(name)) continue;
    names.add(name);
    result.push({ id: row.id, name, source: "directory", category: row.category });
  }
  for (const row of historyRows) {
    const name = row.name?.trim();
    if (!name || names.has(name)) continue;
    names.add(name);
    result.push({ name, source: "history" });
  }
  return result.slice(0, 40);
}

export async function createCorrespondenceEntity(data: {
  name: string;
  entityKind?: "sender" | "receiver" | "both";
  category?: string;
  createdBy?: number;
}) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const name = data.name.trim();
  if (!name) return null;
  const [existing] = await dbConn.select().from(correspondenceEntities).where(eq(correspondenceEntities.name, name)).limit(1);
  if (existing) return existing.id;
  const result = await dbConn.insert(correspondenceEntities).values({
    name,
    entityKind: data.entityKind ?? "both",
    category: data.category?.trim() || null,
    createdBy: data.createdBy,
  });
  return Number(result[0].insertId);
}

export async function deleteCorrespondenceEntity(id: number) {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.delete(correspondenceEntities).where(eq(correspondenceEntities.id, id));
}

export async function upsertCorrespondenceEntityFromField(
  field: "sender" | "receiver",
  name?: string | null,
  createdBy?: number,
) {
  const trimmed = name?.trim();
  if (!trimmed) return;
  await createCorrespondenceEntity({
    name: trimmed,
    entityKind: field === "sender" ? "sender" : "receiver",
    createdBy,
  });
}

export async function bulkDeleteCorrespondence(ids: number[]) {
  const db = await getDb();
  if (!db) return;
  if (ids.length === 0) return;
  await db.delete(correspondenceTrail).where(inArray(correspondenceTrail.correspondenceId, ids));
  await db.delete(correspondenceAssignments).where(inArray(correspondenceAssignments.correspondenceId, ids));
  await db.delete(correspondence).where(inArray(correspondence.id, ids));
}

export async function markOverdueCorrespondenceDelayed() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(correspondence).set({ status: "delayed" }).where(and(
    eq(correspondence.archived, 0),
    sql`${correspondence.status} NOT IN ('completed')`,
    sql`${correspondence.deadline} IS NOT NULL`,
    sql`${correspondence.deadline} != ''`,
    sql`STR_TO_DATE(${correspondence.deadline}, '%Y-%m-%d') < CURDATE()`,
    sql`${correspondence.status} != 'delayed'`,
  ));
  return Number(result[0]?.affectedRows ?? 0);
}

// تتبع مسار الكتاب - Tracking Trail
export async function addTrailEntry(data: { correspondenceId: number; action: string; fromUser?: string; toUser?: string; notes?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(correspondenceTrail).values(data as any);
}

export async function getTrail(correspondenceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(correspondenceTrail).where(eq(correspondenceTrail.correspondenceId, correspondenceId)).orderBy(asc(correspondenceTrail.createdAt));
}

// إحالة متعددة - Multi-Assignment
export async function addAssignment(data: { correspondenceId: number; assignedTo: string; task?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(correspondenceAssignments).values(data as any);
}

export async function getAssignments(correspondenceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(correspondenceAssignments).where(eq(correspondenceAssignments.correspondenceId, correspondenceId)).orderBy(desc(correspondenceAssignments.createdAt));
}

export async function updateAssignmentStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) return;
  const data: any = { status };
  if (status === 'completed') data.completedAt = new Date();
  await db.update(correspondenceAssignments).set(data).where(eq(correspondenceAssignments.id, id));
}

export async function hasAssignmentForEmployee(correspondenceId: number, employee: string) {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db.select({ id: correspondenceAssignments.id })
    .from(correspondenceAssignments)
    .where(and(
      eq(correspondenceAssignments.correspondenceId, correspondenceId),
      eq(correspondenceAssignments.assignedTo, employee),
    ))
    .limit(1);
  return !!row;
}

export async function getMyAssignments(
  employee: string,
  filters?: { status?: string; search?: string; page?: number; pageSize?: number },
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 50 };
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters?.pageSize ?? 50), 200);
  const conditions: any[] = [eq(correspondenceAssignments.assignedTo, employee)];
  if (filters?.status && filters.status !== "all") {
    conditions.push(eq(correspondenceAssignments.status, filters.status as any));
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(or(
      like(correspondence.bookNumber, q),
      like(correspondence.subject, q),
      like(correspondence.senderEntity, q),
      like(correspondence.autoNumber, q),
      like(correspondence.officialNumber, q),
      like(correspondenceAssignments.task, q),
    ));
  }
  const whereClause = and(...conditions);
  const totalRow = await db
    .select({ c: sql<number>`count(*)` })
    .from(correspondenceAssignments)
    .innerJoin(correspondence, eq(correspondenceAssignments.correspondenceId, correspondence.id))
    .where(whereClause);
  const total = Number(totalRow[0]?.c ?? 0);
  const rows = await db
    .select({
      id: correspondenceAssignments.id,
      correspondenceId: correspondenceAssignments.correspondenceId,
      assignedTo: correspondenceAssignments.assignedTo,
      task: correspondenceAssignments.task,
      status: correspondenceAssignments.status,
      completedAt: correspondenceAssignments.completedAt,
      createdAt: correspondenceAssignments.createdAt,
      bookNumber: correspondence.bookNumber,
      autoNumber: correspondence.autoNumber,
      officialNumber: correspondence.officialNumber,
      subject: correspondence.subject,
      type: correspondence.type,
      senderEntity: correspondence.senderEntity,
      receiverEntity: correspondence.receiverEntity,
      correspondenceDate: correspondence.correspondenceDate,
      receivedDate: correspondence.receivedDate,
      deadline: correspondence.deadline,
      priority: correspondence.priority,
      attachmentUrl: correspondence.attachmentUrl,
      notes: correspondence.notes,
    })
    .from(correspondenceAssignments)
    .innerJoin(correspondence, eq(correspondenceAssignments.correspondenceId, correspondence.id))
    .where(whereClause)
    .orderBy(desc(correspondenceAssignments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items: rows, total, page, pageSize };
}

export async function getMyAssignmentStats(employee: string) {
  const db = await getDb();
  if (!db) return { pending: 0, inProgress: 0, completed: 0, total: 0 };
  const [row] = await db
    .select({
      pending: sql<number>`SUM(CASE WHEN ${correspondenceAssignments.status} = 'pending' THEN 1 ELSE 0 END)`,
      inProgress: sql<number>`SUM(CASE WHEN ${correspondenceAssignments.status} = 'in_progress' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN ${correspondenceAssignments.status} = 'completed' THEN 1 ELSE 0 END)`,
      total: sql<number>`count(*)`,
    })
    .from(correspondenceAssignments)
    .where(eq(correspondenceAssignments.assignedTo, employee));
  return {
    pending: Number(row?.pending ?? 0),
    inProgress: Number(row?.inProgress ?? 0),
    completed: Number(row?.completed ?? 0),
    total: Number(row?.total ?? 0),
  };
}

// ربط الرد بالكتاب الأصلي - Get replies
export async function getCorrespondenceReplies(parentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(correspondence).where(eq(correspondence.parentId, parentId)).orderBy(desc(correspondence.createdAt));
}

// التقرير اليومي - Daily Report
function sanitizeReportDate(date?: string): string {
  const targetDate = date || new Date().toISOString().split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("صيغة التاريخ غير صالحة");
  }
  return targetDate;
}

export async function getDailyReport(date?: string) {
  const db = await getDb();
  if (!db) return { incoming: 0, outgoing: 0, completed: 0, overdue: 0 };
  const targetDate = sanitizeReportDate(date);

  const [incomingRow] = await db
    .select({ cnt: count() })
    .from(correspondence)
    .where(and(eq(correspondence.type, "inbox"), eq(correspondence.receivedDate, targetDate)));

  const [outgoingRow] = await db
    .select({ cnt: count() })
    .from(correspondence)
    .where(and(eq(correspondence.type, "outbox"), eq(correspondence.correspondenceDate, targetDate)));

  const [completedRow] = await db
    .select({ cnt: count() })
    .from(correspondence)
    .where(and(eq(correspondence.status, "completed"), sql`DATE(${correspondence.updatedAt}) = ${targetDate}`));

  const [overdueRow] = await db
    .select({ cnt: count() })
    .from(correspondence)
    .where(and(eq(correspondence.status, "delayed"), eq(correspondence.archived, 0)));

  return {
    incoming: Number(incomingRow?.cnt || 0),
    outgoing: Number(outgoingRow?.cnt || 0),
    completed: Number(completedRow?.cnt || 0),
    overdue: Number(overdueRow?.cnt || 0),
  };
}

// تقرير الكتب المتأخرة - Overdue Report
export async function getOverdueCorrespondence(filters?: { employee?: string; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const max = Math.min(Math.max(1, filters?.limit ?? 200), 500);
  const conditions: any[] = [
    ne(correspondence.correspondenceStatus, "completed"),
    or(eq(correspondence.archived, 0), isNull(correspondence.archived))!,
    isNotNull(correspondence.deadline),
    ne(correspondence.deadline, ""),
    sql`STR_TO_DATE(${correspondence.deadline}, '%Y-%m-%d') < CURDATE()`,
  ];
  if (filters?.employee) conditions.push(eq(correspondence.employee, filters.employee));
  return db.select().from(correspondence)
    .where(and(...conditions))
    .orderBy(desc(correspondence.deadline))
    .limit(max);
}

// إحصائيات الأداء - Performance Stats
export async function getPerformanceStats() {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await db.execute(sql.raw(`
    SELECT 
      employee,
      COUNT(*) as totalAssigned,
      SUM(CASE WHEN correspondenceStatus = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN correspondenceStatus = 'delayed' THEN 1 ELSE 0 END) as overdue,
      ROUND(AVG(CASE WHEN correspondenceStatus = 'completed' THEN DATEDIFF(updatedAt, STR_TO_DATE(receivedDate, '%Y-%m-%d')) END), 1) as avgResponseDays,
      ROUND(SUM(CASE WHEN correspondenceStatus = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as completionRate
    FROM correspondence
    WHERE employee IS NOT NULL AND employee != ''
    GROUP BY employee
    ORDER BY completionRate DESC
  `));
  return rows as unknown as any[];
}

// ==========================================
// المواعيد والتذكيرات - Appointments & Reminders
// ==========================================

export async function getAppointments(filters?: { employee?: string; status?: string; month?: string }, limit = 500) {
  const db = await getDb();
  if (!db) return [];
  const max = Math.min(Math.max(1, limit), 500);
  const conditions: any[] = [];
  if (filters?.employee) conditions.push(eq(appointments.employee, filters.employee));
  if (filters?.status) conditions.push(eq(appointments.status, filters.status as any));
  if (filters?.month) conditions.push(like(appointments.appointmentDate, `${filters.month}%`));
  if (conditions.length > 0) {
    return db.select().from(appointments).where(and(...conditions)).orderBy(asc(appointments.appointmentDate)).limit(max);
  }
  return db.select().from(appointments).orderBy(asc(appointments.appointmentDate)).limit(max);
}

export async function getUpcomingAppointments(employee?: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  const today = new Date().toISOString().split("T")[0];
  const conditions: any[] = [
    sql`appointmentDate >= ${today}`,
    eq(appointments.status, "upcoming"),
  ];
  if (employee) conditions.push(eq(appointments.employee, employee));
  return db.select().from(appointments).where(and(...conditions)).orderBy(asc(appointments.appointmentDate)).limit(limit);
}

export async function getAppointmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return result[0];
}

export async function createAppointment(data: any) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(appointments).values(data);
  return Number(result[0].insertId);
}

export async function updateAppointment(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  await db.update(appointments).set(data).where(eq(appointments.id, id));
}

export async function deleteAppointment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(appointments).where(eq(appointments.id, id));
}

export async function checkAppointmentConflicts(date: string, time: string, employee: string, excludeId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [
    eq(appointments.appointmentDate, date),
    eq(appointments.appointmentTime, time),
    eq(appointments.employee, employee),
    eq(appointments.status, "upcoming"),
  ];
  if (excludeId) conditions.push(sql`id != ${excludeId}`);
  return db.select().from(appointments).where(and(...conditions));
}

export async function bulkDeleteAppointments(ids: number[]) {
  const db = await getDb();
  if (!db) return;
  await db.delete(appointments).where(inArray(appointments.id, ids));
}

export async function getAppointmentsNeedingReminder() {
  const db = await getDb();
  if (!db) return [];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const from = yesterday.toISOString().split("T")[0];
  return db.select().from(appointments).where(and(
    eq(appointments.status, "upcoming"),
    eq(appointments.reminderSent, 0),
    sql`appointmentDate >= ${from}`,
  ));
}

export async function autoCompletePastAppointments() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(appointments).set({ status: "completed" }).where(and(
    eq(appointments.status, "upcoming"),
    sql`(
      STR_TO_DATE(${appointments.appointmentDate}, '%Y-%m-%d') < CURDATE()
      OR (
        STR_TO_DATE(${appointments.appointmentDate}, '%Y-%m-%d') = CURDATE()
        AND ${appointments.appointmentTime} IS NOT NULL
        AND ${appointments.appointmentTime} != ''
        AND ${appointments.appointmentTime} < TIME_FORMAT(NOW(), '%H:%i')
      )
    )`,
  ));
  return Number(result[0]?.affectedRows ?? 0);
}

// ==========================================
// طلبات المراجعة القانونية - Legal Review Requests
// ==========================================

export async function getLegalReviews(filters?: {
  status?: string;
  priority?: string;
  assignedTo?: string;
  createdBy?: number;
  userId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 50 };
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters?.pageSize ?? 50), 200);
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(legalReviews.status, filters.status as any));
  if (filters?.priority) conditions.push(eq(legalReviews.priority, filters.priority as any));
  if (filters?.assignedTo) conditions.push(eq(legalReviews.assignedTo, filters.assignedTo));
  if (filters?.createdBy) conditions.push(eq(legalReviews.createdBy, filters.createdBy));
  if (filters?.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(
      like(legalReviews.title, term),
      like(legalReviews.description, term),
      like(legalReviews.location, term),
    )!);
  }
  if (filters?.userId) {
    conditions.push(or(eq(legalReviews.createdBy, filters.userId), eq(legalReviews.assignedToId, filters.userId)));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const totalRow = whereClause
    ? await db.select({ c: sql<number>`count(*)` }).from(legalReviews).where(whereClause)
    : await db.select({ c: sql<number>`count(*)` }).from(legalReviews);
  const total = totalRow[0]?.c ?? 0;
  const items = whereClause
    ? await db.select().from(legalReviews).where(whereClause).orderBy(desc(legalReviews.createdAt)).limit(pageSize).offset((page - 1) * pageSize)
    : await db.select().from(legalReviews).orderBy(desc(legalReviews.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export async function getLegalReviewOpenCount(filters?: { userId?: number }) {
  const db = await getDb();
  if (!db) return 0;
  const conditions: any[] = [
    or(eq(legalReviews.status, "new"), eq(legalReviews.status, "in_review"))!,
  ];
  if (filters?.userId) {
    conditions.push(or(eq(legalReviews.createdBy, filters.userId), eq(legalReviews.assignedToId, filters.userId))!);
  }
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(legalReviews)
    .where(and(...conditions));
  return result[0]?.count ?? 0;
}

export async function getLegalReviewById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(legalReviews).where(eq(legalReviews.id, id)).limit(1);
  return result[0];
}

export async function createLegalReview(data: any) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(legalReviews).values(data);
  return Number(result[0].insertId);
}

export async function updateLegalReview(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  await db.update(legalReviews).set(data).where(eq(legalReviews.id, id));
}

export async function deleteLegalReview(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(legalReviewTrail).where(eq(legalReviewTrail.reviewId, id));
  await db.delete(legalReviews).where(eq(legalReviews.id, id));
}

export async function addLegalReviewTrail(data: {
  reviewId: number;
  action: string;
  notes?: string | null;
  performedBy?: number | null;
  performedByName?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(legalReviewTrail).values(data);
}

export async function getLegalReviewTrail(reviewId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(legalReviewTrail)
    .where(eq(legalReviewTrail.reviewId, reviewId))
    .orderBy(asc(legalReviewTrail.createdAt));
}

export async function getLegalReviewsByCaseId(caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(legalReviews).where(eq(legalReviews.relatedCaseId, caseId));
}

export async function getLegalReviewsNeedingFollowupReminder() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(legalReviews).where(and(
    sql`${legalReviews.relatedCaseId} IS NOT NULL`,
    or(isNotNull(legalReviews.assignedToId), isNotNull(legalReviews.createdBy))!,
    or(eq(legalReviews.status, "in_review"), eq(legalReviews.status, "completed"))!,
    eq(legalReviews.followupReminderSent, 0),
    or(eq(legalReviews.followupStatus, "none"), isNull(legalReviews.followupStatus))!,
    sql`(
      STR_TO_DATE(${legalReviews.reviewDate}, '%Y-%m-%d') < CURDATE()
      OR (
        STR_TO_DATE(${legalReviews.reviewDate}, '%Y-%m-%d') = CURDATE()
        AND HOUR(NOW()) >= 18
      )
    )`,
  ));
}

/** طلبات مراجعة بمتابعة معلّقة تمنع الموظف من تقديم طلب جديد — من لحظة التقديم حتى موافقة المدير */
export async function getLegalReviewsBlockingNewRequest(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(legalReviews).where(and(
    sql`${legalReviews.relatedCaseId} IS NOT NULL`,
    or(
      eq(legalReviews.assignedToId, userId),
      eq(legalReviews.createdBy, userId),
    )!,
    ne(legalReviews.status, "rejected"),
    inArray(legalReviews.followupStatus, ["awaiting_submission", "pending_approval", "rejected"]),
  )).orderBy(desc(legalReviews.reviewDate));
}

export async function enrichLegalReviewsWithCases(
  reviews: Awaited<ReturnType<typeof getLegalReviews>>["items"],
) {
  const ids = [...new Set(
    reviews.map((r) => r.relatedCaseId).filter((id): id is number => id != null),
  )];
  if (ids.length === 0) return reviews.map((r) => ({ ...r, relatedCase: null }));
  const caseMap = new Map<number, { caseNumber: string | null; subject: string | null }>();
  await Promise.all(ids.map(async (id) => {
    const c = await getCaseById(id);
    if (c) caseMap.set(id, { caseNumber: c.caseNumber, subject: c.subject });
  }));
  return reviews.map((r) => ({
    ...r,
    relatedCase: r.relatedCaseId ? caseMap.get(r.relatedCaseId) ?? null : null,
  }));
}

export async function getEmployeeAppointmentsOnDate(date: string, employeeName: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appointments).where(and(
    eq(appointments.appointmentDate, date),
    eq(appointments.employee, employeeName),
    eq(appointments.status, "upcoming")
  ));
}

// خريطة القضايا - Cases Map Stats
export type CasesMapFilters = {
  timeFilter?: string;
  compare?: boolean;
  caseType?: string;
  caseStatus?: string;
  branch?: string;
  employee?: string;
};

type ProvinceBucket = {
  province: string;
  total: number;
  newCases: number;
  processing: number;
  completed: number;
  cityStats: Record<string, number>;
  layers: { cases: number; investigation: number; correspondence: number; appointments: number };
  previousTotal?: number;
};

function branchToGovernorate(branchName: string | null | undefined): string | null {
  const hit = findBranchByField(branchName);
  return hit?.governorate ?? null;
}

function getPeriodBounds(timeFilter?: string, period: "current" | "previous" = "current"): { start: Date | null; end: Date | null } {
  const now = Date.now();
  const day = 86400000;
  const tf = timeFilter || "30d";
  if (tf === "all") return { start: null, end: null };
  const ranges: Record<string, [number, number | null, number, number | null]> = {
    "30d": [30, null, 60, 30],
    "30days": [30, null, 60, 30],
    "90d": [90, null, 180, 90],
    "3months": [90, null, 180, 90],
    "365d": [365, null, 730, 365],
    year: [365, null, 730, 365],
  };
  const r = ranges[tf] ?? ranges["30d"];
  if (period === "current") {
    return { start: new Date(now - r[0] * day), end: null };
  }
  return { start: new Date(now - r[2] * day), end: new Date(now - r[3]! * day) };
}

function inPeriod(date: Date | string | null | undefined, start: Date | null, end: Date | null): boolean {
  if (!start && !end) return true;
  if (!date) return false;
  const d = new Date(date);
  if (start && d < start) return false;
  if (end && d >= end) return false;
  return true;
}

function emptyBucket(province: string): ProvinceBucket {
  return {
    province,
    total: 0,
    newCases: 0,
    processing: 0,
    completed: 0,
    cityStats: {},
    layers: { cases: 0, investigation: 0, correspondence: 0, appointments: 0 },
    previousTotal: 0,
  };
}

function bumpCaseStatus(bucket: ProvinceBucket, status: string | null) {
  const s = status || "";
  if (s === "جديدة" || !s) bucket.newCases++;
  if (["قيد المعالجة", "قيد التحقيق", "قيد المرافعة", "محالة", "موحدة"].includes(s)) bucket.processing++;
  if (["منجزة", "محسومة"].includes(s)) bucket.completed++;
}

export async function getCasesMapStats(filters?: CasesMapFilters) {
  const database = await getDb();
  if (!database) return { provinces: [] as ProvinceBucket[], branchStats: {} as Record<string, number>, branchStatsById: {} as Record<number, number>, alertProvinces: [] as string[] };

  const currentBounds = getPeriodBounds(filters?.timeFilter, "current");
  const previousBounds = filters?.compare ? getPeriodBounds(filters?.timeFilter, "previous") : { start: null, end: null };
  const earliestStart = filters?.compare && previousBounds.start
    ? previousBounds.start
    : currentBounds.start;
  const sqlStart = earliestStart ?? new Date(Date.now() - 730 * 86400000);

  const caseConditions = [isNotNull(cases.province)];
  if (filters?.caseType) caseConditions.push(eq(cases.type, filters.caseType));
  if (filters?.caseStatus) caseConditions.push(eq(cases.caseStatus, filters.caseStatus));
  if (filters?.branch) caseConditions.push(like(cases.branch, `%${filters.branch}%`));
  if (filters?.employee) caseConditions.push(eq(cases.employee, filters.employee));
  if (earliestStart) caseConditions.push(gte(cases.createdAt, earliestStart));
  else caseConditions.push(gte(cases.createdAt, sqlStart));

  const allCaseRows = await database
    .select({
      province: cases.province,
      city: cases.city,
      branch: cases.branch,
      caseStatus: cases.caseStatus,
      createdAt: cases.createdAt,
    })
    .from(cases)
    .where(and(...caseConditions));

  const invConditions: any[] = [];
  if (filters?.employee) invConditions.push(eq(investigationCases.employee, filters.employee));
  invConditions.push(gte(investigationCases.createdAt, earliestStart ?? sqlStart));
  const invRows = await database
    .select({ branch: investigationCases.branch, createdAt: investigationCases.createdAt })
    .from(investigationCases)
    .where(and(...invConditions));

  const corrConditions: any[] = [gte(correspondence.createdAt, earliestStart ?? sqlStart)];
  const corrRows = await database
    .select({ relatedCaseId: correspondence.relatedCaseId, createdAt: correspondence.createdAt })
    .from(correspondence)
    .where(and(...corrConditions));

  const apptConditions: any[] = [gte(appointments.createdAt, earliestStart ?? sqlStart)];
  const apptRows = await database
    .select({ caseId: appointments.caseId, createdAt: appointments.createdAt })
    .from(appointments)
    .where(and(...apptConditions));

  const caseProvinceById = new Map<number, string>();
  const joinConditions = filters?.employee ? [eq(cases.employee, filters.employee)] : [];
  const allCasesForJoin = joinConditions.length > 0
    ? await database.select({ id: cases.id, province: cases.province }).from(cases).where(and(...joinConditions))
    : await database.select({ id: cases.id, province: cases.province }).from(cases);
  for (const c of allCasesForJoin) {
    const p = normalizeProvinceName(c.province);
    if (p) caseProvinceById.set(c.id, p);
  }

  const buckets = new Map<string, ProvinceBucket>();
  const prevTotals = new Map<string, number>();
  const branchStats: Record<string, number> = {};

  for (const row of allCaseRows) {
    const province = normalizeProvinceName(row.province);
    if (!province) continue;
    if (!buckets.has(province)) buckets.set(province, emptyBucket(province));
    const b = buckets.get(province)!;

    if (inPeriod(row.createdAt, currentBounds.start, currentBounds.end)) {
      b.total++;
      b.layers.cases++;
      bumpCaseStatus(b, row.caseStatus);
      if (row.city?.trim()) {
        b.cityStats[row.city.trim()] = (b.cityStats[row.city.trim()] || 0) + 1;
      }
      if (row.branch?.trim()) {
        branchStats[row.branch.trim()] = (branchStats[row.branch.trim()] || 0) + 1;
      }
    }
    if (filters?.compare && inPeriod(row.createdAt, previousBounds.start, previousBounds.end)) {
      prevTotals.set(province, (prevTotals.get(province) || 0) + 1);
    }
  }

  for (const row of invRows) {
    const province = branchToGovernorate(row.branch);
    if (!province) continue;
    if (!inPeriod(row.createdAt, currentBounds.start, currentBounds.end)) continue;
    if (!buckets.has(province)) buckets.set(province, emptyBucket(province));
    buckets.get(province)!.layers.investigation++;
  }

  for (const row of corrRows) {
    if (!row.relatedCaseId) continue;
    const province = caseProvinceById.get(row.relatedCaseId);
    if (!province) continue;
    if (!inPeriod(row.createdAt, currentBounds.start, currentBounds.end)) continue;
    if (!buckets.has(province)) buckets.set(province, emptyBucket(province));
    buckets.get(province)!.layers.correspondence++;
  }

  for (const row of apptRows) {
    if (!row.caseId) continue;
    const province = caseProvinceById.get(row.caseId);
    if (!province) continue;
    if (!inPeriod(row.createdAt, currentBounds.start, currentBounds.end)) continue;
    if (!buckets.has(province)) buckets.set(province, emptyBucket(province));
    buckets.get(province)!.layers.appointments++;
  }

  const provinces = Array.from(buckets.values()).map((b) => ({
    ...b,
    previousTotal: filters?.compare ? (prevTotals.get(b.province) || 0) : undefined,
  }));

  const alertProvinces = provinces
    .filter((p) => p.processing >= MAP_ALERT_PROCESSING_THRESHOLD)
    .map((p) => p.province);

  const branchStatsById = aggregateBranchStatsById(branchStats);

  return { provinces, branchStats, branchStatsById, alertProvinces };
}


// Integrity Cases & Reports
export async function getIntegrityCases(
  statusFilter?: string,
  filters?: { province?: string; employee?: string; page?: number; pageSize?: number },
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 100 };
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters?.pageSize ?? 100), 200);
  const conditions: any[] = [eq(cases.type, "نزاهة"), notArchivedCaseCondition()];
  if (statusFilter) conditions.push(eq(cases.caseStatus, statusFilter));
  if (filters?.province) conditions.push(eq(cases.province, filters.province));
  if (filters?.employee) conditions.push(eq(cases.employee, filters.employee));
  const whereClause = and(...conditions);
  const totalRow = await db.select({ c: sql<number>`count(*)` }).from(cases).where(whereClause);
  const total = totalRow[0]?.c ?? 0;
  const items = await db.select().from(cases).where(whereClause)
    .orderBy(desc(cases.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export async function getIntegrityCasesStats(filters?: { province?: string; employee?: string }) {
  const db = await getDb();
  if (!db) return {};
  const conditions: any[] = [eq(cases.type, "نزاهة"), notArchivedCaseCondition()];
  if (filters?.province) conditions.push(eq(cases.province, filters.province));
  if (filters?.employee) conditions.push(eq(cases.employee, filters.employee));
  const rows = await db
    .select({ status: cases.caseStatus, c: sql<number>`count(*)` })
    .from(cases)
    .where(and(...conditions))
    .groupBy(cases.caseStatus);
  const stats: Record<string, number> = {};
  for (const row of rows) {
    const key = row.status || "غير محدد";
    stats[key] = row.c ?? 0;
  }
  return stats;
}

export async function getPeriodicReport(
  periodType: "monthly" | "quarterly" | "annual",
  year: number,
  month?: number,
  quarter?: number,
  statusFilter?: string,
  filters?: { province?: string; employee?: string }
) {
  const db = await getDb();
  if (!db) return { added: 0, forwarded: 0, resolved: 0, underInvestigation: 0, unified: 0, byCaseStatus: {}, details: [] };
  let startDate: Date, endDate: Date;

  if (periodType === "monthly" && month) {
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0, 23, 59, 59);
  } else if (periodType === "quarterly" && quarter) {
    const monthStart = (quarter - 1) * 3;
    startDate = new Date(year, monthStart, 1);
    endDate = new Date(year, monthStart + 3, 0, 23, 59, 59);
  } else {
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31, 23, 59, 59);
  }

  const conditions: any[] = [
    eq(cases.type, "نزاهة"),
    gte(cases.createdAt, startDate),
    lte(cases.createdAt, endDate),
  ];
  if (filters?.province) conditions.push(eq(cases.province, filters.province));
  if (filters?.employee) conditions.push(eq(cases.employee, filters.employee));
  if (statusFilter) conditions.push(eq(cases.caseStatus, statusFilter));
  const whereClause = and(...conditions);

  const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(cases).where(whereClause);
  const added = countRow?.c ?? 0;

  const statusRows = await db
    .select({ status: cases.caseStatus, c: sql<number>`count(*)` })
    .from(cases)
    .where(whereClause)
    .groupBy(cases.caseStatus);

  const byCaseStatus: Record<string, number> = {};
  let forwarded = 0;
  let resolved = 0;
  let underInvestigation = 0;
  let unified = 0;
  for (const row of statusRows) {
    const key = row.status || "غير محدد";
    byCaseStatus[key] = row.c ?? 0;
    if (key === "محالة") forwarded = row.c ?? 0;
    if (key === "محسومة") resolved = row.c ?? 0;
    if (key === "قيد التحقيق") underInvestigation = row.c ?? 0;
    if (key === "موحدة") unified = row.c ?? 0;
  }

  const filtered = await db.select().from(cases).where(whereClause)
    .orderBy(desc(cases.createdAt))
    .limit(500);

  return {
    added,
    forwarded,
    resolved,
    underInvestigation,
    unified,
    byCaseStatus,
    details: filtered.map((c: any) => ({
      caseNumber: c.caseNumber,
      subject: c.subject,
      status: c.caseStatus,
      createdAt: c.createdAt,
    })),
  };
}

// ==========================================
// إحصائيات الفرع - Branch Stats for Map
// ==========================================
export async function getBranchStats(branchName: string, employee?: string) {
  const database = await getDb();
  if (!database) return { cases: 0, processing: 0 };

  try {
    const catalog = findBranchByField(branchName);
    const branchCond = catalog
      ? or(
          eq(cases.branch, branchName),
          like(cases.branch, `%${catalog.name}%`),
          ...(catalog.aliases ?? []).map((a) => like(cases.branch, `%${a}%`)),
        )!
      : or(eq(cases.branch, branchName), like(cases.branch, `%${branchName}%`))!;
    const conditions: any[] = [branchCond];
    if (employee) conditions.push(eq(cases.employee, employee));
    const rows = await database
      .select({ branch: cases.branch, caseStatus: cases.caseStatus })
      .from(cases)
      .where(and(...conditions));
    const casesCount = rows.length;
    const processing = rows.filter((r) =>
      ["قيد المعالجة", "قيد التحقيق", "قيد المرافعة", "محالة", "موحدة"].includes(r.caseStatus || ""),
    ).length;
    return { cases: casesCount, processing };
  } catch {
    return { cases: 0, processing: 0 };
  }
}
