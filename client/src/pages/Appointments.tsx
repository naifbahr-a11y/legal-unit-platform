import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hasFullAccess } from "@shared/userRoles";
import { canWriteSection, canAccessSection } from "@shared/userPermissions";
import {
  Calendar, Clock, MapPin, Plus, Trash2, ChevronRight, ChevronLeft, AlertCircle, ExternalLink, CheckCircle, XCircle,
} from "lucide-react";
import { toast } from "sonner";

const DAYS_AR = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  upcoming: { label: "قادم", color: "bg-blue-100 text-blue-800" },
  completed: { label: "مكتمل", color: "bg-green-100 text-green-800" },
  cancelled: { label: "ملغى", color: "bg-gray-100 text-gray-700" },
};

function getCountdown(dateStr: string, timeStr?: string): string {
  const target = new Date(dateStr + (timeStr ? `T${timeStr}` : "T09:00"));
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  if (diff < 0) return "انتهى";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `بعد ${days} يوم و ${hours} ساعة`;
  if (hours > 0) return `بعد ${hours} ساعة`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `بعد ${mins} دقيقة`;
}

type AppointmentItem = {
  id: number;
  title: string;
  appointmentDate: string;
  appointmentTime?: string | null;
  appointmentType?: string | null;
  caseId?: number | null;
  caseNumber?: string | null;
  location?: string | null;
  employee?: string | null;
  employeeId?: number | null;
  reminderBefore?: string | null;
  status?: string | null;
  notes?: string | null;
};

export default function Appointments() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<AppointmentItem | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [caseSearch, setCaseSearch] = useState("");
  const [form, setForm] = useState({
    title: "", appointmentDate: "", appointmentTime: "", appointmentType: "جلسة محكمة",
    caseId: "", caseNumber: "", location: "", employeeId: "", reminderBefore: "1h",
    status: "upcoming", notes: "",
  });

  const isPrivileged = user ? hasFullAccess(user.role) : false;
  const canWrite = user ? canWriteSection(user, "appointments") : false;
  const canLinkCases = user ? canAccessSection(user, "cases") : false;

  const highlightId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    return id ? Number(id) : null;
  }, []);

  const utils = trpc.useUtils();
  const { data: allAppointments = [] } = trpc.appointments.list.useQuery({ month: currentMonth });
  const { data: upcoming = [] } = trpc.appointments.upcoming.useQuery({ limit: 15 });
  const { data: linkableCases = [] } = trpc.appointments.linkableCases.useQuery(
    { search: caseSearch.trim() || undefined },
    { enabled: showForm && canLinkCases },
  );
  const { data: allUsers = [] } = trpc.users.list.useQuery(undefined, { enabled: isPrivileged });

  const createMut = trpc.appointments.create.useMutation({
    onSuccess: () => { utils.appointments.invalidate(); setShowForm(false); resetForm(); toast.success("تمت إضافة الموعد"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.appointments.update.useMutation({
    onSuccess: () => { utils.appointments.invalidate(); setShowForm(false); setEditItem(null); resetForm(); toast.success("تم تحديث الموعد"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.appointments.delete.useMutation({
    onSuccess: () => { utils.appointments.invalidate(); toast.success("تم حذف الموعد"); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (highlightId && allAppointments.length > 0) {
      const item = allAppointments.find((a) => a.id === highlightId);
      if (item) {
        setSelectedDate(item.appointmentDate);
        document.getElementById(`appointment-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightId, allAppointments]);

  function resetForm() {
    setForm({
      title: "", appointmentDate: "", appointmentTime: "", appointmentType: "جلسة محكمة",
      caseId: "", caseNumber: "", location: "", employeeId: "", reminderBefore: "1h",
      status: "upcoming", notes: "",
    });
    setCaseSearch("");
  }

  function openEdit(item: AppointmentItem) {
    setEditItem(item);
    setForm({
      title: item.title || "", appointmentDate: item.appointmentDate || "",
      appointmentTime: item.appointmentTime || "", appointmentType: item.appointmentType || "جلسة محكمة",
      caseId: item.caseId ? String(item.caseId) : "", caseNumber: item.caseNumber || "",
      location: item.location || "", employeeId: item.employeeId ? String(item.employeeId) : "",
      reminderBefore: item.reminderBefore || "1h", status: item.status || "upcoming", notes: item.notes || "",
    });
    setShowForm(true);
  }

  function conflictEmployee() {
    if (isPrivileged && form.employeeId) {
      const u = allUsers.find((x) => x.id === Number(form.employeeId));
      return u?.displayName || "";
    }
    if (isPrivileged && editItem?.employee) return editItem.employee;
    return user?.displayName || user?.username || "";
  }

  async function handleSubmit() {
    if (!canWrite) { toast.error("ليس لديك صلاحية التعديل"); return; }
    if (!form.title || !form.appointmentDate) { toast.error("العنوان والتاريخ مطلوبان"); return; }
    const employee = conflictEmployee();
    try {
      const conflicts = await utils.client.appointments.checkConflicts.query({
        date: form.appointmentDate,
        time: form.appointmentTime || "",
        employee,
        excludeId: editItem?.id,
      });
      if (conflicts && conflicts.length > 0) {
        const msg = conflicts.map((c: AppointmentItem) => `${c.title} (${c.appointmentTime || "طوال اليوم"})`).join("\n");
        if (!confirm(`تحذير: يوجد تعارض مع المواعيد التالية:\n${msg}\n\nهل تريد المتابعة؟`)) return;
      }
    } catch {
      toast.error("تعذّر التحقق من تعارض المواعيد — يرجى المحاولة مجدداً");
      return;
    }

    const payload = {
      title: form.title,
      appointmentDate: form.appointmentDate,
      appointmentTime: form.appointmentTime || undefined,
      appointmentType: form.appointmentType,
      location: form.location || undefined,
      reminderBefore: form.reminderBefore,
      notes: form.notes || undefined,
      status: form.status as "upcoming" | "completed" | "cancelled",
      caseId: form.caseId ? Number(form.caseId) : undefined,
      employeeId: isPrivileged && form.employeeId ? Number(form.employeeId) : undefined,
    };

    if (editItem) {
      updateMut.mutate({ id: editItem.id, ...payload });
    } else {
      const { status: _status, ...createPayload } = payload;
      createMut.mutate(createPayload);
    }
  }

  function quickStatus(id: number, status: "completed" | "cancelled") {
    updateMut.mutate({ id, status });
  }

  const [year, month] = currentMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, AppointmentItem[]> = {};
    allAppointments.forEach((a) => {
      if (!map[a.appointmentDate]) map[a.appointmentDate] = [];
      map[a.appointmentDate].push(a as AppointmentItem);
    });
    return map;
  }, [allAppointments]);

  function prevMonth() {
    const d = new Date(year, month - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function nextMonth() {
    const d = new Date(year, month, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const selectedDateAppointments = selectedDate ? (appointmentsByDate[selectedDate] || []) : [];

  function renderAppointmentRow(a: AppointmentItem) {
    const statusInfo = STATUS_MAP[a.status || "upcoming"] || STATUS_MAP.upcoming;
    const isHighlighted = highlightId === a.id;
    return (
      <div
        key={a.id}
        id={`appointment-${a.id}`}
        className={`flex items-center justify-between p-2 border rounded mb-2 hover:bg-muted/30 ${isHighlighted ? "ring-2 ring-primary" : ""}`}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
            {a.title}
            <span className={`text-xs px-2 py-0.5 rounded ${statusInfo.color}`}>{statusInfo.label}</span>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-1">
            {a.appointmentTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.appointmentTime}</span>}
            {a.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.location}</span>}
            {a.caseId && (
              <a href={`/cases/${a.caseId}`} className="text-green-700 hover:underline flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {a.caseNumber || `قضية #${a.caseId}`}
              </a>
            )}
            {!a.caseId && a.caseNumber && <span>قضية: {a.caseNumber}</span>}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-1 shrink-0 flex-wrap justify-end">
            {a.status === "upcoming" && (
              <>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700" onClick={() => quickStatus(a.id, "completed")}>
                  <CheckCircle className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-600" onClick={() => quickStatus(a.id, "cancelled")}>
                  <XCircle className="w-3 h-3" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>تعديل</Button>
            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (confirm("حذف؟")) deleteMut.mutate({ id: a.id }); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="w-6 h-6" /> المواعيد والتذكيرات
        </h1>
        {canWrite && (
          <Button onClick={() => { resetForm(); setEditItem(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 ml-1" /> موعد جديد
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronRight className="w-4 h-4" /></Button>
                <CardTitle className="text-lg">{MONTHS_AR[month - 1]} {year}</CardTitle>
                <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronLeft className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {DAYS_AR.map((d) => <div key={d} className="text-center text-xs font-medium text-muted-foreground p-2">{d}</div>)}
                {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const hasAppts = appointmentsByDate[dateStr]?.length > 0;
                  const isToday = dateStr === today;
                  const isSelected = dateStr === selectedDate;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(dateStr)}
                      className={`p-2 text-sm rounded-lg relative transition-colors
                        ${isToday ? "ring-2 ring-primary" : ""}
                        ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}
                      `}
                    >
                      {day}
                      {hasAppts && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedDate && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="font-medium mb-2">مواعيد {selectedDate}</h3>
                  {selectedDateAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد مواعيد في هذا اليوم</p>
                  ) : selectedDateAppointments.map(renderAppointmentRow)}
                  {canWrite && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => {
                      resetForm(); setEditItem(null);
                      setForm((f) => ({ ...f, appointmentDate: selectedDate }));
                      setShowForm(true);
                    }}>
                      <Plus className="w-3 h-3 ml-1" /> إضافة موعد لهذا اليوم
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5" /> المواعيد القادمة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد مواعيد قادمة</p>
              ) : upcoming.map((a: AppointmentItem) => {
                const countdown = getCountdown(a.appointmentDate, a.appointmentTime ?? undefined);
                const isUrgent = countdown.includes("ساعة") || countdown.includes("دقيقة");
                return (
                  <div key={a.id} className={`p-3 border rounded-lg cursor-pointer hover:bg-muted/30 ${isUrgent ? "border-red-300 bg-red-50" : ""}`} onClick={() => openEdit(a)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{a.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {a.appointmentDate} {a.appointmentTime && `- ${a.appointmentTime}`}
                        </div>
                        {a.location && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{a.location}</div>}
                        {(a.caseNumber || a.caseId) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            قضية: {a.caseNumber || `#${a.caseId}`}
                          </div>
                        )}
                      </div>
                      {isUrgent && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    </div>
                    <div className={`text-xs mt-2 font-medium ${isUrgent ? "text-red-600" : "text-blue-600"}`}>
                      ⏱ {countdown}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "تعديل موعد" : "إضافة موعد جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium">عنوان الموعد *</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: جلسة محكمة الاستئناف" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">التاريخ *</label>
                <Input type="date" value={form.appointmentDate} onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">الوقت</label>
                <Input type="time" value={form.appointmentTime} onChange={(e) => setForm({ ...form, appointmentTime: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">نوع الموعد</label>
                <Select value={form.appointmentType} onValueChange={(v) => setForm({ ...form, appointmentType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="جلسة محكمة">جلسة محكمة</SelectItem>
                    <SelectItem value="مرافعة">مرافعة</SelectItem>
                    <SelectItem value="تقديم مستندات">تقديم مستندات</SelectItem>
                    <SelectItem value="اجتماع">اجتماع</SelectItem>
                    <SelectItem value="مراجعة">مراجعة</SelectItem>
                    <SelectItem value="أخرى">أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">الحالة</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">قادم</SelectItem>
                    <SelectItem value="completed">مكتمل</SelectItem>
                    <SelectItem value="cancelled">ملغى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {canLinkCases && (
              <div>
                <label className="text-sm font-medium">ربط بقضية</label>
                <Input
                  className="mb-2"
                  placeholder="بحث برقم أو عنوان القضية..."
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                />
                <Select
                  value={form.caseId || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setForm({ ...form, caseId: "", caseNumber: "" });
                      return;
                    }
                    const c = linkableCases.find((x) => String(x.id) === v);
                    setForm({
                      ...form,
                      caseId: v,
                      caseNumber: c?.caseNumber || "",
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="اختر قضية (اختياري)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون ربط</SelectItem>
                    {linkableCases.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.caseNumber || `#${c.id}`}{c.subject ? ` — ${c.subject}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">المكان</label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="مثال: محكمة الرمادي" />
              </div>
              <div>
                <label className="text-sm font-medium">التذكير قبل</label>
                <Select value={form.reminderBefore} onValueChange={(v) => setForm({ ...form, reminderBefore: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">ساعة واحدة</SelectItem>
                    <SelectItem value="1d">يوم واحد</SelectItem>
                    <SelectItem value="1w">أسبوع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isPrivileged && (
              <div>
                <label className="text-sm font-medium">الموظف</label>
                <Select value={form.employeeId || "self"} onValueChange={(v) => setForm({ ...form, employeeId: v === "self" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">أنا / افتراضي</SelectItem>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">ملاحظات</label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={!canWrite || createMut.isPending || updateMut.isPending}>
              {editItem ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
