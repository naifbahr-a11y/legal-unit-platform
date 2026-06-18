import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint, json, index, uniqueIndex } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  password: varchar("password", { length: 256 }).notNull(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "supervisor"]).default("user").notNull(),
  // New profile fields
  specialization: varchar("specialization", { length: 256 }),
  jobTitle: varchar("jobTitle", { length: 256 }),
  phone: varchar("phone", { length: 64 }),
  branch: varchar("branch", { length: 128 }),
  active: int("active").default(1).notNull(),
  mustChangePassword: int("mustChangePassword").default(0).notNull(),
  tokenVersion: int("tokenVersion").default(0).notNull(),
  // Permissions JSON (for granular permissions)
  permissions: json("permissions"),
  // Telegram integration
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  telegramLinkCode: varchar("telegramLinkCode", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// سجل القضايا - Cases Registry (main cases from data.json)
export const cases = mysqlTable("cases", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 64 }),
  employee: varchar("employee", { length: 128 }),
  caseNumber: varchar("caseNumber", { length: 128 }),
  investigationNumber: varchar("investigationNumber", { length: 128 }),
  subject: text("subject"),
  complainant: text("complainant"),
  accused: text("accused"),
  authority: text("authority"),
  damage: text("damage"),
  lastActions: text("lastActions"),
  caseStatus: varchar("caseStatus", { length: 128 }),
  documentation: text("documentation"),
  caseReceived: varchar("caseReceived", { length: 64 }),
  lastFollowup: varchar("lastFollowup", { length: 64 }),
  expiry: varchar("expiry", { length: 64 }),
  remainingDays: varchar("remainingDays", { length: 64 }),
  currency: mysqlEnum("currency", ["IQD", "USD", "both"]),
  province: varchar("province", { length: 128 }),
  city: varchar("city", { length: 128 }),
  branch: varchar("branch", { length: 128 }),
  archived: int("archived").default(0).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("cases_employee_idx").on(table.employee),
  index("cases_type_idx").on(table.type),
  index("cases_employee_type_idx").on(table.employee, table.type),
  index("cases_case_status_idx").on(table.caseStatus),
  index("cases_created_at_idx").on(table.createdAt),
  index("cases_province_idx").on(table.province),
  index("cases_branch_idx").on(table.branch),
  index("cases_expiry_idx").on(table.expiry),
  index("cases_archived_idx").on(table.archived),
  uniqueIndex("cases_case_number_uidx").on(table.caseNumber),
]);
// قضايا التضمينن - Compensation Cases
export const compensationCases = mysqlTable("compensation_cases", {
  id: int("id").autoincrement().primaryKey(),
  ministerialOrder: text("ministerialOrder"),
  administrativeOrder: text("administrativeOrder"),
  investigativeCase: text("investigativeCase"),
  caseTitle: text("caseTitle"),
  guarantorName: varchar("guarantorName", { length: 256 }),
  compensationAmount: varchar("compensationAmount", { length: 128 }),
  paymentDetails: text("paymentDetails"),
  lastActions: text("lastActions"),
  employee: varchar("employee", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("compensation_cases_employee_idx").on(table.employee),
]);

// الكفالات الشخصية - Personal Guarantees
export const personalGuarantees = mysqlTable("personal_guarantees", {
  id: int("id").autoincrement().primaryKey(),
  debtorName: varchar("debtorName", { length: 256 }),
  guarantor: varchar("guarantor", { length: 256 }),
  debtAmount: varchar("debtAmount", { length: 128 }),
  paymentDetails: text("paymentDetails"),
  lastActions: text("lastActions"),
  employee: varchar("employee", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("personal_guarantees_employee_idx").on(table.employee),
]);

// القضايا التحقيقية - Investigation Cases
export const investigationCases = mysqlTable("investigation_cases", {
  id: int("id").autoincrement().primaryKey(),
  branch: varchar("branch", { length: 256 }),
  subject: text("subject"),
  caseNumber: varchar("caseNumber", { length: 128 }),
  receivedDate: varchar("receivedDate", { length: 64 }),
  completionDate: varchar("completionDate", { length: 64 }),
  referredEmployee: varchar("referredEmployee", { length: 256 }),
  damage: text("damage"),
  currency: mysqlEnum("currency", ["IQD", "USD", "both"]),
  actions: text("actions"),
  notes: text("notes"),
  employee: varchar("employee", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("investigation_cases_employee_idx").on(table.employee),
]);

// عقارات المصرف - Bank Properties
export const bankProperties = mysqlTable("bank_properties", {
  id: int("id").autoincrement().primaryKey(),
  propertyName: varchar("propertyName", { length: 256 }),
  propertyNumber: varchar("propertyNumber", { length: 128 }),
  branch: varchar("branch", { length: 256 }),
  propertyType: varchar("propertyType", { length: 64 }),
  possessionStatus: varchar("possessionStatus", { length: 64 }),
  location: text("location"),
  area: varchar("area", { length: 128 }),
  relatedCaseNumber: varchar("relatedCaseNumber", { length: 128 }),
  relatedCaseId: int("relatedCaseId"),
  notes: text("notes"),
  employee: varchar("employee", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("bank_properties_employee_idx").on(table.employee),
  uniqueIndex("bank_properties_property_number_uidx").on(table.propertyNumber),
]);

// العقارات المرهونة - Mortgaged Properties
export const mortgagedProperties = mysqlTable("mortgaged_properties", {
  id: int("id").autoincrement().primaryKey(),
  propertyName: varchar("propertyName", { length: 256 }),
  propertyNumber: varchar("propertyNumber", { length: 128 }),
  branch: varchar("branch", { length: 256 }),
  ownerName: varchar("ownerName", { length: 256 }),
  mortgageAmount: varchar("mortgageAmount", { length: 128 }),
  currency: varchar("currency", { length: 16 }).default("IQD"),
  relatedCaseNumber: varchar("relatedCaseNumber", { length: 128 }),
  relatedCaseId: int("relatedCaseId"),
  procedureStatus: varchar("procedureStatus", { length: 64 }),
  mortgageDate: varchar("mortgageDate", { length: 32 }),
  lastFollowup: varchar("lastFollowup", { length: 32 }),
  location: text("location"),
  area: varchar("area", { length: 128 }),
  notes: text("notes"),
  employee: varchar("employee", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("mortgaged_properties_employee_idx").on(table.employee),
  uniqueIndex("mortgaged_properties_property_number_uidx").on(table.propertyNumber),
]);

// الموقف الفصلي - Anti-corruption Reports
export const antiCorruptionReports = mysqlTable("anti_corruption_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportType: varchar("reportType", { length: 64 }),
  period: varchar("period", { length: 64 }),
  year: varchar("year", { length: 10 }),
  content: text("content"),
  imageUrl: text("imageUrl"),
  employee: varchar("employee", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("anti_corruption_reports_employee_idx").on(table.employee),
]);

// الملفات العامة - General Files (قضايا لم تقام، قيد المتابعة، مواضيع بدون قضية)
export const generalFiles = mysqlTable("general_files", {
  id: int("id").autoincrement().primaryKey(),
  fileTitle: text("fileTitle"),
  fileCategory: varchar("fileCategory", { length: 64 }),
  subject: text("subject"),
  fileStatus: varchar("fileStatus", { length: 64 }),
  relatedCaseNumber: varchar("relatedCaseNumber", { length: 128 }),
  relatedInvestigationNumber: varchar("relatedInvestigationNumber", { length: 128 }),
  receivedDate: varchar("receivedDate", { length: 32 }),
  lastFollowup: varchar("lastFollowup", { length: 32 }),
  lastActions: text("lastActions"),
  employeeCustody: varchar("employeeCustody", { length: 256 }),
  notes: text("notes"),
  employee: varchar("employee", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("general_files_employee_idx").on(table.employee),
]);

// العمليات المعلقة - Pending Operations
export const pendingOperations = mysqlTable("pending_operations", {
  id: int("id").autoincrement().primaryKey(),
  tableName: varchar("tableName", { length: 64 }).notNull(),
  recordId: int("recordId"),
  operationType: mysqlEnum("operationType", ["add", "edit", "delete"]).notNull(),
  data: json("data"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  submittedBy: int("submittedBy").notNull(),
  submittedByName: varchar("submittedByName", { length: 128 }),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pending_operations_status_idx").on(table.status),
  index("pending_operations_submitted_by_idx").on(table.submittedBy),
]);

// الإشعارات - Notifications
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  message: text("message"),
  type: varchar("type", { length: 64 }),
  isRead: int("isRead").default(0).notNull(),
    relatedId: int("relatedId"),
  targetEmployee: varchar("targetEmployee", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_user_read_idx").on(table.userId, table.isRead),
  index("notifications_target_employee_idx").on(table.targetEmployee),
  index("notifications_user_related_type_idx").on(table.userId, table.relatedId, table.type),
]);
// غرفة الاجتماعات - Chat Messages
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("senderId").notNull(),
  senderName: varchar("senderName", { length: 128 }).notNull(),
  recipientId: int("recipientId"), // null = group message
  message: text("message").notNull(),
  isRead: int("isRead").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("chat_messages_recipient_idx").on(table.recipientId),
  index("chat_messages_recipient_read_idx").on(table.recipientId, table.isRead),
  index("chat_messages_sender_recipient_idx").on(table.senderId, table.recipientId),
]);

// سجل النشاط - Activity Log
export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  username: varchar("username", { length: 64 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("activity_log_created_at_idx").on(table.createdAt),
  index("activity_log_user_id_idx").on(table.userId),
]);

// سجل العمليات التفصيلي - Audit Log
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  username: varchar("username", { length: 128 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  tableName: varchar("tableName", { length: 64 }),
  recordId: int("recordId"),
  description: text("description"),
  oldData: json("oldData"),
  newData: json("newData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("audit_log_table_record_idx").on(table.tableName, table.recordId),
  index("audit_log_created_at_idx").on(table.createdAt),
]);

// مرفقات القضايا - Case Attachments
export const caseAttachments = mysqlTable("case_attachments", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  tableName: varchar("tableName", { length: 64 }).notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 128 }),
  uploadedBy: int("uploadedBy"),
  uploadedByName: varchar("uploadedByName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("case_attachments_case_table_idx").on(table.caseId, table.tableName),
]);

// الصكوك المزورة - Forged Checks
export const forgedChecks = mysqlTable("forged_checks", {
  id: int("id").autoincrement().primaryKey(),
  checkNumber: varchar("checkNumber", { length: 128 }),
  amount: varchar("amount", { length: 128 }),
  entity: text("entity"),
  checkDate: varchar("checkDate", { length: 64 }),
  complainant: varchar("complainant", { length: 128 }),
  employee: varchar("employee", { length: 128 }),
  actions: text("actions"),
  notes: text("notes"),
  status: varchar("status", { length: 64 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("forged_checks_employee_idx").on(table.employee),
  index("forged_checks_complainant_idx").on(table.complainant),
]);

// أقسام مخصصة - Custom Sections (admin-created dynamic sections)
export const customSections = mysqlTable("custom_sections", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  icon: varchar("icon", { length: 64 }).default("FileText"),
  fields: json("fields").notNull(), // Array of { key, label, type, showInTable }
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// بيانات الأقسام المخصصة - Custom Section Records
export const customSectionRecords = mysqlTable("custom_section_records", {
  id: int("id").autoincrement().primaryKey(),
  sectionId: int("sectionId").notNull(),
  data: json("data").notNull(), // Dynamic key-value pairs based on section fields
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("custom_section_records_section_id_idx").on(table.sectionId),
]);

// أنواع القضايا المخصصة - Custom Case Types
export const customCaseTypes = mysqlTable("custom_case_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const correspondenceEntities = mysqlTable("correspondence_entities", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull().unique(),
  entityKind: mysqlEnum("entityKind", ["sender", "receiver", "both"]).default("both").notNull(),
  category: varchar("category", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// المراسلات الرسمية - Official Correspondence (Inbox/Outbox)
export const correspondence = mysqlTable("correspondence", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["inbox", "outbox"]).notNull(),
  bookNumber: varchar("bookNumber", { length: 128 }),
  subject: text("subject"),
  senderEntity: varchar("senderEntity", { length: 256 }),
  receiverEntity: varchar("receiverEntity", { length: 256 }),
  correspondenceDate: varchar("correspondenceDate", { length: 64 }),
  receivedDate: varchar("receivedDate", { length: 64 }),
  employee: varchar("employee", { length: 128 }),
  status: mysqlEnum("correspondenceStatus", ["completed", "processing", "delayed", "direct"]).default("direct"),
  priority: mysqlEnum("priority", ["very_urgent", "urgent", "normal", "fyi"]).default("normal"),
  parentId: int("parentId"),
  deadline: varchar("deadline", { length: 64 }),
  attachmentUrl: text("attachmentUrl"),
  attachmentKey: varchar("attachmentKey", { length: 512 }),
    archived: int("archived").default(0),
  notes: text("notes"),
  relatedCaseId: int("relatedCaseId"),
  relatedCaseNumber: varchar("relatedCaseNumber", { length: 128 }),
  autoNumber: varchar("autoNumber", { length: 64 }),
  legalOutNumber: int("legalOutNumber"),
  mandobOutNumber: varchar("mandobOutNumber", { length: 64 }),
  officialNumber: varchar("officialNumber", { length: 128 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("correspondence_type_employee_archived_idx").on(table.type, table.employee, table.archived),
  index("correspondence_employee_idx").on(table.employee),
  index("correspondence_parent_id_idx").on(table.parentId),
  index("correspondence_received_date_idx").on(table.receivedDate),
  index("correspondence_status_archived_idx").on(table.status, table.archived),
  index("correspondence_created_at_idx").on(table.createdAt),
]);

export const correspondenceOutboxNumbering = mysqlTable("correspondence_outbox_numbering", {
  id: int("id").primaryKey(),
  counterYear: int("counterYear").notNull(),
  lastApprovedLegalOutNumber: int("lastApprovedLegalOutNumber").notNull().default(0),
  officeCode: varchar("officeCode", { length: 16 }).notNull().default("573"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const correspondenceAutoNumbering = mysqlTable("correspondence_auto_numbering", {
  id: int("id").autoincrement().primaryKey(),
  counterYear: int("counterYear").notNull(),
  type: mysqlEnum("type", ["inbox", "outbox"]).notNull(),
  lastSeq: int("lastSeq").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("correspondence_auto_numbering_year_type_idx").on(table.counterYear, table.type),
]);
// تتبع مسار الكتاب - Correspondence Tracking Trail
export const correspondenceTrail = mysqlTable("correspondence_trail", {
  id: int("id").autoincrement().primaryKey(),
  correspondenceId: int("correspondenceId").notNull(),
  action: mysqlEnum("action", ["received", "forwarded", "executed", "archived", "returned", "noted"]).notNull(),
  fromUser: varchar("fromUser", { length: 128 }),
  toUser: varchar("toUser", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("correspondence_trail_correspondence_id_idx").on(table.correspondenceId),
]);

// إحالة متعددة - Correspondence Assignments
export const correspondenceAssignments = mysqlTable("correspondence_assignments", {
  id: int("id").autoincrement().primaryKey(),
  correspondenceId: int("correspondenceId").notNull(),
  assignedTo: varchar("assignedTo", { length: 128 }).notNull(),
  task: text("task"),
  status: mysqlEnum("assignmentStatus", ["pending", "in_progress", "completed"]).default("pending"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("correspondence_assignments_correspondence_id_idx").on(table.correspondenceId),
  index("correspondence_assignments_assigned_to_idx").on(table.assignedTo),
]);

// المواعيد والتذكيرات - Appointments & Reminders
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  appointmentDate: varchar("appointmentDate", { length: 64 }).notNull(),
  appointmentTime: varchar("appointmentTime", { length: 16 }),
  appointmentType: varchar("appointmentType", { length: 64 }),
  caseId: int("caseId"),
  caseNumber: varchar("caseNumber", { length: 128 }),
  location: varchar("location", { length: 256 }),
  employee: varchar("employee", { length: 128 }),
  employeeId: int("employeeId"),
  reminderBefore: varchar("reminderBefore", { length: 32 }).default("1h"),
  reminderSent: int("reminderSent").default(0).notNull(),
  status: mysqlEnum("appointmentStatus", ["upcoming", "completed", "cancelled"]).default("upcoming"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("appointments_employee_date_idx").on(table.employee, table.appointmentDate),
  index("appointments_employee_status_idx").on(table.employee, table.status),
  index("appointments_date_status_idx").on(table.appointmentDate, table.status),
  index("appointments_employee_id_idx").on(table.employeeId),
  index("appointments_case_id_idx").on(table.caseId),
]);

// طلبات المراجعة القانونية - Legal Review Requests
export const legalReviews = mysqlTable("legal_reviews", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  reviewDate: varchar("reviewDate", { length: 64 }).notNull(),
  location: varchar("location", { length: 256 }),
  priority: mysqlEnum("priority", ["urgent", "medium", "normal"]).default("normal"),
  description: text("description"),
  assignedTo: varchar("assignedTo", { length: 128 }),
  assignedToId: int("assignedToId"),
  status: mysqlEnum("reviewStatus", ["new", "in_review", "completed", "rejected"]).default("new"),
  reviewNotes: text("reviewNotes"),
  requestDate: varchar("requestDate", { length: 64 }),
  relatedCaseId: int("relatedCaseId"),
  attachmentUrl: text("attachmentUrl"),
  followupStatus: mysqlEnum("followupStatus", ["none", "awaiting_submission", "pending_approval", "approved", "rejected"]).default("none").notNull(),
  followupActions: text("followupActions"),
  followupRejectNote: text("followupRejectNote"),
  followupReminderSent: int("followupReminderSent").default(0).notNull(),
  followupSubmittedAt: timestamp("followupSubmittedAt"),
  followupApprovedBy: int("followupApprovedBy"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("legal_reviews_created_by_idx").on(table.createdBy),
  index("legal_reviews_assigned_to_id_idx").on(table.assignedToId),
  index("legal_reviews_status_idx").on(table.status),
]);

export const legalReviewTrail = mysqlTable("legal_review_trail", {
  id: int("id").autoincrement().primaryKey(),
  reviewId: int("reviewId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  notes: text("notes"),
  performedBy: int("performedBy"),
  performedByName: varchar("performedByName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("legal_review_trail_review_id_idx").on(table.reviewId),
]);

// إعدادات الأقسام - Section Configuration (manages all sections: built-in + custom)
export const sectionConfig = mysqlTable("section_config", {
  id: int("id").autoincrement().primaryKey(),
  sectionKey: varchar("section_key", { length: 128 }).notNull().unique(), // e.g. "cases", "compensation", "custom-xyz"
  name: varchar("name", { length: 256 }).notNull(), // Display name (can be renamed by admin)
  icon: varchar("icon", { length: 64 }).default("FileText"),
  sortOrder: int("sort_order").default(0),
  visible: int("visible").default(1), // 1=visible, 0=hidden
  isBuiltIn: int("is_built_in").default(0), // 1=built-in section, 0=custom
  columns: json("columns"), // Array of column definitions for built-in sections (extra columns)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// إعدادات التطبيق - App Settings (single row)
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 32 }),
  accentColor: varchar("accentColor", { length: 32 }),
  fontFamily: varchar("fontFamily", { length: 128 }),
  darkMode: int("darkMode").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
