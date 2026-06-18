import { useMemo } from "react";
import GenericSection from "@/components/GenericSection";
import type { FieldDef } from "@/components/GenericSection";
import { getBranchDisplayLabel, getPlatformBranches } from "@shared/branchUtils";

export default function ForgedChecks() {
  const branchOptions = useMemo(
    () => getPlatformBranches().map((b) => ({ value: b.name, label: getBranchDisplayLabel(b) })),
    [],
  );

  const fields: FieldDef[] = [
    { key: "entity", label: "الفرع", type: "select", options: branchOptions, showInTable: true },
    { key: "complainant", label: "المشتكي", type: "text", showInTable: true },
    { key: "notes", label: "المشكو منه", type: "text", showInTable: true },
    { key: "checkNumber", label: "رقم الصك", type: "text", showInTable: true },
    { key: "amount", label: "جهة نظر الدعوى", type: "text", showInTable: true },
    { key: "actions", label: "آخر الإجراءات", type: "textarea", showInTable: true },
    { key: "employee", label: "الموظف المسؤول", type: "employee", adminOnly: true, showInTable: true },
  ];

  return (
    <GenericSection
      tableName="forged_checks"
      title="الصكوك المزورة"
      printTitle="الصكوك المزورة"
      fields={fields}
    />
  );
}
