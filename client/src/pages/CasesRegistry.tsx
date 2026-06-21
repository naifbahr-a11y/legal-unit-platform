import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Printer, ArrowRightLeft, Edit, Trash2, Settings2, X, Calendar, ChevronDown, Check, Download, Eye, Users, FileBarChart2, Building2, Shield, MoreHorizontal, Archive, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";
import { MobileDataCards } from "@/components/MobileDataCards";
import { APP_LOGO_URL } from "@/const";
import { getBranchDisplayLabel, getPlatformBranches } from "../../../shared/branchUtils";
import { escapeHtml } from "../../../shared/caseUtils";
import { IRAQ_PROVINCES } from "../../../shared/mapUtils";
import { hasFullAccess } from "@shared/userRoles";
import {
  canWriteSection,
  canViewAllCases,
  canAccessCaseReports,
  canArchiveCases,
} from "@shared/userPermissions";
import { EXPORT_ROW_LIMIT, exportLimitMessage } from "@shared/exportLimits";
import { CaseForm, DEFAULT_CASE_TYPES, CASE_STATUSES } from "@/components/cases/CaseForm";
import { brandedExcelFileName, exportBrandedExcel, mapRowsForExcel } from "@/lib/brandedExcelExport";
import { usePageActions, useRegisterPageActions } from "@/contexts/PageActionsContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DEFAULT_CASE_TYPES_LOCAL = DEFAULT_CASE_TYPES;
const CASE_STATUSES_LOCAL = CASE_STATUSES;

const ALL_COLUMNS = [
  { key: "type", label: "النوع" },
  { key: "employee", label: "الموظف" },
  { key: "caseNumber", label: "رقم القضية" },
  { key: "investigationNumber", label: "رقم التحقيق" },
  { key: "subject", label: "الموضوع" },
  { key: "complainant", label: "المشتكي" },
  { key: "accused", label: "المتهم" },
  { key: "authority", label: "الجهة" },
  { key: "damage", label: "الضرر" },
  { key: "currency", label: "العملة" },
  { key: "lastActions", label: "آخر الإجراءات" },
  { key: "caseStatus", label: "الحالة" },
  { key: "documentation", label: "التوثيق" },
  { key: "caseReceived", label: "تاريخ الاستلام" },
  { key: "lastFollowup", label: "آخر متابعة" },
  { key: "expiry", label: "الانتهاء" },
  { key: "remainingDays", label: "الأيام المتبقية" },
  { key: "province", label: "المحافظة" },
  { key: "branch", label: "الفرع" },
];
const DEFAULT_VISIBLE = ["type", "employee", "province", "branch", "caseNumber", "subject", "complainant", "accused", "authority", "damage", "caseStatus", "lastFollowup", "expiry"];
const PAGE_SIZE = 50;

function toArabicNumerals(value: string | null | undefined): string {
  if (!value) return "-";
  if (!/\d/.test(value)) return value;
  const w2a = (s: string) => s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
  const numStr = value.replace(/,/g, "");
  const num = parseFloat(numStr);
  if (!isNaN(num) && numStr.trim() === String(num)) return w2a(num.toLocaleString("ar-IQ"));
  return w2a(value);
}

function getCurrencyLabel(currency: string | null | undefined): string {
  if (!currency) return "";
  const m: Record<string, string> = { IQD: " دينار", USD: " دولار", both: " (د.ع/د.أ)" };
  return m[currency] ?? "";
}

function getDamageStatus(damage: string | null | undefined): "has_damage" | "no_damage" | "unspecified" {
  if (!damage || damage.trim() === "") return "unspecified";
  if (/\d/.test(damage)) return "has_damage";
  if (/لا\s*يوجد/i.test(damage)) return "no_damage";
  return "unspecified";
}

function DateRangeFilter({ label, fromValue, toValue, onFromChange, onToChange }: {
  label: string; fromValue: string; toValue: string;
  onFromChange: (v: string) => void; onToChange: (v: string) => void;
}) {
  const active = fromValue || toValue;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors w-full mt-1 ${active ? "bg-amber-100 border-amber-400 text-amber-800" : "bg-white/20 border-white/30 text-white/80 hover:bg-white/30"}`}>
          <Calendar className="h-3 w-3 shrink-0" />
          <span className="truncate">{active ? `${fromValue || "…"} ← ${toValue || "…"}` : "من..إلى"}</span>
          {active && <X className="h-3 w-3 shrink-0 mr-auto" onClick={(e) => { e.stopPropagation(); onFromChange(""); onToChange(""); }} />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-2" align="start">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="space-y-1"><Label className="text-xs">من</Label><Input type="date" value={fromValue} onChange={(e) => onFromChange(e.target.value)} className="h-7 text-xs" /></div>
        <div className="space-y-1"><Label className="text-xs">إلى</Label><Input type="date" value={toValue} onChange={(e) => onToChange(e.target.value)} className="h-7 text-xs" /></div>
        {active && <Button variant="ghost" size="sm" className="w-full text-xs text-red-600 h-6" onClick={() => { onFromChange(""); onToChange(""); }}>مسح</Button>}
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectFilter({
  selected, onChange, options, placeholder,
}: {
  selected: string[];
  onChange: (vals: string[]) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const hasSelection = selected.length > 0;
  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter((v) => v !== val));
    else onChange([...selected, val]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors w-full mt-1 ${
            hasSelection ? "bg-amber-100 border-amber-400 text-amber-800" : "bg-white/20 border-white/30 text-white/80 hover:bg-white/30"
          }`}
        >
          <span className="truncate flex-1 text-right">{hasSelection ? `${selected.length} محدد` : placeholder}</span>
          {hasSelection ? (
            <X className="h-3 w-3 shrink-0" onClick={(e) => { e.stopPropagation(); onChange([]); }} />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1 max-h-64 overflow-y-auto z-50" align="start">
        <div className="space-y-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm w-full text-right"
            >
              <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                selected.includes(opt.value) ? "bg-primary border-primary" : "border-border"
              }`}>
                {selected.includes(opt.value) && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CasesRegistry() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { confirm } = usePageActions();
  const isMobile = useIsMobile();
  const isPrivileged = user ? hasFullAccess(user.role) : false;
  const canWrite = user ? canWriteSection(user, "cases") : false;
  const canViewAll = user ? canViewAllCases(user) : false;
  const canReports = user ? canAccessCaseReports(user) : false;
  const canArchive = user ? canArchiveCases(user) : false;
  const { data: customCaseTypes } = trpc.customCaseTypes.list.useQuery();
  const CASE_TYPES = [...DEFAULT_CASE_TYPES_LOCAL, ...(customCaseTypes?.map((ct: any) => ct.name) || [])];
  const { data: employeeList = [] } = trpc.cases.employees.useQuery();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string[]>([]);
  const [authorityFilter, setAuthorityFilter] = useState<string[]>([]);
  const [damageFilter, setDamageFilter] = useState<string[]>([]);
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [caseReceivedFrom, setCaseReceivedFrom] = useState("");
  const [caseReceivedTo, setCaseReceivedTo] = useState("");
  const [lastFollowupFrom, setLastFollowupFrom] = useState("");
  const [lastFollowupTo, setLastFollowupTo] = useState("");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE);
  const [printColumns, setPrintColumns] = useState<string[]>(DEFAULT_VISIBLE);
  const [printColumnsOpen, setPrintColumnsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [transferItem, setTransferItem] = useState<any>(null);
  const [transferType, setTransferType] = useState("");
  const [reassignItem, setReassignItem] = useState<any>(null);
  const [reassignEmployee, setReassignEmployee] = useState("");
  const [form, setForm] = useState<any>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [damageReportOpen, setDamageReportOpen] = useState(false);
  const [bankComplainantOpen, setBankComplainantOpen] = useState(false);
  const [bankAccusedOpen, setBankAccusedOpen] = useState(false);
  const [provinceFilter, setProvinceFilter] = useState<string[]>([]);
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const province = params.get("province");
    const branch = params.get("branch");
    if (province) setProvinceFilter([province]);
    if (branch) setBranchFilter([branch]);
  }, []);

  const listFilters = {
    search: debouncedSearch || undefined,
    types: typeFilter.length > 0 ? typeFilter : undefined,
    employees: employeeFilter.length > 0 ? employeeFilter : undefined,
    authorities: authorityFilter.length > 0 ? authorityFilter : undefined,
    damageStatuses: damageFilter.length > 0 ? damageFilter : undefined,
    currencies: currencyFilter.length > 0 ? currencyFilter : undefined,
    caseStatuses: statusFilter.length > 0 ? statusFilter : undefined,
    provinces: provinceFilter.length > 0 ? provinceFilter : undefined,
    branches: branchFilter.length > 0 ? branchFilter : undefined,
    caseReceivedFrom: caseReceivedFrom || undefined,
    caseReceivedTo: caseReceivedTo || undefined,
    lastFollowupFrom: lastFollowupFrom || undefined,
    lastFollowupTo: lastFollowupTo || undefined,
    expiryFrom: expiryFrom || undefined,
    expiryTo: expiryTo || undefined,
    includeArchived: showArchived || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (provinceFilter[0]) params.set("province", provinceFilter[0]);
    if (branchFilter[0]) params.set("branch", branchFilter[0]);
    const qs = params.toString();
    const base = window.location.pathname;
    window.history.replaceState(null, "", qs ? `${base}?${qs}` : base);
  }, [provinceFilter, branchFilter]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cases_visible_columns");
      if (saved) setVisibleColumns(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("cases_visible_columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const { data: damageReportData } = trpc.cases.damageReport.useQuery(undefined, { enabled: damageReportOpen });
  const { data: bankComplainantData } = trpc.cases.bankAsComplainantReport.useQuery(undefined, { enabled: bankComplainantOpen });
  const { data: bankAccusedData } = trpc.cases.bankAsAccusedReport.useQuery(undefined, { enabled: bankAccusedOpen });

  const { data: casesResult, isLoading, isError, refetch } = trpc.cases.list.useQuery(listFilters);
  const cases = casesResult?.items ?? [];
  const totalCases = casesResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));

  const { data: duplicateCheck } = trpc.cases.checkDuplicate.useQuery(
    { caseNumber: form.caseNumber as string, excludeId: editItem?.id },
    { enabled: !!(form.caseNumber && String(form.caseNumber).trim().length >= 2) },
  );
  const duplicateWarning = duplicateCheck?.duplicate
    ? `رقم القضية مستخدم مسبقاً (قضية #${duplicateCheck.id})`
    : null;

  const caseFormProps = {
    form,
    setForm,
    caseTypes: CASE_TYPES,
    employees: employeeList.length > 0 ? employeeList : [user?.displayName ?? ""].filter(Boolean),
    isAdmin: isPrivileged,
    currentEmployee: user?.displayName ?? "",
    duplicateWarning,
  };

  const submitCreate = () => {
    if (duplicateCheck?.duplicate) {
      toast.error(duplicateWarning ?? "رقم القضية مكرر");
      return;
    }
    createCase.mutate({
      ...form,
      type: form.type || "نزاهة",
      employee: isPrivileged ? (form.employee || user?.displayName || "") : (user?.displayName || ""),
    } as any);
  };

  const { data: authorities } = trpc.cases.authorities.useQuery();

  const branchFilterOptions = getPlatformBranches().map((b) => ({
    value: b.name,
    label: getBranchDisplayLabel(b),
  }));

  const clearAllFilters = () => {
    setSearch(""); setDebouncedSearch(""); setTypeFilter([]); setEmployeeFilter([]); setAuthorityFilter([]);
    setDamageFilter([]); setCurrencyFilter([]); setStatusFilter([]);
    setProvinceFilter([]); setBranchFilter([]);
    setCaseReceivedFrom(""); setCaseReceivedTo("");
    setLastFollowupFrom(""); setLastFollowupTo("");
    setExpiryFrom(""); setExpiryTo("");
    setPage(1);
    window.history.replaceState(null, "", window.location.pathname);
  };

  const hasActiveFilters = !!(debouncedSearch || typeFilter.length || employeeFilter.length || authorityFilter.length ||
    damageFilter.length || currencyFilter.length || statusFilter.length ||
    provinceFilter.length || branchFilter.length ||
    caseReceivedFrom || caseReceivedTo || lastFollowupFrom || lastFollowupTo || expiryFrom || expiryTo);

  const createCase = trpc.cases.create.useMutation({
    onSuccess: (result) => { utils.cases.list.invalidate(); setAddOpen(false); setForm({}); toast.success(result.pending ? "تم إرسال الطلب للموافقة" : "تمت إضافة القضية بنجاح"); },
    onError: (err) => toast.error(err.message),
  });
  const updateCase = trpc.cases.update.useMutation({
    onSuccess: (result) => { utils.cases.list.invalidate(); setEditItem(null); toast.success(result.pending ? "تم إرسال التعديل للموافقة" : "تم تعديل القضية بنجاح"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteCase = trpc.cases.delete.useMutation({
    onSuccess: (result) => { utils.cases.list.invalidate(); setDeleteItem(null); toast.success(result.pending ? "تم إرسال طلب الحذف للموافقة" : "تم حذف القضية بنجاح"); },
    onError: (err) => toast.error(err.message),
  });
  const transferCase = trpc.cases.transfer.useMutation({
    onSuccess: (result) => { utils.cases.list.invalidate(); setTransferItem(null); setTransferType(""); toast.success(result.pending ? "تم إرسال طلب التحويل للموافقة" : "تم تحويل القضية بنجاح"); },
    onError: (err) => toast.error(err.message),
  });
  const archiveCase = trpc.cases.archive.useMutation({
    onSuccess: () => { utils.cases.list.invalidate(); toast.success("تمت أرشفة القضية"); },
    onError: (err) => toast.error(err.message),
  });
  const reassignCase = trpc.cases.reassign.useMutation({
    onSuccess: () => { utils.cases.list.invalidate(); setReassignItem(null); setReassignEmployee(""); toast.success("تم تدوير القضية بنجاح"); },
    onError: (err) => toast.error(err.message),
  });

  const displayColumns = ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key));

  const renderCell = (col: { key: string; label: string }, c: any) => {
    if (col.key === "type") return <Badge variant="outline" className="text-xs">{c[col.key]}</Badge>;
    if (col.key === "caseStatus") {
      const colors: Record<string, string> = {
        "قيد التحقيق": "bg-yellow-100 text-yellow-800", "محسومة": "bg-green-100 text-green-800",
        "محالة": "bg-blue-100 text-blue-800", "موحدة": "bg-purple-100 text-purple-800",
        "قيد المرافعة": "bg-orange-100 text-orange-800", "دعوى لم تقام": "bg-gray-100 text-gray-700",
      };
      return <Badge className={`text-xs ${colors[c.caseStatus] ?? "bg-gray-100 text-gray-700"}`}>{c[col.key]}</Badge>;
    }
    if (col.key === "damage") {
      const val = c.damage;
      if (!val) return <span className="text-muted-foreground text-xs">—</span>;
      const st = getDamageStatus(val);
      if (st === "has_damage") return <span className="font-medium text-red-700 text-xs">{toArabicNumerals(val)}{getCurrencyLabel(c.currency)}</span>;
      if (st === "no_damage") return <span className="text-green-700 text-xs">لا يوجد ضرر</span>;
      return <span className="text-muted-foreground text-xs">{val}</span>;
    }
    if (col.key === "currency") {
      if (!c.currency) return <span className="text-muted-foreground text-xs">—</span>;
      const labels: Record<string, string> = { IQD: "دينار عراقي", USD: "دولار أمريكي", both: "كلاهما" };
      return <span className="text-xs">{labels[c.currency] ?? c.currency}</span>;
    }
    return <span className="text-xs">{c[col.key] ?? "—"}</span>;
  };

  const handlePrint = async () => {
    try {
      const printCols = ALL_COLUMNS.filter((c) => printColumns.includes(c.key));
      let rows = cases;
      if (totalCases > cases.length) {
        const all = await utils.cases.list.fetch({ ...listFilters, page: 1, pageSize: EXPORT_ROW_LIMIT });
        rows = all.items;
      }
      const limitMsg = exportLimitMessage(totalCases, rows.length);
      if (limitMsg) toast.warning(limitMsg);
      const win = window.open("", "_blank");
      if (!win) { toast.error("تعذّر فتح نافذة الطباعة"); return; }
      const trs = rows.map((c) => `<tr>${printCols.map((col) => {
        let val = (c as any)[col.key] ?? "—";
        if (col.key === "damage" && val && /\d/.test(String(val))) val = toArabicNumerals(String(val)) + getCurrencyLabel((c as any).currency);
        return `<td>${escapeHtml(val)}</td>`;
      }).join("")}</tr>`).join("");
      win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>سجل القضايا</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
      <style>body{font-family:Cairo,sans-serif;direction:rtl;padding:20px}h2{text-align:center;color:#1a5c2a}p.sub{text-align:center;color:#666;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1a5c2a;color:white;padding:6px 8px;border:1px solid #ccc}td{padding:5px 8px;border:1px solid #ddd}tr:nth-child(even){background:#f5f5f5}</style>
      </head><body><h2>مصرف الرافدين / الوحدة القانونية</h2>
      <p class="sub">سجل القضايا — عدد السجلات: ${rows.length}</p>
      <table><thead><tr>${printCols.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table></body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 300);
    } catch {
      toast.error("فشل إنشاء تقرير الطباعة");
    }
  };

  const handleExcelExport = async () => {
    try {
      let rows = cases;
      if (totalCases > cases.length) {
        const all = await utils.cases.list.fetch({ ...listFilters, page: 1, pageSize: EXPORT_ROW_LIMIT });
        rows = all.items;
      }
      const limitMsg = exportLimitMessage(totalCases, rows.length);
      if (limitMsg) toast.warning(limitMsg);
      if (rows.length === 0) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }
      const exportCols = ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key))
        .map((c) => ({ key: c.key, label: c.label }));
      await exportBrandedExcel({
        sectionTitle: "سجل القضايا",
        sheetName: "القضايا",
        fileName: brandedExcelFileName("سجل_القضايا"),
        columns: exportCols,
        rows: mapRowsForExcel(rows, exportCols),
        filtersSummary: hasActiveFilters ? "تم تطبيق فلاتر على البيانات المعروضة" : undefined,
        exportedBy: user?.displayName ?? user?.username,
      });
      toast.success("تم تصدير الملف بنجاح");
    } catch {
      toast.error("فشل تصدير Excel");
    }
  };

  useRegisterPageActions(canWrite ? { onAdd: () => setAddOpen(true) } : {});

  return (
    <div className="space-y-3">
      <Card className="no-print">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث سريع في جميع الحقول..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 h-9" />
            </div>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearAllFilters} className="text-red-600 border-red-200 hover:bg-red-50 h-9">
                <X className="h-4 w-4 ml-1" /> مسح الفلاتر
              </Button>
            )}
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:mr-auto">
              {isMobile ? (
                <>
                  {canWrite && (
                  <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="h-9"><Plus className="h-4 w-4 ml-1" /> إضافة</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                      <DialogHeader><DialogTitle>إضافة قضية جديدة</DialogTitle></DialogHeader>
                      <CaseForm {...caseFormProps} />
                      <Button onClick={submitCreate} disabled={createCase.isPending} className="w-full mt-2">
                        {createCase.isPending ? "جاري الحفظ..." : "حفظ القضية"}
                      </Button>
                    </DialogContent>
                  </Dialog>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => setPrintColumnsOpen(true)}><Printer className="h-4 w-4 ml-2" /> طباعة</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExcelExport()}><Download className="h-4 w-4 ml-2" /> تصدير Excel</DropdownMenuItem>
                      {canReports && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDamageReportOpen(true)}><FileBarChart2 className="h-4 w-4 ml-2" /> تقرير الضرر</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setBankComplainantOpen(true)}><Building2 className="h-4 w-4 ml-2" /> المصرف مشتكياً</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setBankAccusedOpen(true)}><Shield className="h-4 w-4 ml-2" /> المصرف مشكواً منه</DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9"><Settings2 className="h-4 w-4 ml-1" /> الأعمدة</Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                  <p className="text-sm font-medium mb-2">الأعمدة المرئية</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_COLUMNS.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox checked={visibleColumns.includes(col.key)} onCheckedChange={(checked) => setVisibleColumns((prev) => checked ? [...prev, col.key] : prev.filter((k) => k !== col.key))} />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Dialog open={printColumnsOpen} onOpenChange={setPrintColumnsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9"><Printer className="h-4 w-4 ml-1" /> طباعة</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>اختر أعمدة الطباعة</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3 py-4">
                    {ALL_COLUMNS.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={printColumns.includes(col.key)} onCheckedChange={(checked) => setPrintColumns((prev) => checked ? [...prev, col.key] : prev.filter((k) => k !== col.key))} />
                        <span className="text-sm">{col.label}</span>
                      </label>
                    ))}
                  </div>
                  <Button onClick={() => { setPrintColumnsOpen(false); handlePrint(); }} className="w-full"><Printer className="h-4 w-4 ml-2" /> طباعة التقرير</Button>
                </DialogContent>
              </Dialog>
              <Button variant="outline" size="sm" className="h-9" onClick={() => handleExcelExport()}><Download className="h-4 w-4 ml-1" /> تصدير Excel</Button>
              {canReports && (
                <>
              <Button variant="outline" size="sm" className="h-9 border-red-300 text-red-700 hover:bg-red-50" onClick={() => setDamageReportOpen(true)}><FileBarChart2 className="h-4 w-4 ml-1" /> تقرير الضرر</Button>
              <Button variant="outline" size="sm" className="h-9 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setBankComplainantOpen(true)}><Building2 className="h-4 w-4 ml-1" /> المصرف مشتكياً</Button>
              <Button variant="outline" size="sm" className="h-9 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setBankAccusedOpen(true)}><Shield className="h-4 w-4 ml-1" /> المصرف مشكواً منه</Button>
                </>
              )}
              {canWrite && selectedIds.length > 0 && (
                <Button variant="destructive" size="sm" className="h-9" onClick={async () => {
                  const ok = await confirm({
                    title: "حذف جماعي",
                    description: `هل أنت متأكد من حذف ${selectedIds.length} قضية؟ لا يمكن التراجع.`,
                    destructive: true,
                    confirmLabel: "حذف",
                  });
                  if (ok) {
                    selectedIds.forEach(id => deleteCase.mutate({ id }));
                    setSelectedIds([]);
                  }
                }}>
                  <Trash2 className="h-4 w-4 ml-1" /> حذف المحدد ({selectedIds.length})
                </Button>
              )}
              {canWrite && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-9"><Plus className="h-4 w-4 ml-1" /> إضافة قضية</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>إضافة قضية جديدة</DialogTitle></DialogHeader>
                  <CaseForm {...caseFormProps} />
                  <Button onClick={submitCreate} disabled={createCase.isPending} className="w-full mt-2">
                    {createCase.isPending ? "جاري الحفظ..." : "حفظ القضية"}
                  </Button>
                </DialogContent>
              </Dialog>
              )}
                </>
              )}
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-2 flex flex-wrap gap-1">
              {search && <Badge variant="secondary" className="text-xs">بحث: {search}</Badge>}
              {typeFilter.length > 0 && <Badge variant="secondary" className="text-xs">النوع: {typeFilter.join("، ")}</Badge>}
              {employeeFilter.length > 0 && <Badge variant="secondary" className="text-xs">الموظف: {employeeFilter.join("، ")}</Badge>}
              {authorityFilter.length > 0 && <Badge variant="secondary" className="text-xs">الجهة: {authorityFilter.length > 2 ? `${authorityFilter.length} جهات` : authorityFilter.join("، ")}</Badge>}
              {damageFilter.length > 0 && <Badge variant="secondary" className="text-xs">الضرر: {damageFilter.map((d) => d === "has_damage" ? "فيها ضرر" : d === "no_damage" ? "بدون ضرر" : "لم يحدد").join("، ")}</Badge>}
              {currencyFilter.length > 0 && <Badge variant="secondary" className="text-xs">العملة: {currencyFilter.map((c) => c === "IQD" ? "دينار" : c === "USD" ? "دولار" : "كلاهما").join("، ")}</Badge>}
              {statusFilter.length > 0 && <Badge variant="secondary" className="text-xs">الحالة: {statusFilter.join("، ")}</Badge>}
              {(caseReceivedFrom || caseReceivedTo) && <Badge variant="secondary" className="text-xs">الاستلام: {caseReceivedFrom || "…"} ← {caseReceivedTo || "…"}</Badge>}
              {(lastFollowupFrom || lastFollowupTo) && <Badge variant="secondary" className="text-xs">المتابعة: {lastFollowupFrom || "…"} ← {lastFollowupTo || "…"}</Badge>}
              {(expiryFrom || expiryTo) && <Badge variant="secondary" className="text-xs">الانتهاء: {expiryFrom || "…"} ← {expiryTo || "…"}</Badge>}
              {provinceFilter.length > 0 && <Badge variant="secondary" className="text-xs">محافظة: {provinceFilter.join("، ")}</Badge>}
              {branchFilter.length > 0 && <Badge variant="secondary" className="text-xs">فرع: {branchFilter.join("، ")}</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between px-1 no-print flex-wrap gap-2">
        <span className="text-sm text-muted-foreground">
          {isLoading ? "جاري التحميل..." : `${totalCases.toLocaleString()} قضية — صفحة ${page} من ${totalPages}`}
        </span>
        {isPrivileged && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={showArchived} onCheckedChange={(c) => { setShowArchived(!!c); setPage(1); }} />
          عرض المؤرشفة
        </label>
        )}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-red-700">تعذّر تحميل سجل القضايا. تحقق من الاتصال وحاول مجدداً.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      <MobileDataCards
        records={(cases ?? []) as Record<string, unknown>[]}
        titleKey="subject"
        subtitleKey="caseNumber"
        fields={[
          { key: "type", label: "النوع", render: (v) => <Badge variant="outline" className="text-xs">{String(v)}</Badge> },
          { key: "employee", label: "الموظف" },
          { key: "caseStatus", label: "الحالة", render: (v) => <Badge className="text-xs">{String(v ?? "—")}</Badge> },
          { key: "expiry", label: "الانتهاء" },
        ]}
        isLoading={isLoading}
        selectedIds={selectedIds}
        onToggleSelect={(id, checked) => {
          if (checked) setSelectedIds([...selectedIds, id]);
          else setSelectedIds(selectedIds.filter((x) => x !== id));
        }}
        onView={(c) => navigate(`/cases/${c.id}`)}
        onClick={(c) => navigate(`/cases/${c.id}`)}
        onEdit={canWrite ? (c) => { setEditItem(c); setForm({ ...c }); } : undefined}
        onDelete={canWrite ? (c) => setDeleteItem(c) : undefined}
      />

      <div className="hidden md:block">
      <ScrollSyncTable>
      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm min-w-[1200px]">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="px-3 py-2 text-center w-10">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-white"
                  checked={(cases ?? []).length > 0 && selectedIds.length === (cases ?? []).length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds((cases ?? []).map((c: any) => c.id));
                    } else {
                      setSelectedIds([]);
                    }
                  }}
                />
              </th>
              {displayColumns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-right font-semibold whitespace-nowrap min-w-[110px] align-top">
                  <div className="text-sm font-semibold">{col.label}</div>
                  {col.key === "type" && <MultiSelectFilter selected={typeFilter} onChange={setTypeFilter} options={CASE_TYPES.map((t) => ({ value: t, label: t }))} placeholder="الكل" />}
                  {col.key === "employee" && canViewAll && <MultiSelectFilter selected={employeeFilter} onChange={(v) => { setEmployeeFilter(v); setPage(1); }} options={employeeList.map((e) => ({ value: e, label: e }))} placeholder="الكل" />}
                  {col.key === "authority" && <MultiSelectFilter selected={authorityFilter} onChange={setAuthorityFilter} options={(authorities ?? []).map((a) => ({ value: a, label: a }))} placeholder="الكل" />}
                  {col.key === "damage" && <MultiSelectFilter selected={damageFilter} onChange={setDamageFilter} options={[{ value: "has_damage", label: "فيها ضرر" }, { value: "no_damage", label: "بدون ضرر" }, { value: "unspecified", label: "لم يحدد" }]} placeholder="الكل" />}
                  {col.key === "currency" && <MultiSelectFilter selected={currencyFilter} onChange={setCurrencyFilter} options={[{ value: "IQD", label: "دينار عراقي" }, { value: "USD", label: "دولار أمريكي" }, { value: "both", label: "كلاهما" }]} placeholder="الكل" />}
                  {col.key === "caseStatus" && <MultiSelectFilter selected={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={CASE_STATUSES_LOCAL.map((s) => ({ value: s, label: s }))} placeholder="الكل" />}
                  {col.key === "province" && <MultiSelectFilter selected={provinceFilter} onChange={(v) => { setProvinceFilter(v); setPage(1); }} options={IRAQ_PROVINCES.map((p) => ({ value: p, label: p }))} placeholder="الكل" />}
                  {col.key === "branch" && <MultiSelectFilter selected={branchFilter} onChange={(v) => { setBranchFilter(v); setPage(1); }} options={branchFilterOptions} placeholder="الكل" />}
                  {col.key === "caseReceived" && <DateRangeFilter label="تاريخ الاستلام" fromValue={caseReceivedFrom} toValue={caseReceivedTo} onFromChange={setCaseReceivedFrom} onToChange={setCaseReceivedTo} />}
                  {col.key === "lastFollowup" && <DateRangeFilter label="آخر متابعة" fromValue={lastFollowupFrom} toValue={lastFollowupTo} onFromChange={setLastFollowupFrom} onToChange={setLastFollowupTo} />}
                  {col.key === "expiry" && <DateRangeFilter label="تاريخ الانتهاء" fromValue={expiryFrom} toValue={expiryTo} onFromChange={setExpiryFrom} onToChange={setExpiryTo} />}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold no-print align-top">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={displayColumns.length + 2} className="text-center py-12 text-muted-foreground">جاري التحميل...</td></tr>
            ) : isError ? (
              <tr><td colSpan={displayColumns.length + 2} className="text-center py-12 text-red-600">فشل تحميل البيانات — <button type="button" className="underline" onClick={() => refetch()}>إعادة المحاولة</button></td></tr>
            ) : (cases ?? []).length === 0 ? (
              <tr><td colSpan={displayColumns.length + 2} className="text-center py-12 text-muted-foreground">لا توجد قضايا مطابقة للفلاتر المحددة</td></tr>
            ) : (
              (cases ?? []).map((c: any, idx: number) => {
                // Check if case is expired (30+ days without follow-up)
                const lastDate = c.lastFollowup || c.updatedAt || c.createdAt;
                const daysSinceUpdate = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;
                const isExpired = daysSinceUpdate >= 30;
                const rowBg = isExpired
                  ? "bg-red-50 hover:bg-red-100/70 border-r-4 border-r-red-500"
                  : idx % 2 === 0 ? "bg-white hover:bg-green-50/30" : "bg-gray-50/60 hover:bg-green-50/30";
                return (
                <tr key={c.id} className={rowBg} title={isExpired ? `منتهية الصلاحية - ${daysSinceUpdate} يوم بدون متابعة` : undefined}>
                  <td className="px-3 py-2 border-b border-gray-100 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={selectedIds.includes(c.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds([...selectedIds, c.id]);
                        } else {
                          setSelectedIds(selectedIds.filter(id => id !== c.id));
                        }
                      }}
                    />
                  </td>
                  {displayColumns.map((col) => (
                    <td key={col.key} className="px-3 py-2 border-b border-gray-100 max-w-[200px]">
                      <div className="truncate">{renderCell(col, c)}</div>
                    </td>
                  ))}
                  <td className="px-3 py-2 border-b border-gray-100 no-print">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:text-green-800" onClick={() => navigate(`/cases/${c.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
                      {canWrite && (
                        <>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800" onClick={() => { setEditItem(c); setForm({ ...c }); }}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-600 hover:text-amber-800" onClick={() => { setTransferItem(c); setTransferType(c.type); }}><ArrowRightLeft className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-800" onClick={() => setDeleteItem(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                      {isPrivileged && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-purple-600 hover:text-purple-800" title="تدوير لموظف آخر" onClick={() => { setReassignItem(c); setReassignEmployee(""); }}><Users className="h-3.5 w-3.5" /></Button>}
                      {canArchive && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-600 hover:text-gray-800" title="أرشفة" onClick={async () => {
                          const ok = await confirm({
                            title: "أرشفة القضية",
                            description: `هل تريد أرشفة القضية رقم ${c.caseNumber || c.id}؟`,
                            confirmLabel: "أرشفة",
                            destructive: true,
                          });
                          if (ok) archiveCase.mutate({ id: c.id });
                        }}><Archive className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </ScrollSyncTable>
      </div>

      {/* Print watermark */}
      <img src={APP_LOGO_URL} alt="" className="print-watermark" />

      {editItem && (
        <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>تعديل القضية</DialogTitle></DialogHeader>
            <CaseForm {...caseFormProps} />
            <Button onClick={() => {
              if (duplicateCheck?.duplicate) { toast.error(duplicateWarning ?? "رقم القضية مكرر"); return; }
              const { id, createdAt, updatedAt, createdBy, ...data } = form;
              updateCase.mutate({ id: editItem.id, data });
            }} disabled={updateCase.isPending} className="w-full mt-2">
              {updateCase.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {deleteItem && (
        <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">هل تريد حذف القضية: <strong>{deleteItem.subject || deleteItem.caseNumber}</strong>؟</p>
            <div className="flex gap-2 mt-4">
              <Button variant="destructive" onClick={() => deleteCase.mutate({ id: deleteItem.id })} disabled={deleteCase.isPending} className="flex-1">{deleteCase.isPending ? "جاري الحذف..." : "حذف"}</Button>
              <Button variant="outline" onClick={() => setDeleteItem(null)} className="flex-1">إلغاء</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {transferItem && (
        <Dialog open={!!transferItem} onOpenChange={() => setTransferItem(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>تحويل نوع القضية</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground mb-3">القضية الحالية: <Badge variant="outline">{transferItem.type}</Badge></p>
            <Label>النوع الجديد</Label>
            <Select value={transferType} onValueChange={setTransferType}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر النوع الجديد" /></SelectTrigger>
              <SelectContent>{CASE_TYPES.filter((t) => t !== transferItem.type).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => transferCase.mutate({ id: transferItem.id, newType: transferType })} disabled={!transferType || transferCase.isPending} className="w-full mt-3">
              {transferCase.isPending ? "جاري التحويل..." : "تأكيد التحويل"}
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Reassign dialog - admin only */}
      {reassignItem && (
        <Dialog open={!!reassignItem} onOpenChange={() => setReassignItem(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>تدوير القضية لموظف آخر</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground mb-3">الموظف الحالي: <Badge variant="outline">{reassignItem.employee}</Badge></p>
            <Label>الموظف الجديد</Label>
            <Select value={reassignEmployee} onValueChange={setReassignEmployee}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>{employeeList.filter((e) => e !== reassignItem.employee).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => reassignCase.mutate({ id: reassignItem.id, newEmployee: reassignEmployee })} disabled={!reassignEmployee || reassignCase.isPending} className="w-full mt-3 bg-purple-600 hover:bg-purple-700">
              {reassignCase.isPending ? "جاري التدوير..." : "تأكيد التدوير"}
            </Button>
          </DialogContent>
        </Dialog>
      )}
      {/* ─── تقرير القضايا ذات الضرر ─── */}
      <Dialog open={damageReportOpen} onOpenChange={setDamageReportOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 text-red-700">
              <span className="flex items-center gap-2"><FileBarChart2 className="h-5 w-5" />تقرير القضايا ذات الضرر المالي</span>
              <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 ml-1" />طباعة</Button>
            </DialogTitle>
          </DialogHeader>
          {!damageReportData ? (
            <div className="py-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : (
            <>
              <div className="flex gap-4 mb-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex-1 text-center">
                  <p className="text-xs text-muted-foreground mb-1">عدد القضايا</p>
                  <p className="text-2xl font-bold text-red-700">{damageReportData.cases.length}</p>
                </div>
                {damageReportData.totalIQD > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex-1 text-center">
                    <p className="text-xs text-muted-foreground mb-1">مجموع الضرر (دينار)</p>
                    <p className="text-lg font-bold text-orange-700">{damageReportData.totalIQD.toLocaleString('ar-IQ')} د.ع</p>
                  </div>
                )}
                {damageReportData.totalUSD > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex-1 text-center">
                    <p className="text-xs text-muted-foreground mb-1">مجموع الضرر (دولار)</p>
                    <p className="text-lg font-bold text-yellow-700">{damageReportData.totalUSD.toLocaleString('en-US')} $</p>
                  </div>
                )}
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-700 text-white">
                      <th className="px-3 py-2 text-right">#</th>
                      <th className="px-3 py-2 text-right">رقم القضية</th>
                      <th className="px-3 py-2 text-right">الموضوع</th>
                      <th className="px-3 py-2 text-right">المشتكي</th>
                      <th className="px-3 py-2 text-right">المتهم</th>
                      <th className="px-3 py-2 text-right">الضرر</th>
                      <th className="px-3 py-2 text-right">العملة</th>
                      <th className="px-3 py-2 text-right">الحالة</th>
                      <th className="px-3 py-2 text-right">الموظف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {damageReportData.cases.map((c: any, i: number) => (
                      <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-red-50"}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{c.caseNumber || '—'}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{c.subject || '—'}</td>
                        <td className="px-3 py-2">{c.complainant || '—'}</td>
                        <td className="px-3 py-2">{c.accused || '—'}</td>
                        <td className="px-3 py-2 font-medium text-red-700">{toArabicNumerals(c.damage)}</td>
                        <td className="px-3 py-2">{c.currency === 'IQD' ? 'دينار' : c.currency === 'USD' ? 'دولار' : c.currency || '—'}</td>
                        <td className="px-3 py-2"><Badge className="text-xs">{c.caseStatus || '—'}</Badge></td>
                        <td className="px-3 py-2">{c.employee || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-100 font-bold border-t-2 border-red-300">
                      <td colSpan={5} className="px-3 py-2 text-right text-red-800">المجموع الكلي للضرر:</td>
                      <td className="px-3 py-2 text-red-800" colSpan={4}>
                        {damageReportData.totalIQD > 0 && <span>{damageReportData.totalIQD.toLocaleString('ar-IQ')} دينار عراقي</span>}
                        {damageReportData.totalIQD > 0 && damageReportData.totalUSD > 0 && <span className="mx-2">+</span>}
                        {damageReportData.totalUSD > 0 && <span>{damageReportData.totalUSD.toLocaleString('en-US')} دولار أمريكي</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── تقرير القضايا المقامة من المصرف ضد الغير ─── */}
      <Dialog open={bankComplainantOpen} onOpenChange={setBankComplainantOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 text-blue-700">
              <span className="flex items-center gap-2"><Building2 className="h-5 w-5" />القضايا المقامة من المصرف ضد الغير</span>
              <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 ml-1" />طباعة</Button>
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">القضايا التي يكون فيها المصرف (مصرف الرافدين) هو المشتكي ضد أشخاص أو جهات أخرى.</p>
          {!bankComplainantData ? (
            <div className="py-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">إجمالي القضايا</p>
                <p className="text-3xl font-bold text-blue-700">{bankComplainantData.length}</p>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-blue-700 text-white">
                      <th className="px-3 py-2 text-right">#</th>
                      <th className="px-3 py-2 text-right">رقم القضية</th>
                      <th className="px-3 py-2 text-right">الموضوع</th>
                      <th className="px-3 py-2 text-right">المشتكي (المصرف)</th>
                      <th className="px-3 py-2 text-right">المشكو منه</th>
                      <th className="px-3 py-2 text-right">الجهة</th>
                      <th className="px-3 py-2 text-right">الضرر</th>
                      <th className="px-3 py-2 text-right">الحالة</th>
                      <th className="px-3 py-2 text-right">الموظف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankComplainantData.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">لا توجد قضايا مطابقة</td></tr>
                    ) : bankComplainantData.map((c: any, i: number) => (
                      <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-blue-50"}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{c.caseNumber || '—'}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate">{c.subject || '—'}</td>
                        <td className="px-3 py-2 text-blue-700 font-medium">{c.complainant || '—'}</td>
                        <td className="px-3 py-2">{c.accused || '—'}</td>
                        <td className="px-3 py-2">{c.authority || '—'}</td>
                        <td className="px-3 py-2">{c.damage ? toArabicNumerals(c.damage) + getCurrencyLabel(c.currency) : '—'}</td>
                        <td className="px-3 py-2"><Badge className="text-xs">{c.caseStatus || '—'}</Badge></td>
                        <td className="px-3 py-2">{c.employee || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── تقرير القضايا المقامة من الغير ضد المصرف ─── */}
      <Dialog open={bankAccusedOpen} onOpenChange={setBankAccusedOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 text-amber-700">
              <span className="flex items-center gap-2"><Shield className="h-5 w-5" />القضايا المقامة من الغير ضد المصرف</span>
              <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 ml-1" />طباعة</Button>
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">القضايا التي يكون فيها المصرف (مصرف الرافدين) هو المشكو منه من قِبل أشخاص أو جهات أخرى.</p>
          {!bankAccusedData ? (
            <div className="py-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">إجمالي القضايا</p>
                <p className="text-3xl font-bold text-amber-700">{bankAccusedData.length}</p>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-amber-600 text-white">
                      <th className="px-3 py-2 text-right">#</th>
                      <th className="px-3 py-2 text-right">رقم القضية</th>
                      <th className="px-3 py-2 text-right">الموضوع</th>
                      <th className="px-3 py-2 text-right">المشتكي</th>
                      <th className="px-3 py-2 text-right">المشكو منه (المصرف)</th>
                      <th className="px-3 py-2 text-right">الجهة</th>
                      <th className="px-3 py-2 text-right">الضرر</th>
                      <th className="px-3 py-2 text-right">الحالة</th>
                      <th className="px-3 py-2 text-right">الموظف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankAccusedData.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">لا توجد قضايا مطابقة</td></tr>
                    ) : bankAccusedData.map((c: any, i: number) => (
                      <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-amber-50"}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{c.caseNumber || '—'}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate">{c.subject || '—'}</td>
                        <td className="px-3 py-2">{c.complainant || '—'}</td>
                        <td className="px-3 py-2 text-amber-700 font-medium">{c.accused || '—'}</td>
                        <td className="px-3 py-2">{c.authority || '—'}</td>
                        <td className="px-3 py-2">{c.damage ? toArabicNumerals(c.damage) + getCurrencyLabel(c.currency) : '—'}</td>
                        <td className="px-3 py-2"><Badge className="text-xs">{c.caseStatus || '—'}</Badge></td>
                        <td className="px-3 py-2">{c.employee || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={printColumnsOpen} onOpenChange={setPrintColumnsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>اختر أعمدة الطباعة</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {ALL_COLUMNS.map((col) => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={printColumns.includes(col.key)} onCheckedChange={(checked) => setPrintColumns((prev) => checked ? [...prev, col.key] : prev.filter((k) => k !== col.key))} />
                <span className="text-sm">{col.label}</span>
              </label>
            ))}
          </div>
          <Button onClick={() => { setPrintColumnsOpen(false); handlePrint(); }} className="w-full"><Printer className="h-4 w-4 ml-2" /> طباعة التقرير</Button>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function ScrollSyncTable({ children }: { children: React.ReactNode }) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    if (bottomScrollRef.current) {
      setScrollWidth(bottomScrollRef.current.scrollWidth);
    }
  }, [children]);

  const handleTopScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  return (
    <div>
      <div ref={topScrollRef} className="table-scroll-top" onScroll={handleTopScroll}>
        <div style={{ width: scrollWidth }} />
      </div>
      <div ref={bottomScrollRef} className="table-scroll-container" onScroll={handleBottomScroll}>
        {children}
      </div>
    </div>
  );
}
