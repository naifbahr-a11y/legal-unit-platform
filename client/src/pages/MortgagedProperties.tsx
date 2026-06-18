import { useMemo } from "react";
import GenericSection from "@/components/GenericSection";
import type { FieldDef } from "@/components/GenericSection";
import { getBranchDisplayLabel, getPlatformBranches } from "@shared/branchUtils";

const CURRENCY_OPTIONS = [
  { value: "IQD", label: "دينار عراقي" },
  { value: "USD", label: "دولار أمريكي" },
];

const PROCEDURE_STATUSES = [
  { value: "مرهون", label: "مرهون" },
  { value: "فك رهن", label: "فك رهن" },
  { value: "قيد التنفيذ", label: "قيد التنفيذ" },
  { value: "محسوم", label: "محسوم" },
];

export default function MortgagedProperties() {
  const branchOptions = useMemo(
    () => getPlatformBranches().map((b) => ({ value: b.name, label: getBranchDisplayLabel(b) })),
    [],
  );

  const fields: FieldDef[] = [
    { key: "propertyName", label: "اسم العقار", type: "text", showInTable: true },
    { key: "propertyNumber", label: "رقم العقار", type: "text", showInTable: true },
    { key: "branch", label: "فرع المصرف", type: "select", options: branchOptions, showInTable: true },
    { key: "ownerName", label: "اسم المدين / المالك", type: "text", showInTable: true },
    { key: "mortgageAmount", label: "مبلغ الرهن", type: "text", showInTable: true },
    { key: "currency", label: "العملة", type: "select", options: CURRENCY_OPTIONS, showInTable: true },
    { key: "relatedCaseNumber", label: "رقم القضية / التحقيق", type: "text", showInTable: true },
    { key: "procedureStatus", label: "حالة الإجراء", type: "select", options: PROCEDURE_STATUSES, showInTable: true },
    { key: "mortgageDate", label: "تاريخ الرهن", type: "date", showInTable: true },
    { key: "lastFollowup", label: "آخر متابعة", type: "date", showInTable: true },
    { key: "location", label: "الموقع", type: "text", showInTable: true },
    { key: "area", label: "المساحة", type: "text", showInTable: false },
    { key: "notes", label: "ملاحظات", type: "textarea", showInTable: false },
    { key: "employee", label: "الموظف المسؤول", type: "employee", adminOnly: true, showInTable: true },
  ];

  return (
    <GenericSection
      tableName="mortgaged_properties"
      title="العقارات المرهونة"
      printTitle="العقارات المرهونة"
      fields={fields}
    />
  );
}
