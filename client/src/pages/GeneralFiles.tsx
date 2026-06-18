import GenericSection from "@/components/GenericSection";
import type { FieldDef } from "@/components/GenericSection";

const FILE_CATEGORIES = [
  { value: "قضية لم تقام", label: "قضية لم تقام" },
  { value: "قيد المتابعة", label: "قيد المتابعة" },
  { value: "موضوع بدون قضية", label: "موضوع بدون قضية" },
  { value: "ملف متنوع", label: "ملف متنوع" },
];

const FILE_STATUSES = [
  { value: "جديد", label: "جديد" },
  { value: "قيد المتابعة", label: "قيد المتابعة" },
  { value: "منتهي", label: "منتهي" },
  { value: "معلق", label: "معلق" },
  { value: "محفوظ", label: "محفوظ" },
];

const fields: FieldDef[] = [
  { key: "fileTitle", label: "عنوان الملف", type: "text", showInTable: true },
  { key: "fileCategory", label: "نوع الملف", type: "select", options: FILE_CATEGORIES, showInTable: true },
  { key: "subject", label: "الموضوع", type: "text", showInTable: true },
  { key: "fileStatus", label: "الحالة", type: "select", options: FILE_STATUSES, showInTable: true },
  { key: "relatedCaseNumber", label: "رقم القضية (إن وجد)", type: "text", showInTable: true },
  { key: "relatedInvestigationNumber", label: "رقم التحقيق (إن وجد)", type: "text", showInTable: false },
  { key: "receivedDate", label: "تاريخ الورود", type: "date", showInTable: true },
  { key: "lastFollowup", label: "آخر متابعة", type: "date", showInTable: true },
  { key: "lastActions", label: "آخر الإجراءات", type: "textarea", showInTable: true },
  { key: "notes", label: "ملاحظات", type: "textarea", showInTable: false },
  { key: "employee", label: "الموظف المسؤول", type: "employee", adminOnly: true, showInTable: true },
];

export default function GeneralFiles() {
  return (
    <GenericSection
      tableName="general_files"
      title="الملفات العامة"
      printTitle="الملفات العامة — قضايا لم تقام ومتابعات ومواضيع متنوعة"
      fields={fields}
    />
  );
}
