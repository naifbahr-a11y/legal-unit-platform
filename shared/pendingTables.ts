/** تسميات جداول العمليات المعلقة */
export const PENDING_TABLE_LABELS: Record<string, string> = {
  cases: "سجل القضايا",
  compensation_cases: "قضايا التضمين",
  personal_guarantees: "الكفالات الشخصية",
  investigation_cases: "اللجنة التحقيقية",
  bank_properties: "عقارات المصرف",
  mortgaged_properties: "العقارات المرهونة",
  forged_checks: "الصكوك المزورة",
  general_files: "الملفات العامة",
};

export const PENDING_OP_LABELS: Record<string, string> = {
  add: "إضافة",
  edit: "تعديل",
  delete: "حذف",
};

export const PENDING_STATUS_LABELS: Record<string, string> = {
  pending: "معلّق",
  approved: "موافق عليه",
  rejected: "مرفوض",
};
