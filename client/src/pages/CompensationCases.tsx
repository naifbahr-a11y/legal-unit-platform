import GenericSection from "@/components/GenericSection";
import type { FieldDef } from "@/components/GenericSection";

const fields: FieldDef[] = [
  { key: "ministerialOrder", label: "الأمر الوزاري بالتضمين", type: "text", showInTable: true },
  { key: "administrativeOrder", label: "الأمر الإداري بالتضمين", type: "text", showInTable: true },
  { key: "investigativeCase", label: "القضية التحقيقية", type: "text", showInTable: true },
  { key: "caseTitle", label: "عنوان القضية", type: "text", showInTable: true },
  { key: "guarantorName", label: "اسم المضمن", type: "text", showInTable: true },
  { key: "compensationAmount", label: "مبلغ التضمين", type: "text", showInTable: true },
  { key: "paymentDetails", label: "تفاصيل التسديد", type: "textarea", showInTable: false },
  { key: "lastActions", label: "آخر الإجراءات", type: "textarea", showInTable: true },
];

export default function CompensationCases() {
  return (
    <GenericSection
      tableName="compensation_cases"
      title="قضايا التضمين"
      printTitle="قضايا التضمين"
      fields={fields}
    />
  );
}
