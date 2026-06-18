import { useMemo } from "react";
import GenericSection from "@/components/GenericSection";
import type { FieldDef } from "@/components/GenericSection";
import { getBranchDisplayLabel, getPlatformBranches } from "@shared/branchUtils";

const PROPERTY_TYPES = [
  { value: "أرض", label: "أرض" },
  { value: "مبنى", label: "مبنى" },
  { value: "شقة", label: "شقة" },
];

const POSSESSION_STATUSES = [
  { value: "مملوك", label: "مملوك" },
  { value: "قيد التسجيل", label: "قيد التسجيل" },
  { value: "متنازع عليه", label: "متنازع عليه" },
];

export default function BankProperties() {
  const branchOptions = useMemo(
    () => getPlatformBranches().map((b) => ({ value: b.name, label: getBranchDisplayLabel(b) })),
    [],
  );

  const fields: FieldDef[] = [
    { key: "propertyName", label: "اسم العقار", type: "text", showInTable: true },
    { key: "propertyNumber", label: "رقم العقار", type: "text", showInTable: true },
    { key: "branch", label: "فرع المصرف", type: "select", options: branchOptions, showInTable: true },
    { key: "propertyType", label: "نوع العقار", type: "select", options: PROPERTY_TYPES, showInTable: true },
    { key: "possessionStatus", label: "حالة الحيازة", type: "select", options: POSSESSION_STATUSES, showInTable: true },
    { key: "location", label: "الموقع", type: "text", showInTable: true },
    { key: "area", label: "المساحة", type: "text", showInTable: true },
    { key: "relatedCaseNumber", label: "رقم القضية المرتبطة", type: "text", showInTable: true },
    { key: "notes", label: "ملاحظات", type: "textarea", showInTable: false },
    { key: "employee", label: "الموظف المسؤول", type: "employee", adminOnly: true, showInTable: true },
  ];

  return (
    <GenericSection
      tableName="bank_properties"
      title="عقارات المصرف"
      printTitle="عقارات المصرف"
      fields={fields}
    />
  );
}
