import { useState, useMemo, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasFullAccess } from "@shared/userRoles";
import { canWriteSection, canAccessSection } from "@shared/userPermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Send, Search, Plus, Trash2, Archive, Paperclip, Inbox, Clock, AlertTriangle, CheckCircle, Users, BarChart3, FileWarning, Calendar, Link2, Timer, Edit, MapPin, Reply, X, Settings2, Building2, Download } from "lucide-react";
import { toast } from "sonner";
import { brandedExcelFileName, exportBrandedExcel } from "@/lib/brandedExcelExport";
import { MobileDataCards } from "@/components/MobileDataCards";
import { PageToolbar } from "@/components/PageToolbar";
import { usePageActions, useRegisterPageActions } from "@/contexts/PageActionsContext";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  completed: { label: "تم الإنجاز", color: "bg-green-100 text-green-800 border-green-300", icon: CheckCircle },
  processing: { label: "قيد المعالجة", color: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: Clock },
  delayed: { label: "متأخر", color: "bg-red-100 text-red-800 border-red-300", icon: AlertTriangle },
  direct: { label: "مباشر", color: "bg-orange-100 text-orange-800 border-orange-300", icon: Send },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  very_urgent: { label: "عاجل جداً", color: "bg-red-600 text-white" },
  urgent: { label: "عاجل", color: "bg-orange-500 text-white" },
  normal: { label: "عادي", color: "bg-green-500 text-white" },
  fyi: { label: "للعلم", color: "bg-gray-400 text-white" },
};

const TRAIL_ACTIONS: Record<string, { label: string; color: string }> = {
  received: { label: "تم الاستلام", color: "bg-blue-500" },
  forwarded: { label: "تمت الإحالة", color: "bg-purple-500" },
  executed: { label: "تم التنفيذ", color: "bg-green-500" },
  archived: { label: "تمت الأرشفة", color: "bg-gray-500" },
  returned: { label: "تم الإرجاع", color: "bg-orange-500" },
  noted: { label: "تم الاطلاع", color: "bg-cyan-500" },
};

function getDaysUntilDeadline(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const target = new Date(deadline + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDeadlineCountdown(deadline: string | null | undefined, completed?: boolean): string {
  if (completed) return "—";
  const days = getDaysUntilDeadline(deadline);
  if (days === null) return "—";
  if (days < 0) return `متأخر ${Math.abs(days)} يوم`;
  if (days === 0) return "اليوم";
  return `باقي ${days} يوم`;
}

function deadlineColor(deadline: string | null | undefined, completed?: boolean): string {
  const days = getDaysUntilDeadline(deadline);
  if (completed || days === null) return "text-muted-foreground";
  if (days < 0) return "text-red-600";
  if (days <= 2) return "text-orange-600";
  if (days <= 7) return "text-yellow-600";
  return "text-green-600";
}

export default function Correspondence() {
  const { user } = useAuth();
  const { confirm } = usePageActions();
  const [activeTab, setActiveTab] = useState<"inbox" | "outbox">("inbox");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showTrail, setShowTrail] = useState<any>(null);
  const [showAssign, setShowAssign] = useState<any>(null);
  const [showReports, setShowReports] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [assignTask, setAssignTask] = useState("");
  const [trailAction, setTrailAction] = useState("received");
  const [trailTo, setTrailTo] = useState("");
  const [trailNotes, setTrailNotes] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [relatedCaseNumber, setRelatedCaseNumber] = useState("");
  const [caseSearch, setCaseSearch] = useState("");
  const checkDeadlineAlerts = trpc.notifications.checkDeadlineAlerts.useMutation();

  const isPrivileged = user ? hasFullAccess(user.role) : false;
  const canWrite = user ? canWriteSection(user, "correspondence") : false;
  const canLinkCases = user ? canAccessSection(user, "cases") : false;

  const highlightId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    return id ? Number(id) : null;
  }, []);

  const [form, setForm] = useState({
    bookNumber: "", subject: "", senderEntity: "", receiverEntity: "",
    correspondenceDate: "", receivedDate: "", employee: "", employeeId: "",
    status: "direct",
    priority: "normal", deadline: "", parentId: 0, notes: "",
    relatedCaseId: 0, relatedCaseNumber: "", mandobOutNumber: "", legalOutNumber: "",
  });
  const [numberingApproved, setNumberingApproved] = useState("");
  const [showNumbering, setShowNumbering] = useState(false);
  const [showEntities, setShowEntities] = useState(false);
  const [entitySearch, setEntitySearch] = useState("");
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityKind, setNewEntityKind] = useState<"sender" | "receiver" | "both">("both");
  const [newEntityCategory, setNewEntityCategory] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const utils = trpc.useUtils();
  const { data: listResult, isLoading, isError, refetch } = trpc.correspondence.list.useQuery({
    type: activeTab, search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined, archived: showArchived,
    page, pageSize: PAGE_SIZE,
  });
  const items = listResult?.items ?? [];
  const totalItems = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const { data: stats } = trpc.correspondence.stats.useQuery();
  const { data: dailyReport } = trpc.correspondence.dailyReport.useQuery(
    { date: reportDate },
    { enabled: isPrivileged && showReports },
  );
  const { data: overdueItems = [] } = trpc.correspondence.overdueReport.useQuery(undefined, { enabled: showOverdue });
  const { data: performanceData = [] } = trpc.correspondence.performanceStats.useQuery(undefined, { enabled: showPerformance && isPrivileged });
  const { data: linkableCases = [] } = trpc.correspondence.linkableCases.useQuery(
    { search: caseSearch.trim() || undefined },
    { enabled: showForm && canLinkCases },
  );
  const { data: allUsers = [] } = trpc.users.list.useQuery(undefined, { enabled: isPrivileged });
  const { data: outboxNumbering } = trpc.correspondence.outboxNumbering.get.useQuery(undefined, { enabled: isPrivileged });
  const updateNumberingMut = trpc.correspondence.outboxNumbering.update.useMutation({
    onSuccess: () => { utils.correspondence.outboxNumbering.invalidate(); toast.success("تم تحديث العداد"); setShowNumbering(false); },
    onError: (e) => toast.error(e.message),
  });
  const entityField = (showForm && editItem?.type === "outbox") || (showForm && !editItem && activeTab === "outbox")
    ? "receiver" as const
    : "sender" as const;
  const entityInputValue = entityField === "sender" ? form.senderEntity : form.receiverEntity;
  const { data: entitySuggestions = [] } = trpc.correspondence.entities.suggest.useQuery(
    { field: entityField, search: entityInputValue.trim() || undefined },
    { enabled: showForm },
  );
  const { data: entityDirectory = [], refetch: refetchEntities } = trpc.correspondence.entities.list.useQuery(
    { search: entitySearch.trim() || undefined },
    { enabled: showEntities },
  );
  const createEntityMut = trpc.correspondence.entities.create.useMutation({
    onSuccess: () => {
      refetchEntities();
      utils.correspondence.entities.invalidate();
      toast.success("تمت إضافة الجهة للدليل");
      setNewEntityName("");
      setNewEntityCategory("");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteEntityMut = trpc.correspondence.entities.delete.useMutation({
    onSuccess: () => { refetchEntities(); utils.correspondence.entities.invalidate(); toast.success("تم الحذف"); },
    onError: (e) => toast.error(e.message),
  });
  const { data: trailData = [] } = trpc.correspondence.trail.useQuery(
    { correspondenceId: showTrail?.id || 0 },
    { enabled: !!showTrail }
  );
  const { data: assignmentsData = [] } = trpc.correspondence.assignments.useQuery(
    { correspondenceId: showAssign?.id || 0 },
    { enabled: !!showAssign }
  );
  const { data: repliesData = [] } = trpc.correspondence.replies.useQuery(
    { parentId: showTrail?.id || 0 },
    { enabled: !!showTrail },
  );

  useEffect(() => {
    if (highlightId && items.length > 0) {
      const item = items.find((i: { id: number }) => i.id === highlightId);
      if (item) {
        document.getElementById(`correspondence-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightId, items]);

  const createMut = trpc.correspondence.create.useMutation({
    onSuccess: () => { utils.correspondence.invalidate(); utils.correspondence.outboxNumbering.invalidate(); setShowForm(false); resetForm(); toast.success("تمت الإضافة بنجاح"); },
  });
  const updateMut = trpc.correspondence.update.useMutation({
    onSuccess: () => { utils.correspondence.invalidate(); setShowForm(false); setEditItem(null); resetForm(); toast.success("تم التحديث بنجاح"); },
  });
  const deleteMut = trpc.correspondence.delete.useMutation({
    onSuccess: () => { utils.correspondence.invalidate(); toast.success("تم الحذف"); },
  });
  const archiveMut = trpc.correspondence.archive.useMutation({
    onSuccess: () => { utils.correspondence.invalidate(); toast.success("تمت الأرشفة"); },
  });
  const bulkDeleteMut = trpc.correspondence.bulkDelete.useMutation({
    onSuccess: () => { utils.correspondence.invalidate(); setSelectedIds([]); toast.success("تم حذف المحدد"); },
  });
  const addTrailMut = trpc.correspondence.addTrail.useMutation({
    onSuccess: () => { utils.correspondence.trail.invalidate(); toast.success("تمت إضافة التتبع"); setTrailAction("received"); setTrailTo(""); setTrailNotes(""); },
  });
  const addAssignMut = trpc.correspondence.addAssignment.useMutation({
    onSuccess: () => { utils.correspondence.assignments.invalidate(); toast.success("تمت الإحالة"); setAssignTo(""); setAssignTask(""); },
  });
  const updateAssignMut = trpc.correspondence.updateAssignment.useMutation({
    onSuccess: () => { utils.correspondence.assignments.invalidate(); toast.success("تم التحديث"); },
  });

  // Filter by priority
  const filteredItems = useMemo(() => {
    let result = items;
    if (priorityFilter && priorityFilter !== 'all') result = result.filter((i: any) => i.priority === priorityFilter);
    if (dateFrom) result = result.filter((i: any) => {
      const d = i.correspondenceDate || i.receivedDate || '';
      return d >= dateFrom;
    });
    if (dateTo) result = result.filter((i: any) => {
      const d = i.correspondenceDate || i.receivedDate || '';
      return d <= dateTo;
    });
    return result;
  }, [items, priorityFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [activeTab, search, statusFilter, showArchived]);

  function resetForm() {
    setForm({ bookNumber: "", subject: "", senderEntity: "", receiverEntity: "", correspondenceDate: "", receivedDate: "", employee: "", employeeId: "", status: "direct", priority: "normal", deadline: "", parentId: 0, notes: "", relatedCaseId: 0, relatedCaseNumber: "", mandobOutNumber: "", legalOutNumber: "" });
    setReplyToId(null);
    setCaseSearch("");
  }

  function openEdit(item: any) {
    setEditItem(item);
    setForm({
      bookNumber: item.bookNumber || "", subject: item.subject || "",
      senderEntity: item.senderEntity || "", receiverEntity: item.receiverEntity || "",
      correspondenceDate: item.correspondenceDate || "", receivedDate: item.receivedDate || "",
      employee: item.employee || "", employeeId: item.employeeId ? String(item.employeeId) : "",
      status: item.status || "direct",
      priority: item.priority || "normal", deadline: item.deadline || "",
      parentId: item.parentId || 0, notes: item.notes || "",
      relatedCaseId: item.relatedCaseId || 0, relatedCaseNumber: item.relatedCaseNumber || "",
      mandobOutNumber: item.mandobOutNumber || "",
      legalOutNumber: item.legalOutNumber ? String(item.legalOutNumber) : "",
    });
    setShowForm(true);
  }

  function openReply(item: any) {
    resetForm();
    setEditItem(null);
    setReplyToId(item.id);
    setForm(prev => ({
      ...prev,
      subject: `رد على: ${item.subject || item.bookNumber}`,
      receiverEntity: item.senderEntity || "",
      parentId: item.id,
    }));
    setActiveTab("outbox");
    setShowForm(true);
  }

  async function handleSubmit() {
    let attachmentUrl = editItem?.attachmentUrl || "";
    let attachmentKey = editItem?.attachmentKey || "";
    if (attachFile) {
      setUploading(true);
      try {
        const buf = await attachFile.arrayBuffer();
        const res = await apiFetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": attachFile.type || "application/octet-stream", "X-File-Name": encodeURIComponent(attachFile.name) },
          body: buf,
        });
        const data = await res.json();
        attachmentUrl = data.url;
        attachmentKey = data.key;
      } catch { toast.error("فشل رفع الملف"); setUploading(false); return; }
      setUploading(false);
    }
    if (editItem) {
      updateMut.mutate({
        id: editItem.id, ...form,
        employeeId: form.employeeId ? Number(form.employeeId) : undefined,
        relatedCaseId: form.relatedCaseId || undefined,
        attachmentUrl, attachmentKey, parentId: form.parentId || undefined,
        relatedCaseNumber: form.relatedCaseNumber || undefined,
        mandobOutNumber: form.mandobOutNumber || undefined,
        legalOutNumber: isPrivileged && form.legalOutNumber ? Number(form.legalOutNumber) : undefined,
      });
    } else {
      createMut.mutate({
        type: activeTab, ...form,
        employeeId: form.employeeId ? Number(form.employeeId) : undefined,
        relatedCaseId: form.relatedCaseId || undefined,
        attachmentUrl, attachmentKey, parentId: form.parentId || undefined,
        relatedCaseNumber: form.relatedCaseNumber || undefined,
        mandobOutNumber: form.mandobOutNumber || undefined,
      });
    }
    setAttachFile(null);
  }

  const allSelected = filteredItems.length > 0 && selectedIds.length === filteredItems.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : filteredItems.map((i: any) => i.id));
  const toggleOne = (id: number, checked?: boolean) => {
    setSelectedIds(prev => {
      const shouldSelect = checked ?? !prev.includes(id);
      return shouldSelect ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(x => x !== id);
    });
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ description: "هل أنت متأكد من حذف هذه المراسلة؟", destructive: true, confirmLabel: "حذف" });
    if (ok) deleteMut.mutate({ id });
  };

  useRegisterPageActions({
    onAdd: canWrite ? () => { resetForm(); setEditItem(null); setShowForm(true); } : undefined,
  });

  const handleExcelExport = async () => {
    try {
      if (!filteredItems.length) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }
      const columns = [
        {
          key: "referenceNumber",
          label: activeTab === "outbox" ? "العدد الرسمي" : "الرقم الداخلي",
        },
        { key: "bookNumber", label: "رقم الكتاب" },
        { key: "subject", label: "الموضوع" },
        { key: "entity", label: "الجهة" },
        { key: "correspondenceDate", label: "التاريخ" },
        { key: "statusLabel", label: "الحالة" },
        { key: "priorityLabel", label: "الأهمية" },
        { key: "employee", label: "الموظف" },
        { key: "deadline", label: "الموعد النهائي" },
      ];
      const rows = filteredItems.map((i: any) => ({
        referenceNumber: activeTab === "outbox" ? (i.officialNumber || i.autoNumber || "") : (i.autoNumber || ""),
        bookNumber: i.bookNumber || "",
        subject: i.subject || "",
        entity: i.senderEntity || i.receiverEntity || "",
        correspondenceDate: i.correspondenceDate || i.receivedDate || "",
        statusLabel: STATUS_MAP[i.status]?.label || i.status || "",
        priorityLabel: PRIORITY_MAP[i.priority]?.label || i.priority || "",
        employee: i.employee || "",
        deadline: i.deadline || "",
      }));
      await exportBrandedExcel({
        sectionTitle: activeTab === "outbox" ? "المراسلات الصادرة" : "المراسلات الواردة",
        sheetName: activeTab === "outbox" ? "الصادر" : "الوارد",
        fileName: brandedExcelFileName(`correspondence_${activeTab}`),
        columns,
        rows,
        filtersSummary: search ? `بحث: ${search}` : undefined,
        exportedBy: user?.displayName ?? user?.username,
      });
      toast.success("تم تصدير الملف بنجاح");
    } catch {
      toast.error("فشل تصدير Excel");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="w-6 h-6" /> المراسلات الرسمية
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowEntities(true)}>
            <Building2 className="w-4 h-4 ml-1" /> دليل الجهات
          </Button>
          {isPrivileged && (
            <Button variant="outline" size="sm" onClick={() => {
              setNumberingApproved(String(outboxNumbering?.lastApprovedLegalOutNumber ?? 0));
              setShowNumbering(true);
            }}>
              <Settings2 className="w-4 h-4 ml-1" /> عداد الصادر
            </Button>
          )}
          {isPrivileged && (
            <Button variant="outline" size="sm" onClick={() => {
              checkDeadlineAlerts.mutate(undefined, {
                onSuccess: (r) => r.created > 0 ? toast.success(`تم إنشاء ${r.created} تنبيه موعد نهائي`) : toast.info("لا توجد مراسلات تقترب من موعدها النهائي"),
              });
            }}>
              <Timer className="w-4 h-4 ml-1" /> تنبيهات الموعد النهائي
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExcelExport}>
            <Download className="w-4 h-4 ml-1" /> تصدير Excel
          </Button>
          {isPrivileged && (
            <Button variant="outline" size="sm" onClick={() => setShowReports(true)}>
              <Calendar className="w-4 h-4 ml-1" /> التقرير اليومي
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowOverdue(true)}>
            <FileWarning className="w-4 h-4 ml-1" /> المتأخرات
          </Button>
          {isPrivileged && (
            <Button variant="outline" size="sm" onClick={() => setShowPerformance(true)}>
              <BarChart3 className="w-4 h-4 ml-1" /> إحصائيات الأداء
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 text-center">
            <Inbox className="w-8 h-8 mx-auto text-blue-600 mb-1" />
            <div className="text-2xl font-bold text-blue-700">{stats?.todayInbox || 0}</div>
            <div className="text-sm text-blue-600">وارد اليوم</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 text-center">
            <Clock className="w-8 h-8 mx-auto text-yellow-600 mb-1" />
            <div className="text-2xl font-bold text-yellow-700">{stats?.processing || 0}</div>
            <div className="text-sm text-yellow-600">قيد المعالجة</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto text-red-600 mb-1" />
            <div className="text-2xl font-bold text-red-700">{stats?.delayed || 0}</div>
            <div className="text-sm text-red-600">متأخر</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-green-600 mb-1" />
            <div className="text-2xl font-bold text-green-700">{stats?.completedThisMonth || 0}</div>
            <div className="text-sm text-green-600">منجز هذا الشهر</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setSelectedIds([]); setPage(1); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="inbox" className="flex items-center gap-2"><Inbox className="w-4 h-4" /> البريد الوارد</TabsTrigger>
          <TabsTrigger value="outbox" className="flex items-center gap-2"><Send className="w-4 h-4" /> البريد الصادر</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-4">
          <PageToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="بحث برقم الكتاب أو الموضوع..."
            filters={
              <>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="completed">تم الإنجاز</SelectItem>
                    <SelectItem value="processing">قيد المعالجة</SelectItem>
                    <SelectItem value="delayed">متأخر</SelectItem>
                    <SelectItem value="direct">مباشر</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder="الأهمية" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="very_urgent">عاجل جداً</SelectItem>
                    <SelectItem value="urgent">عاجل</SelectItem>
                    <SelectItem value="normal">عادي</SelectItem>
                    <SelectItem value="fyi">للعلم</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full sm:w-[140px]" title="من تاريخ" />
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full sm:w-[140px]" title="إلى تاريخ" />
                {(dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                    <X className="w-3 h-3 ml-1" /> مسح التاريخ
                  </Button>
                )}
                <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
                  <Archive className="w-4 h-4 ml-1" /> الأرشيف
                </Button>
              </>
            }
            actions={
              canWrite ? (
                <>
                  <Button onClick={() => { resetForm(); setEditItem(null); setShowForm(true); }}>
                    <Plus className="w-4 h-4 ml-1" /> إضافة
                  </Button>
                  {selectedIds.length > 0 && isPrivileged && (
                    <Button variant="destructive" size="sm" onClick={() => bulkDeleteMut.mutate({ ids: selectedIds })}>
                      <Trash2 className="w-4 h-4 ml-1" /> حذف ({selectedIds.length})
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />

          {isError ? (
            <div className="md:hidden text-center py-8 space-y-3">
              <p className="text-muted-foreground">تعذّر تحميل المراسلات</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
            </div>
          ) : (
          <MobileDataCards
            records={filteredItems as Record<string, unknown>[]}
            isLoading={isLoading}
            emptyTitle="لا توجد مراسلات"
            emptyMessage={activeTab === "inbox" ? "ابدأ بإضافة مراسلة واردة جديدة" : "لا توجد مراسلات صادرة"}
            emptyActionLabel={canWrite ? "إضافة مراسلة" : undefined}
            onEmptyAction={canWrite ? () => { resetForm(); setEditItem(null); setShowForm(true); } : undefined}
            titleKey="subject"
            subtitleKey="bookNumber"
            selectedIds={selectedIds}
            onToggleSelect={toggleOne}
            getCardClassName={(item) => {
              const overdue = item.deadline && new Date(String(item.deadline)) < new Date() && item.status !== "completed";
              const highlighted = highlightId === Number(item.id);
              return [overdue ? "border-red-300 bg-red-50/50" : "", highlighted ? "ring-2 ring-blue-400" : ""].filter(Boolean).join(" ");
            }}
            headerExtra={(item) => {
              const priorityInfo = PRIORITY_MAP[String(item.priority)] || PRIORITY_MAP.normal;
              return (
                <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-bold ${priorityInfo.color}`}>{priorityInfo.label}</span>
              );
            }}
            renderStatusBadge={(item) => {
              const statusInfo = STATUS_MAP[String(item.status)] || STATUS_MAP.direct;
              const StatusIcon = statusInfo.icon;
              return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusInfo.color}`}>
                  <StatusIcon className="w-3 h-3" /> {statusInfo.label}
                </span>
              );
            }}
            fields={[
              {
                key: activeTab === "inbox" ? "senderEntity" : "receiverEntity",
                label: activeTab === "inbox" ? "الجهة المرسلة" : "الجهة المستلمة",
              },
              { key: "correspondenceDate", label: "التاريخ", render: (_, r) => String(r.correspondenceDate || r.receivedDate || "—") },
              { key: "employee", label: "الموظف" },
              {
                key: "deadline",
                label: "مؤقت",
                render: (_, r) => (
                  <span className={deadlineColor(String(r.deadline || ""), r.status === "completed")}>
                    {formatDeadlineCountdown(String(r.deadline || ""), r.status === "completed")}
                  </span>
                ),
              },
            ]}
            renderActions={(item) => (
              <>
                {canWrite && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openEdit(item)}>تعديل</Button>}
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowTrail(item)}>تتبع</Button>
                {canWrite && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowAssign(item)}>إحالة</Button>}
                {canWrite && activeTab === "inbox" && (
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openReply(item)}>رد</Button>
                )}
                {canWrite && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => archiveMut.mutate({ id: Number(item.id) })}>أرشفة</Button>}
                {canWrite && <Button variant="outline" size="sm" className="h-8 text-xs text-destructive" onClick={() => handleDelete(Number(item.id))}>حذف</Button>}
              </>
            )}
          />
          )}

          {/* Table - desktop */}
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-right w-10">
                    {isPrivileged && <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />}
                  </th>
                  <th className="p-3 text-right">{activeTab === "outbox" ? "العدد الرسمي" : "الرقم الداخلي"}</th>
                  <th className="p-3 text-right">رقم الكتاب</th>
                  <th className="p-3 text-right">الموضوع</th>
                  <th className="p-3 text-right">{activeTab === "inbox" ? "الجهة المرسلة" : "الجهة المستلمة"}</th>
                  <th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">الأهمية</th>
                  <th className="p-3 text-right">الموظف</th>
                  <th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">مؤقت</th>
                  <th className="p-3 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isError ? (
                  <tr><td colSpan={10} className="p-8 text-center">
                    <p className="text-muted-foreground mb-3">تعذّر تحميل المراسلات</p>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
                  </td></tr>
                ) : isLoading ? (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">لا توجد مراسلات</td></tr>
                ) : filteredItems.map((item: any) => {
                  const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.direct;
                  const StatusIcon = statusInfo.icon;
                  const priorityInfo = PRIORITY_MAP[item.priority] || PRIORITY_MAP.normal;
                  const isOverdue = item.deadline && new Date(item.deadline) < new Date() && item.status !== "completed";
                  const highlighted = highlightId === item.id;
                  return (
                    <tr key={item.id} id={`correspondence-${item.id}`} className={`border-t hover:bg-muted/30 ${isOverdue ? "bg-red-50" : ""} ${highlighted ? "ring-2 ring-inset ring-blue-400" : ""}`}>
                      <td className="p-3">
                        {isPrivileged && (
                          <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleOne(item.id)} className="rounded" />
                        )}
                      </td>
                      <td className="p-3 font-medium text-xs">
                        {activeTab === "outbox" ? (item.officialNumber || item.autoNumber || "—") : (item.autoNumber || "—")}
                        {item.parentId ? <span title="رد على كتاب"><Link2 className="w-3 h-3 inline mr-1 text-blue-500" /></span> : null}
                      </td>
                      <td className="p-3">{item.bookNumber || "—"}</td>
                      <td className="p-3 max-w-[180px] truncate">{item.subject}</td>
                      <td className="p-3">{activeTab === "inbox" ? item.senderEntity : item.receiverEntity}</td>
                      <td className="p-3 text-xs">{item.correspondenceDate || item.receivedDate}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${priorityInfo.color}`}>
                          {priorityInfo.label}
                        </span>
                      </td>
                      <td className="p-3">{item.employee}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${statusInfo.color}`}>
                          <StatusIcon className="w-3 h-3" /> {statusInfo.label}
                        </span>
                      </td>
                      <td className="p-3">
                        {item.status !== "completed" && (
                          <span className={`text-xs font-bold ${deadlineColor(item.deadline, false)}`}>
                            <Timer className="w-3 h-3 inline ml-0.5" />
                            {formatDeadlineCountdown(item.deadline, false)}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {canWrite && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)} title="تعديل"><Edit className="h-3.5 w-3.5" /></Button>}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowTrail(item)} title="تتبع المسار"><MapPin className="h-3.5 w-3.5" /></Button>
                          {canWrite && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAssign(item)} title="إحالة"><Users className="h-3.5 w-3.5" /></Button>}
                          {canWrite && activeTab === "inbox" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openReply(item)} title="رد"><Reply className="h-3.5 w-3.5" /></Button>
                          )}
                          {canWrite && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => archiveMut.mutate({ id: item.id })} title="أرشفة"><Archive className="h-3.5 w-3.5" /></Button>}
                          {canWrite && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => handleDelete(item.id)} title="حذف"><Trash2 className="h-3.5 w-3.5" /></Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalItems > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <span className="text-sm text-muted-foreground">
                {totalItems.toLocaleString()} مراسلة — صفحة {page} من {totalPages}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>التالي</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem ? "تعديل مراسلة" : replyToId ? "إنشاء رد" : `إضافة ${activeTab === "inbox" ? "بريد وارد" : "بريد صادر"}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">رقم الكتاب</label>
                <Input value={form.bookNumber} onChange={e => setForm({ ...form, bookNumber: e.target.value })} placeholder={activeTab === "inbox" ? "رقم كتاب الجهة المرسلة" : "اختياري"} />
              </div>
              <div>
                <label className="text-sm font-medium">تاريخ الكتاب</label>
                <Input type="date" value={form.correspondenceDate} onChange={e => setForm({ ...form, correspondenceDate: e.target.value })} />
              </div>
            </div>
            {(activeTab === "outbox" || editItem?.type === "outbox") && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <p className="text-sm font-medium">العدد الرسمي للصادر</p>
                <p className="text-xs text-muted-foreground">الصيغة: ق / رقم القانونية / 573 / رقم المكتب</p>
                {editItem?.officialNumber && (
                  <p className="text-sm font-bold text-primary">{editItem.officialNumber}</p>
                )}
                {editItem && !editItem.officialNumber && editItem.legalOutNumber && (
                  <p className="text-sm font-bold text-primary">
                    ق / {editItem.legalOutNumber} / 573 / {form.mandobOutNumber || ""}
                  </p>
                )}
                {!editItem && (
                  <p className="text-xs text-muted-foreground">
                    يُولَّد تلقائياً عند الحفظ — الرقم التالي: <strong>{outboxNumbering?.nextAutoNumber ?? "…"}</strong>
                    {" "}(آخر معتمد: {outboxNumbering?.lastApprovedLegalOutNumber ?? 0}، آخر في النظام: {outboxNumbering?.lastRecordedInSystem ?? 0})
                  </p>
                )}
                {isPrivileged && editItem && (editItem.type === "outbox" || activeTab === "outbox") && (
                  <div>
                    <label className="text-sm font-medium">رقم صادر القانونية (تعديل للمدير/الإداري)</label>
                    <Input
                      type="number"
                      min={1}
                      value={form.legalOutNumber}
                      onChange={e => setForm({ ...form, legalOutNumber: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">رقم صادر المكتب (يدوي بعد التسجيل في سجل المندوب)</label>
                  <Input
                    value={form.mandobOutNumber}
                    onChange={e => setForm({ ...form, mandobOutNumber: e.target.value })}
                    placeholder="مثال: 120"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">الموضوع</label>
              <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{activeTab === "inbox" ? "الجهة المرسلة" : "الجهة المستلمة"}</label>
                <datalist id="correspondence-entity-suggestions">
                  {entitySuggestions.map((e) => (
                    <option key={e.name} value={e.name} />
                  ))}
                </datalist>
                <Input
                  list="correspondence-entity-suggestions"
                  placeholder="اختر من الدليل أو اكتب جهة جديدة"
                  value={activeTab === "inbox" ? form.senderEntity : form.receiverEntity}
                  onChange={e => setForm({ ...form, [activeTab === "inbox" ? "senderEntity" : "receiverEntity"]: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">يُكمّل تلقائياً من الدليل والجهات السابقة</p>
              </div>
              <div>
                <label className="text-sm font-medium">تاريخ الاستلام</label>
                <Input type="date" value={form.receivedDate} onChange={e => setForm({ ...form, receivedDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">الأهمية</label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="very_urgent">🔴 عاجل جداً</SelectItem>
                    <SelectItem value="urgent">🟠 عاجل</SelectItem>
                    <SelectItem value="normal">🟢 عادي</SelectItem>
                    <SelectItem value="fyi">⚪ للعلم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">الحالة</label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">مباشر</SelectItem>
                    <SelectItem value="processing">قيد المعالجة</SelectItem>
                    <SelectItem value="completed">تم الإنجاز</SelectItem>
                    <SelectItem value="delayed">متأخر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">الموعد النهائي</label>
                <Input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">الموظف المسؤول</label>
                {isPrivileged ? (
                  <Select
                    value={form.employeeId || "none"}
                    onValueChange={(v) => {
                      if (v === "none") {
                        setForm({ ...form, employeeId: "", employee: "" });
                        return;
                      }
                      const u = allUsers.find((x) => String(x.id) === v);
                      setForm({ ...form, employeeId: v, employee: u?.displayName || u?.username || "" });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— غير محدد —</SelectItem>
                      {allUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.displayName || u.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.employee || user?.displayName || ""} disabled />
                )}
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1"><Paperclip className="w-4 h-4" /> إرفاق ملف</label>
                <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif" onChange={e => setAttachFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            {canLinkCases ? (
              <div>
                <label className="text-sm font-medium flex items-center gap-1"><Link2 className="w-4 h-4" /> القضية المرتبطة (اختياري)</label>
                <Input
                  placeholder="بحث برقم القضية..."
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                  className="mb-2"
                />
                <Select
                  value={form.relatedCaseId ? String(form.relatedCaseId) : "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setForm({ ...form, relatedCaseId: 0, relatedCaseNumber: "" });
                      return;
                    }
                    const c = linkableCases.find((x) => String(x.id) === v);
                    setForm({
                      ...form,
                      relatedCaseId: Number(v),
                      relatedCaseNumber: c?.caseNumber || "",
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="اختر قضية" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون قضية —</SelectItem>
                    {linkableCases.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.caseNumber}{c.subject ? ` — ${c.subject}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : form.relatedCaseNumber ? (
              <div>
                <label className="text-sm font-medium">القضية المرتبطة</label>
                <Input value={form.relatedCaseNumber} disabled />
              </div>
            ) : null}
            <div>
              <label className="text-sm font-medium">ملاحظات</label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
            {editItem?.attachmentUrl && !attachFile && (
              <a href={editItem.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">عرض الملف المرفق الحالي</a>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            {canWrite && (
              <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending || uploading}>
                {uploading ? "جاري الرفع..." : editItem ? "تحديث" : "إضافة"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trail Dialog */}
      <Dialog open={!!showTrail} onOpenChange={() => setShowTrail(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> تتبع مسار الكتاب - {showTrail?.bookNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Timeline */}
            <div className="relative pr-6">
              {trailData.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">لا يوجد تتبع بعد</p>
              ) : trailData.map((t: any, i: number) => {
                const info = TRAIL_ACTIONS[t.action] || { label: t.action, color: "bg-gray-400" };
                return (
                  <div key={t.id} className="flex gap-3 mb-4 relative">
                    <div className={`w-3 h-3 rounded-full mt-1.5 ${info.color} shrink-0`} />
                    {i < trailData.length - 1 && <div className="absolute right-[5px] top-4 w-0.5 h-full bg-gray-200" />}
                    <div className="flex-1">
                      <div className="font-medium text-sm">{info.label}</div>
                      {t.fromUser && <div className="text-xs text-muted-foreground">من: {t.fromUser}</div>}
                      {t.toUser && <div className="text-xs text-muted-foreground">إلى: {t.toUser}</div>}
                      {t.notes && <div className="text-xs mt-1 bg-muted p-1 rounded">{t.notes}</div>}
                      <div className="text-xs text-muted-foreground mt-1">{new Date(t.createdAt).toLocaleString("ar-IQ")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {repliesData.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-bold mb-2">الردود المرتبطة</h4>
                <div className="space-y-2">
                  {repliesData.map((r: any) => (
                    <div key={r.id} className="p-2 border rounded text-sm bg-muted/30">
                      <div className="font-medium">{r.bookNumber || r.autoNumber} — {r.subject}</div>
                      <div className="text-xs text-muted-foreground">{r.correspondenceDate || r.receivedDate}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {canWrite && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="text-sm font-bold">إضافة إجراء جديد</h4>
              <Select value={trailAction} onValueChange={setTrailAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">تم الاستلام</SelectItem>
                  <SelectItem value="forwarded">تمت الإحالة</SelectItem>
                  <SelectItem value="executed">تم التنفيذ</SelectItem>
                  <SelectItem value="archived">تمت الأرشفة</SelectItem>
                  <SelectItem value="returned">تم الإرجاع</SelectItem>
                  <SelectItem value="noted">تم الاطلاع</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="إلى (اسم الموظف)" value={trailTo} onChange={e => setTrailTo(e.target.value)} />
              <Input placeholder="ملاحظات" value={trailNotes} onChange={e => setTrailNotes(e.target.value)} />
              <Button size="sm" onClick={() => {
                if (!showTrail) return;
                addTrailMut.mutate({
                  correspondenceId: showTrail.id,
                  action: trailAction,
                  fromUser: user?.displayName || user?.username,
                  toUser: trailTo || undefined,
                  notes: trailNotes || undefined,
                });
              }}>إضافة</Button>
            </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={!!showAssign} onOpenChange={() => setShowAssign(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> إحالة الكتاب - {showAssign?.bookNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current Assignments */}
            {assignmentsData.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold">الإحالات الحالية</h4>
                {assignmentsData.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div>
                      <span className="font-medium">{a.assignedTo}</span>
                      {a.task && <span className="text-muted-foreground mr-2">- {a.task}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={a.status || "pending"} onValueChange={v => updateAssignMut.mutate({ id: a.id, status: v })}>
                        <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">معلق</SelectItem>
                          <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                          <SelectItem value="completed">مكتمل</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {canWrite && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="text-sm font-bold">إحالة جديدة</h4>
              {isPrivileged ? (
                <Select value={assignTo || "none"} onValueChange={(v) => setAssignTo(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— اختر —</SelectItem>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id} value={u.displayName || u.username || ""}>
                        {u.displayName || u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="اسم الموظف" value={assignTo} onChange={e => setAssignTo(e.target.value)} />
              )}
              <Input placeholder="المهمة المطلوبة" value={assignTask} onChange={e => setAssignTask(e.target.value)} />
              <Button size="sm" onClick={() => {
                if (!showAssign || !assignTo) { toast.error("أدخل اسم الموظف"); return; }
                addAssignMut.mutate({ correspondenceId: showAssign.id, assignedTo: assignTo, task: assignTask || undefined });
              }}>إحالة</Button>
            </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily Report Dialog */}
      <Dialog open={showReports} onOpenChange={setShowReports}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> التقرير اليومي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-blue-200"><CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-blue-700">{dailyReport?.incoming || 0}</div>
                <div className="text-xs text-blue-600">وارد</div>
              </CardContent></Card>
              <Card className="border-green-200"><CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-green-700">{dailyReport?.outgoing || 0}</div>
                <div className="text-xs text-green-600">صادر</div>
              </CardContent></Card>
              <Card className="border-emerald-200"><CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-emerald-700">{dailyReport?.completed || 0}</div>
                <div className="text-xs text-emerald-600">منجز</div>
              </CardContent></Card>
              <Card className="border-red-200"><CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-red-700">{dailyReport?.overdue || 0}</div>
                <div className="text-xs text-red-600">متأخر</div>
              </CardContent></Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Overdue Report Dialog */}
      <Dialog open={showOverdue} onOpenChange={setShowOverdue}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><FileWarning className="w-5 h-5" /> الكتب المتأخرة</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {overdueItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">لا توجد كتب متأخرة</p>
            ) : overdueItems.map((item: any) => (
              <div key={item.id} className="p-3 border rounded-lg bg-red-50 border-red-200">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{item.bookNumber} - {item.subject}</div>
                    <div className="text-xs text-muted-foreground mt-1">الموظف: {item.employee} | الموعد: {item.deadline}</div>
                  </div>
                  <span className="text-red-600 font-bold text-sm">{item.daysSinceReceived} يوم</span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Performance Stats Dialog */}
      <Dialog open={showPerformance} onOpenChange={setShowPerformance}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> إحصائيات أداء الموظفين</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {performanceData.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">لا توجد بيانات</p>
            ) : (
              <table className="w-full text-sm border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-right">الموظف</th>
                    <th className="p-2 text-center">إجمالي</th>
                    <th className="p-2 text-center">منجز</th>
                    <th className="p-2 text-center">متأخر</th>
                    <th className="p-2 text-center">معدل الإنجاز</th>
                    <th className="p-2 text-center">متوسط الاستجابة</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceData.map((p: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-medium">{p.employee}</td>
                      <td className="p-2 text-center">{p.totalAssigned}</td>
                      <td className="p-2 text-center text-green-600">{p.completed}</td>
                      <td className="p-2 text-center text-red-600">{p.overdue}</td>
                      <td className="p-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${Number(p.completionRate) >= 80 ? "bg-green-100 text-green-700" : Number(p.completionRate) >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                          {p.completionRate}%
                        </span>
                      </td>
                      <td className="p-2 text-center">{p.avgResponseDays ? `${p.avgResponseDays} يوم` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Entity directory */}
      <Dialog open={showEntities} onOpenChange={setShowEntities}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" /> دليل جهات المراسلات</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="بحث في الدليل..."
              value={entitySearch}
              onChange={(e) => setEntitySearch(e.target.value)}
            />
            {canWrite && (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <p className="text-sm font-medium">إضافة جهة جديدة</p>
                <Input placeholder="اسم الجهة" value={newEntityName} onChange={(e) => setNewEntityName(e.target.value)} />
                <Input placeholder="التصنيف (اختياري) — مثال: محكمة، وزارة" value={newEntityCategory} onChange={(e) => setNewEntityCategory(e.target.value)} />
                <Select value={newEntityKind} onValueChange={(v) => setNewEntityKind(v as "sender" | "receiver" | "both")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sender">جهة مرسلة (وارد)</SelectItem>
                    <SelectItem value="receiver">جهة مستلمة (صادر)</SelectItem>
                    <SelectItem value="both">كلاهما</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!newEntityName.trim()) { toast.error("أدخل اسم الجهة"); return; }
                    createEntityMut.mutate({
                      name: newEntityName.trim(),
                      entityKind: newEntityKind,
                      category: newEntityCategory.trim() || undefined,
                    });
                  }}
                  disabled={createEntityMut.isPending}
                >
                  إضافة للدليل
                </Button>
              </div>
            )}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {entityDirectory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد جهات في الدليل بعد — تُضاف تلقائياً عند تسجيل مراسلات جديدة</p>
              ) : entityDirectory.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 p-2 border rounded text-sm">
                  <div>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.entityKind === "sender" ? "مرسلة" : e.entityKind === "receiver" ? "مستلمة" : "مرسلة ومستلمة"}
                      {e.category ? ` — ${e.category}` : ""}
                    </div>
                  </div>
                  {isPrivileged && (
                    <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => deleteEntityMut.mutate({ id: e.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Outbox numbering settings */}
      <Dialog open={showNumbering} onOpenChange={setShowNumbering}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>اعتماد عداد صادر القانونية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              أدخل آخر رقم صادر قانوني معتمد (مثلاً 302). البرنامج يحسب الرقم التالي تلقائياً ويصعد منه عند كل كتاب جديد.
            </p>
            <p>السنة: <strong>{outboxNumbering?.counterYear ?? new Date().getFullYear()}</strong> — يُعاد الاعتماد إلى 0 كل بداية سنة</p>
            <p>آخر رقم مسجّل في النظام: <strong>{outboxNumbering?.lastRecordedInSystem ?? 0}</strong></p>
            <p>الرقم التالي تلقائياً: <strong className="text-primary">{outboxNumbering?.nextAutoNumber ?? 1}</strong></p>
            <p>رمز المكتب: <strong>{outboxNumbering?.officeCode ?? "573"}</strong></p>
            <div>
              <label className="text-sm font-medium">آخر رقم صادر قانوني معتمد</label>
              <Input
                type="number"
                min={0}
                value={numberingApproved}
                onChange={(e) => setNumberingApproved(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">مثال: إذا آخر كتاب كان 302 أدخل 302 — التالي يصبح 303</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNumbering(false)}>إلغاء</Button>
            <Button
              onClick={() => {
                const n = parseInt(numberingApproved, 10);
                if (Number.isNaN(n) || n < 0) { toast.error("أدخل رقماً صحيحاً"); return; }
                updateNumberingMut.mutate({ lastApprovedLegalOutNumber: n });
              }}
              disabled={updateNumberingMut.isPending}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
