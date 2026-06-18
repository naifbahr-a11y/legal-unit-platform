import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getBranchDisplayLabel, getPlatformBranches } from "@shared/branchUtils";
import { PLATFORM_GOVERNORATE } from "@shared/const";
import { computeRemainingDays } from "@shared/caseUtils";

export const DEFAULT_CASE_TYPES = ["نزاهة", "جزائية", "مدنية"];
export const CASE_STATUSES = ["قيد التحقيق", "محسومة", "محالة", "موحدة", "قيد المرافعة", "دعوى لم تقام"];

type CaseFormProps = {
  form: Record<string, unknown>;
  setForm: (f: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => void;
  caseTypes: string[];
  employees: string[];
  isAdmin?: boolean;
  currentEmployee?: string;
  duplicateWarning?: string | null;
};

export function CaseForm({
  form,
  setForm,
  caseTypes,
  employees,
  isAdmin = true,
  currentEmployee,
  duplicateWarning,
}: CaseFormProps) {
  const f = (key: string) => (form[key] as string) ?? "";
  const s = (key: string) => (val: string) => setForm((prev) => ({ ...prev, [key]: val }));

  const platformBranches = getPlatformBranches();

  const onBranchChange = (branchName: string) => {
    const branch = platformBranches.find((b) => b.name === branchName);
    setForm((prev) => ({
      ...prev,
      branch: branchName,
      province: branch?.governorate ?? PLATFORM_GOVERNORATE,
      city: branch?.address.split("/").pop()?.trim() ?? (prev.city as string) ?? "",
    }));
  };

  const onExpiryChange = (expiry: string) => {
    setForm((prev) => ({
      ...prev,
      expiry,
      remainingDays: computeRemainingDays(expiry),
    }));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <Label>نوع القضية</Label>
        <Select value={f("type")} onValueChange={s("type")}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
          <SelectContent>{caseTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>الموظف المسؤول</Label>
        {isAdmin ? (
          <Select value={f("employee")} onValueChange={s("employee")}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input value={currentEmployee ?? f("employee")} disabled className="mt-1 bg-muted" />
        )}
      </div>
      <div>
        <Label>المحافظة</Label>
        <Input value={f("province")} readOnly className="mt-1 bg-muted" placeholder="تُملأ تلقائياً من الفرع" />
      </div>
      <div>
        <Label>الفرع</Label>
        <Select value={f("branch")} onValueChange={onBranchChange}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
          <SelectContent className="max-h-72">
            {platformBranches.map((b) => (
              <SelectItem key={b.id} value={b.name}>{getBranchDisplayLabel(b)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>رقم القضية</Label>
        <Input value={f("caseNumber")} onChange={(e) => s("caseNumber")(e.target.value)} className="mt-1" dir="ltr" />
        {duplicateWarning && <p className="text-xs text-amber-600 mt-1">{duplicateWarning}</p>}
      </div>
      <div><Label>رقم التحقيق</Label><Input value={f("investigationNumber")} onChange={(e) => s("investigationNumber")(e.target.value)} className="mt-1" dir="ltr" /></div>
      <div className="sm:col-span-2"><Label>موضوع القضية</Label><Input value={f("subject")} onChange={(e) => s("subject")(e.target.value)} className="mt-1" /></div>
      <div><Label>المشتكي</Label><Input value={f("complainant")} onChange={(e) => s("complainant")(e.target.value)} className="mt-1" /></div>
      <div><Label>المتهم</Label><Input value={f("accused")} onChange={(e) => s("accused")(e.target.value)} className="mt-1" /></div>
      <div><Label>الجهة التحقيقية</Label><Input value={f("authority")} onChange={(e) => s("authority")(e.target.value)} className="mt-1" /></div>
      <div>
        <Label>حالة القضية</Label>
        <Select value={f("caseStatus")} onValueChange={s("caseStatus")}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
          <SelectContent>{CASE_STATUSES.map((s2) => <SelectItem key={s2} value={s2}>{s2}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>مبلغ الضرر</Label><Input value={f("damage")} onChange={(e) => s("damage")(e.target.value)} className="mt-1" placeholder="مثال: 1,000,000" dir="ltr" /></div>
      <div>
        <Label>نوع العملة</Label>
        <Select value={f("currency")} onValueChange={s("currency")}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="اختر العملة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="IQD">دينار عراقي</SelectItem>
            <SelectItem value="USD">دولار أمريكي</SelectItem>
            <SelectItem value="both">كلاهما</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>تاريخ الاستلام</Label><Input type="date" value={f("caseReceived")} onChange={(e) => s("caseReceived")(e.target.value)} className="mt-1" /></div>
      <div><Label>آخر متابعة</Label><Input type="date" value={f("lastFollowup")} onChange={(e) => s("lastFollowup")(e.target.value)} className="mt-1" /></div>
      <div><Label>تاريخ الانتهاء</Label><Input type="date" value={f("expiry")} onChange={(e) => onExpiryChange(e.target.value)} className="mt-1" /></div>
      <div><Label>الأيام المتبقية</Label><Input value={f("remainingDays")} readOnly className="mt-1 bg-muted" /></div>
      <div className="sm:col-span-2"><Label>آخر الإجراءات</Label><Textarea value={f("lastActions")} onChange={(e) => s("lastActions")(e.target.value)} className="mt-1" rows={2} /></div>
      <div className="sm:col-span-2"><Label>التوثيق</Label><Textarea value={f("documentation")} onChange={(e) => s("documentation")(e.target.value)} className="mt-1" rows={2} /></div>
    </div>
  );
}
