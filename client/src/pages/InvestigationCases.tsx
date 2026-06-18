import { useMemo } from "react";
import GenericSection from "@/components/GenericSection";
import type { FieldDef } from "@/components/GenericSection";
import { getBranchDisplayLabel, getPlatformBranches } from "@shared/branchUtils";

export default function InvestigationCases() {
  const branchOptions = useMemo(
    () => getPlatformBranches().map((b) => ({ value: b.name, label: getBranchDisplayLabel(b) })),
    [],
  );

  const fields: FieldDef[] = [
    { key: "branch", label: "الفرع", type: "select", options: branchOptions, showInTable: true },
    { key: "subject", label: "الموضوع", type: "textarea", showInTable: true },
    { key: "caseNumber", label: "رقم القضية", type: "text", showInTable: true },
    { key: "receivedDate", label: "تاريخ استلام القضية", type: "text", showInTable: true },
    { key: "completionDate", label: "تاريخ إنجاز المحضر", type: "text", showInTable: true },
    { key: "referredEmployee", label: "الموظف المحال", type: "text", showInTable: true },
    { key: "damage", label: "الضرر", type: "text", showInTable: true },
    { key: "actions", label: "الإجراءات", type: "textarea", showInTable: true },
    { key: "notes", label: "الملاحظات", type: "textarea", showInTable: false },
    { key: "employee", label: "الموظف المسؤول", type: "text", adminOnly: true, showInTable: true },
  ];

  return (
    <GenericSection
      tableName="investigation_cases"
      title="اللجنة التحقيقية الخاصة بمحافظة الأنبار"
      printTitle="اللجنة التحقيقية الخاصة بمحافظة الأنبار"
      fields={fields}
    />
  );
}
