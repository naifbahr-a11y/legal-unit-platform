import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Mail, Search, Clock, CheckCircle, AlertTriangle, Paperclip, Inbox, Send,
} from "lucide-react";
import { toast } from "sonner";
import { MobileDataCards } from "@/components/MobileDataCards";

const ASSIGNMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "معلق", color: "bg-yellow-100 text-yellow-800" },
  in_progress: { label: "قيد التنفيذ", color: "bg-blue-100 text-blue-800" },
  completed: { label: "مكتمل", color: "bg-green-100 text-green-800" },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  very_urgent: { label: "عاجل جداً", color: "bg-red-600 text-white" },
  urgent: { label: "عاجل", color: "bg-orange-500 text-white" },
  normal: { label: "عادي", color: "bg-green-500 text-white" },
  fyi: { label: "للعلم", color: "bg-gray-400 text-white" },
};

type AssignmentRow = {
  id: number;
  correspondenceId: number;
  task?: string | null;
  status?: string | null;
  bookNumber?: string | null;
  autoNumber?: string | null;
  officialNumber?: string | null;
  subject?: string | null;
  type?: string | null;
  senderEntity?: string | null;
  receiverEntity?: string | null;
  correspondenceDate?: string | null;
  receivedDate?: string | null;
  deadline?: string | null;
  priority?: string | null;
  attachmentUrl?: string | null;
  notes?: string | null;
  createdAt?: Date | string | null;
};

function getQueryId(): number | null {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id"));
  return id > 0 ? id : null;
}

export default function CorrespondenceAssignments() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AssignmentRow | null>(null);
  const utils = trpc.useUtils();

  const { data: stats } = trpc.correspondence.myAssignmentStats.useQuery();
  const { data, isLoading } = trpc.correspondence.myAssignments.useQuery({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize: 50,
  });

  const updateMut = trpc.correspondence.updateAssignment.useMutation({
    onSuccess: () => {
      utils.correspondence.myAssignments.invalidate();
      utils.correspondence.myAssignmentStats.invalidate();
      toast.success("تم تحديث حالة الإحالة");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = (data?.items ?? []) as AssignmentRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? 50)));

  useEffect(() => {
    const correspondenceId = getQueryId();
    if (!correspondenceId || items.length === 0) return;
    const match = items.find((i) => i.correspondenceId === correspondenceId);
    if (match) setSelected(match);
  }, [items]);

  const handleStatusChange = (assignmentId: number, status: string) => {
    if (!assignmentId) return;
    updateMut.mutate({ id: assignmentId, status });
    if (selected) setSelected({ ...selected, status });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="w-6 h-6" /> إحالات المراسلات
        </h1>
        <p className="text-sm text-muted-foreground">الكتب المحالة إليك للاطلاع والإنجاز</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 text-center">
            <Clock className="w-7 h-7 mx-auto text-yellow-600 mb-1" />
            <div className="text-2xl font-bold text-yellow-700">{stats?.pending ?? 0}</div>
            <div className="text-sm text-yellow-600">معلقة</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-7 h-7 mx-auto text-blue-600 mb-1" />
            <div className="text-2xl font-bold text-blue-700">{stats?.inProgress ?? 0}</div>
            <div className="text-sm text-blue-600">قيد التنفيذ</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-7 h-7 mx-auto text-green-600 mb-1" />
            <div className="text-2xl font-bold text-green-700">{stats?.completed ?? 0}</div>
            <div className="text-sm text-green-600">مكتملة</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Mail className="w-7 h-7 mx-auto text-muted-foreground mb-1" />
            <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
            <div className="text-sm text-muted-foreground">إجمالي الإحالات</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pr-9"
            placeholder="بحث في الموضوع أو رقم الكتاب..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="pending">معلق</SelectItem>
            <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="md:hidden">
        <MobileDataCards
          records={items as unknown as Record<string, unknown>[]}
          isLoading={isLoading}
          emptyMessage="لا توجد إحالات مراسلات محالة إليك حالياً"
          onClick={(record) => setSelected(record as unknown as AssignmentRow)}
          getTitle={(record) => (record.subject as string) || "بدون موضوع"}
          getSubtitle={(record) => {
            const row = record as unknown as AssignmentRow;
            const ref = row.type === "outbox"
              ? (row.officialNumber || row.autoNumber || "—")
              : (row.autoNumber || row.bookNumber || "—");
            return `رقم: ${ref}`;
          }}
          renderStatusBadge={(record) => {
            const st = ASSIGNMENT_STATUS[(record.status as string) || "pending"] || ASSIGNMENT_STATUS.pending;
            return <Badge className={st.color}>{st.label}</Badge>;
          }}
          fields={[
            { key: "task", label: "المهمة" },
            { key: "deadline", label: "الموعد النهائي" },
          ]}
          renderActions={(record) => {
            const row = record as unknown as AssignmentRow;
            if (row.status === "completed" || !row.id) return null;
            return (
              <Select value={row.status || "pending"} onValueChange={(v) => handleStatusChange(row.id, v)}>
                <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">معلق</SelectItem>
                  <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                </SelectContent>
              </Select>
            );
          }}
        />
      </div>

      <div className="hidden md:block overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-right">النوع</th>
              <th className="p-3 text-right">الرقم</th>
              <th className="p-3 text-right">الموضوع</th>
              <th className="p-3 text-right">المهمة</th>
              <th className="p-3 text-right">الموعد النهائي</th>
              <th className="p-3 text-right">الحالة</th>
              <th className="p-3 text-right">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">جاري التحميل...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">لا توجد إحالات</td></tr>
            ) : items.map((item) => {
              const st = ASSIGNMENT_STATUS[item.status || "pending"] || ASSIGNMENT_STATUS.pending;
              const ref = item.type === "outbox"
                ? (item.officialNumber || item.autoNumber || "—")
                : (item.autoNumber || item.bookNumber || "—");
              return (
                <tr key={item.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(item)}>
                  <td className="p-3">
                    {item.type === "outbox"
                      ? <span className="flex items-center gap-1"><Send className="w-3.5 h-3.5" /> صادر</span>
                      : <span className="flex items-center gap-1"><Inbox className="w-3.5 h-3.5" /> وارد</span>}
                  </td>
                  <td className="p-3 font-mono text-xs">{ref}</td>
                  <td className="p-3">{item.subject || "—"}</td>
                  <td className="p-3 text-muted-foreground">{item.task || "—"}</td>
                  <td className="p-3">{item.deadline || "—"}</td>
                  <td className="p-3"><Badge className={st.color}>{st.label}</Badge></td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    {item.status !== "completed" && (
                      <Select
                        value={item.status || "pending"}
                        onValueChange={(v) => handleStatusChange(item.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">معلق</SelectItem>
                          <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                          <SelectItem value="completed">مكتمل</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
          <span className="text-sm self-center">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل الكتاب المحال</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground text-xs">النوع</div>
                  <div>{selected.type === "outbox" ? "صادر" : "وارد"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">الرقم</div>
                  <div className="font-mono">
                    {selected.type === "outbox"
                      ? (selected.officialNumber || selected.autoNumber || "—")
                      : (selected.autoNumber || selected.bookNumber || "—")}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground text-xs">الموضوع</div>
                  <div className="font-medium">{selected.subject || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">الجهة</div>
                  <div>{selected.type === "inbox" ? selected.senderEntity : selected.receiverEntity || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">التاريخ</div>
                  <div>{selected.receivedDate || selected.correspondenceDate || "—"}</div>
                </div>
                {selected.deadline && (
                  <div>
                    <div className="text-muted-foreground text-xs">الموعد النهائي</div>
                    <div className="text-orange-600 font-medium">{selected.deadline}</div>
                  </div>
                )}
                {selected.priority && PRIORITY_MAP[selected.priority] && (
                  <div>
                    <div className="text-muted-foreground text-xs">الأولوية</div>
                    <Badge className={PRIORITY_MAP[selected.priority].color}>
                      {PRIORITY_MAP[selected.priority].label}
                    </Badge>
                  </div>
                )}
              </div>
              {selected.task && (
                <div className="bg-muted/50 p-3 rounded">
                  <div className="text-xs text-muted-foreground mb-1">المهمة المطلوبة</div>
                  <div>{selected.task}</div>
                </div>
              )}
              {selected.notes && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">ملاحظات</div>
                  <div className="bg-muted/30 p-2 rounded">{selected.notes}</div>
                </div>
              )}
              {selected.attachmentUrl && (
                <a
                  href={selected.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <Paperclip className="w-4 h-4" /> عرض المرفق
                </a>
              )}
              {selected.id > 0 && selected.status !== "completed" && (
                <div className="border-t pt-4 space-y-2">
                  <div className="font-medium">تحديث حالة الإنجاز</div>
                  <Select
                    value={selected.status || "pending"}
                    onValueChange={(v) => handleStatusChange(selected.id, v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">معلق</SelectItem>
                      <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                      <SelectItem value="completed">مكتمل — تم الإنجاز</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
