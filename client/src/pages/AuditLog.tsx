import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History, User, Clock, Download, Search, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_ACTION_OPTIONS,
  AUDIT_TABLE_LABELS,
} from "@shared/activityActions";
import { brandedExcelFileName, exportBrandedExcel } from "@/lib/brandedExcelExport";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageUsers } from "@shared/userRoles";

type ActivityEntry = {
  id: number;
  userId: number;
  username: string;
  action: string;
  details?: string | null;
  createdAt: Date | string;
};

type AuditEntry = {
  id: number;
  userId: number;
  username: string;
  action: string;
  tableName?: string | null;
  recordId?: number | null;
  description?: string | null;
  oldData?: unknown;
  newData?: unknown;
  createdAt: Date | string;
};

function formatActivityDate(value: Date | string) {
  return new Date(value).toLocaleString("ar-IQ");
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
        <User className="h-4 w-4 text-green-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{entry.username}</span>
          <Badge variant="outline" className="text-xs">
            {ACTIVITY_ACTION_LABELS[entry.action] || entry.action}
          </Badge>
        </div>
        {entry.details && (
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{entry.details}</p>
        )}
        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(entry.createdAt).toLocaleString("ar-IQ")}
        </div>
      </div>
    </div>
  );
}

function AuditDetailDialog({
  entry,
  onClose,
}: {
  entry: AuditEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;
  return (
    <Dialog open={!!entry} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تفاصيل التدقيق — #{entry.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p><span className="text-muted-foreground">المستخدم:</span> {entry.username}</p>
          <p><span className="text-muted-foreground">العملية:</span> {entry.action}</p>
          {entry.tableName && (
            <p>
              <span className="text-muted-foreground">الجدول:</span>{" "}
              {AUDIT_TABLE_LABELS[entry.tableName] || entry.tableName}
              {entry.recordId ? ` — سجل #${entry.recordId}` : ""}
            </p>
          )}
          {entry.description && <p className="whitespace-pre-wrap">{entry.description}</p>}
          {entry.oldData != null && (
            <div>
              <p className="font-medium mb-1">البيانات السابقة</p>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {JSON.stringify(entry.oldData, null, 2)}
              </pre>
            </div>
          )}
          {entry.newData != null && (
            <div>
              <p className="font-medium mb-1">البيانات الجديدة</p>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {JSON.stringify(entry.newData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AuditLog() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"activity" | "audit">("activity");
  const [actionFilter, setActionFilter] = useState("all");
  const [tableFilter, setTableFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [auditDetail, setAuditDetail] = useState<AuditEntry | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const PAGE_SIZE = 50;

  const allowed = !!user && canManageUsers(user.role);

  const activityQuery = trpc.activity.list.useQuery({
    page: activityPage,
    pageSize: PAGE_SIZE,
    action: actionFilter === "all" ? undefined : actionFilter,
    search: search.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }, { enabled: allowed });

  const auditQuery = trpc.audit.list.useQuery({
    page: auditPage,
    pageSize: PAGE_SIZE,
    tableName: tableFilter === "all" ? undefined : tableFilter,
    search: search.trim() || undefined,
  }, { enabled: allowed && tab === "audit" });

  const activityRows = useMemo(() => activityQuery.data?.items ?? [], [activityQuery.data]);
  const activityTotal = activityQuery.data?.total ?? 0;
  const activityTotalPages = Math.max(1, Math.ceil(activityTotal / PAGE_SIZE));
  const auditRows = useMemo(() => auditQuery.data?.items ?? [], [auditQuery.data]);
  const auditTotal = auditQuery.data?.total ?? 0;
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / PAGE_SIZE));

  useEffect(() => { setActivityPage(1); }, [actionFilter, search, dateFrom, dateTo]);
  useEffect(() => { setAuditPage(1); }, [tableFilter, search]);

  if (!allowed) {
    return <div className="p-8 text-center text-red-600">ليس لديك صلاحية الوصول لهذه الصفحة</div>;
  }

  const handleExport = async () => {
    try {
      if (tab === "activity") {
        if (!activityRows.length) {
          toast.error("لا توجد بيانات للتصدير");
          return;
        }
        const columns = [
          { key: "createdAt", label: "التاريخ" },
          { key: "username", label: "المستخدم" },
          { key: "actionLabel", label: "العملية" },
          { key: "details", label: "التفاصيل" },
        ];
        const rows = activityRows.map((r) => ({
          createdAt: formatActivityDate(r.createdAt),
          username: r.username,
          actionLabel: ACTIVITY_ACTION_LABELS[r.action] || r.action,
          details: r.details || "",
        }));
        await exportBrandedExcel({
          sectionTitle: "سجل النشاط",
          sheetName: "النشاط",
          fileName: brandedExcelFileName("activity_log"),
          columns,
          rows,
          exportedBy: user?.displayName ?? user?.username,
        });
      } else {
        if (!auditRows.length) {
          toast.error("لا توجد بيانات للتصدير");
          return;
        }
        const columns = [
          { key: "createdAt", label: "التاريخ" },
          { key: "username", label: "المستخدم" },
          { key: "action", label: "العملية" },
          { key: "tableLabel", label: "الجدول" },
          { key: "recordId", label: "رقم السجل" },
          { key: "description", label: "الوصف" },
        ];
        const rows = auditRows.map((r) => ({
          createdAt: formatActivityDate(r.createdAt),
          username: r.username,
          action: r.action,
          tableLabel: (r.tableName && AUDIT_TABLE_LABELS[r.tableName]) || r.tableName || "",
          recordId: r.recordId ?? "",
          description: r.description || "",
        }));
        await exportBrandedExcel({
          sectionTitle: "سجل التدقيق",
          sheetName: "التدقيق",
          fileName: brandedExcelFileName("audit_log"),
          columns,
          rows,
          exportedBy: user?.displayName ?? user?.username,
        });
      }
      toast.success("تم تصدير الملف بنجاح");
    } catch {
      toast.error("فشل تصدير Excel");
    }
  };

  const loading = tab === "activity" ? activityQuery.isLoading : auditQuery.isLoading;
  const isError = tab === "activity" ? activityQuery.isError : auditQuery.isError;
  const refetch = tab === "activity" ? activityQuery.refetch : auditQuery.refetch;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-green-700" />
          <h1 className="text-xl font-bold text-green-800">سجل العمليات</h1>
        </div>
        {(tab === "activity" || tab === "audit") && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={tab === "activity" ? !activityRows.length : !auditRows.length}
          >
            <Download className="h-4 w-4 ml-1" />
            تصدير Excel
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">سجل النشاط والتدقيق</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="activity">سجل العمليات</TabsTrigger>
              <TabsTrigger value="audit">سجل التدقيق التفصيلي</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap gap-2 mt-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pr-9"
                  placeholder="بحث بالمستخدم أو التفاصيل..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {tab === "activity" ? (
                <>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="نوع العملية" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل العمليات</SelectItem>
                      {ACTIVITY_ACTION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="date" className="w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  <Input type="date" className="w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </>
              ) : (
                <Select value={tableFilter} onValueChange={setTableFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="الجدول" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الجداول</SelectItem>
                    {Object.entries(AUDIT_TABLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <TabsContent value="activity" className="mt-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
              ) : isError ? (
                <p className="text-center text-red-600 py-8">
                  فشل تحميل السجل — <button type="button" className="underline" onClick={() => refetch()}>إعادة المحاولة</button>
                </p>
              ) : activityRows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد عمليات مسجلة</p>
              ) : (
                <div className="space-y-2 max-h-[65vh] overflow-y-auto">
                  {activityRows.map((entry) => (
                    <ActivityRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
              {activityTotal > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                  <p className="text-xs text-muted-foreground">
                    {activityTotal.toLocaleString()} عملية — صفحة {activityPage} من {activityTotalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={activityPage <= 1} onClick={() => setActivityPage((p) => Math.max(1, p - 1))}>السابق</Button>
                    <Button variant="outline" size="sm" disabled={activityPage >= activityTotalPages} onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}>التالي</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
              ) : isError ? (
                <p className="text-center text-red-600 py-8">
                  فشل تحميل السجل — <button type="button" className="underline" onClick={() => refetch()}>إعادة المحاولة</button>
                </p>
              ) : auditRows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد سجلات تدقيق</p>
              ) : (
                <div className="space-y-2 max-h-[65vh] overflow-y-auto">
                  {auditRows.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{entry.username}</span>
                          <Badge variant="outline" className="text-xs">{entry.action}</Badge>
                          {entry.tableName && (
                            <Badge variant="secondary" className="text-xs">
                              {AUDIT_TABLE_LABELS[entry.tableName] || entry.tableName}
                              {entry.recordId ? ` #${entry.recordId}` : ""}
                            </Badge>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(entry.createdAt).toLocaleString("ar-IQ")}
                        </div>
                      </div>
                      {(entry.oldData != null || entry.newData != null) && (
                        <Button variant="ghost" size="sm" onClick={() => setAuditDetail(entry)}>
                          <Eye className="h-4 w-4 ml-1" /> تفاصيل
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {auditTotal > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                  <p className="text-xs text-muted-foreground">
                    {auditTotal.toLocaleString()} سجل — صفحة {auditPage} من {auditTotalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={auditPage <= 1} onClick={() => setAuditPage((p) => Math.max(1, p - 1))}>السابق</Button>
                    <Button variant="outline" size="sm" disabled={auditPage >= auditTotalPages} onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}>التالي</Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AuditDetailDialog entry={auditDetail} onClose={() => setAuditDetail(null)} />
    </div>
  );
}
