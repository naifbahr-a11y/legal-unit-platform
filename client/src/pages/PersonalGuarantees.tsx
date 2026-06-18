import GenericSection from "@/components/GenericSection";
import type { FieldDef } from "@/components/GenericSection";

const fields: FieldDef[] = [
  { key: "debtorName", label: "اسم المدين", type: "text", showInTable: true },
  { key: "guarantor", label: "الكفيل", type: "text", showInTable: true },
  { key: "debtAmount", label: "مبلغ الدين", type: "text", showInTable: true },
  { key: "paymentDetails", label: "تفاصيل التسديد", type: "textarea", showInTable: true },
  { key: "lastActions", label: "آخر الإجراءات", type: "textarea", showInTable: true },
];

export default function PersonalGuarantees() {
  return (
    <GenericSection
      tableName="personal_guarantees"
      title="الكفالات الشخصية"
      printTitle="الكفالات الشخصية"
      fields={fields}
    />
  );
}
