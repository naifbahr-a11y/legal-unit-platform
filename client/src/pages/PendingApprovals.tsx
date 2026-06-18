import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, Eye, Clock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { canManageUsers } from "@shared/userRoles";
import {
  PENDING_TABLE_LABELS,
  PENDING_OP_LABELS,
  PENDING_STATUS_LABELS,
} from "@shared/pendingTables";
import { safeJsonParse } from "@shared/jsonUtils";

const SKIP_FIELDS = ["createdBy", "createdAt", "updatedAt", "id"];

function normalizeVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function isFieldChanged(key: string, newData: Record<string, unknown>, originalData: Record<string, unknown>): boolean {
  if (!originalData) return true;
  return normalizeVal(newData[key]) !== normalizeVal(originalData[key]);
}

function PendingOpCard({
  op,
  onView,
  onApprove,
  onEditApprove,
  onReject,
  showActions,
  approvePending,
  highlighted,
}: {
  op: any;
  onView: (data: unknown, op: unknown) => void;
  onApprove?: (id: number) => void;
  onEditApprove?: (op: any, data: Record<string, unknown>) => void;
  onReject?: (id: number) => void;
  showActions?: boolean;
  approvePending?: boolean;
  highlighted?: boolean;
}) {
  const data = typeof op.data === "string" ? safeJsonParse(op.data, {} as Record<string, unknown>) : op.data;
  return (
    <div
      id={`pending-op-${op.id}`}
      className={`border rounded-lg p-4 hover:bg-muted/30 transition-colors ${
        highlighted ? "ring-2 ring-amber-400 bg-amber-50/50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline">{PENDING_OP_LABELS[op.operationType] || op.operationType}</Badge>
            <Badge className="bg-green-100 text-green-800">{PENDING_TABLE_LABELS[op.tableName] || op.tableName}</Badge>
            {op.status !== "pending" && (
              <Badge variant={op.status === "approved" ? "default" : "destructive"}>
                {PENDING_STATUS_LABELS[op.status] || op.status}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">بواسطة: {op.submittedByName}</span>
            <Badge variant="secondary" className="text-xs">#{op.id}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {op.recordId && <span>معرف السجل: {op.recordId} | </span>}
            <span>{new Date(op.createdAt).toLocaleString("ar-IQ")}</span>
          </div>
          {op.reviewNote && (
            <p className="text-xs text-red-700 mt-2 bg-red-50 p-2 rounded">سبب الرفض: {op.reviewNote}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onView(data, op)}>
            <Eye className="h-4 w-4 ml-1" /> عرض
          </Button>
          {showActions && op.status === "pending" && onApprove && onReject && (
            <>
              {op.operationType !== "delete" && onEditApprove && (
                <Button variant="outline" size="sm" onClick={() => onEditApprove(op, data)}>
                  <Pencil className="h-4 w-4 ml-1" /> تعديل وموافقة
                </Button>
              )}
              <Button
                size="sm"
                className="bg-green-700 hover:bg-green-800"
                onClick={() => onApprove(op.id)}
                disabled={approvePending}
              >
                <CheckCircle className="h-4 w-4 ml-1" /> موافقة
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onReject(op.id)}>
                <XCircle className="h-4 w-4 ml-1" /> رفض
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PendingApprovals() {
  const { user } = useAuth();
  const [statusTab, setStatusTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [viewData, setViewData] = useState<Record<string, unknown> | null>(null);
  const [viewOp, setViewOp] = useState<any>(null);
  const [editOp, setEditOp] = useState<any>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const highlightId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    return id ? Number(id) : null;
  }, []);
  const didScroll = useRef(false);

  const isManager = user && canManageUsers(user.role);
  const { data: pendingResult, isLoading } = trpc.pending.list.useQuery(
    { status: statusTab === "all" ? undefined : statusTab },
    { enabled: !!isManager },
  );
  const { data: mySubmissions, isLoading: myLoading } = trpc.pending.mySubmissions.useQuery(
    { status: statusTab === "all" ? undefined : statusTab },
    { enabled: !!user && !isManager },
  );

  const utils = trpc.useUtils();

  const approveMutation = trpc.pending.approve.useMutation({
    onSuccess: () => {
      utils.pending.list.invalidate();
      utils.pending.count.invalidate();
      utils.notifications.unreadCount.invalidate();
      setEditOp(null);
      setEditFields({});
      toast.success("تمت الموافقة بنجاح");
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.pending.reject.useMutation({
    onSuccess: () => {
      utils.pending.list.invalidate();
      utils.pending.count.invalidate();
      setRejectId(null);
      setRejectNote("");
      toast.success("تم الرفض");
    },
    onError: (err) => toast.error(err.message),
  });

  const ops = isManager ? pendingResult?.items : mySubmissions;
  const loading = isManager ? isLoading : myLoading;

  const sortedOps = useMemo(() => {
    if (!ops) return [];
    return [...ops].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [ops]);

  useEffect(() => {
    if (highlightId) setStatusTab("all");
  }, [highlightId]);

  useEffect(() => {
    if (!highlightId || didScroll.current || sortedOps.length === 0) return;
    const el = document.getElementById(`pending-op-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      didScroll.current = true;
    }
  }, [highlightId, sortedOps]);

  const openEditApprove = (op: any, data: Record<string, unknown>) => {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!SKIP_FIELDS.includes(key)) fields[key] = String(value ?? "");
    }
    setEditOp(op);
    setEditFields(fields);
  };

  const submitEditApprove = () => {
    if (!editOp) return;
    const modifiedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(editFields)) {
      modifiedData[key] = value;
    }
    approveMutation.mutate({ id: editOp.id, modifiedData });
  };

  if (!user) return null;

  if (!isManager) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              طلباتي المعلّقة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              تتبّع حالة طلبات الإضافة والتعديل والحذف التي أرسلتها للموافقة.
            </p>
            <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as typeof statusTab)}>
              <TabsList className="mb-4">
                <TabsTrigger value="pending">معلّقة</TabsTrigger>
                <TabsTrigger value="approved">موافق عليها</TabsTrigger>
                <TabsTrigger value="rejected">مرفوضة</TabsTrigger>
                <TabsTrigger value="all">الكل</TabsTrigger>
              </TabsList>
            </Tabs>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
            ) : sortedOps.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد طلبات في هذه الفئة</p>
            ) : (
              <div className="space-y-3">
                {sortedOps.map((op: any) => (
                  <PendingOpCard
                    key={op.id}
                    op={op}
                    highlighted={highlightId === op.id}
                    onView={(d, o) => { setViewData(d as Record<string, unknown>); setViewOp(o); }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <ViewDialog viewData={viewData} viewOp={viewOp} onClose={() => { setViewData(null); setViewOp(null); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-600" />
            الموافقات المعلقة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as typeof statusTab)}>
            <TabsList className="mb-4">
              <TabsTrigger value="pending">معلّقة</TabsTrigger>
              <TabsTrigger value="approved">موافق عليها</TabsTrigger>
              <TabsTrigger value="rejected">مرفوضة</TabsTrigger>
              <TabsTrigger value="all">الكل</TabsTrigger>
            </TabsList>
          </Tabs>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : sortedOps.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد عمليات في هذه الفئة</p>
          ) : (
            <div className="space-y-3">
              {sortedOps.map((op: any) => (
                <PendingOpCard
                  key={op.id}
                  op={op}
                  highlighted={highlightId === op.id}
                  showActions
                  approvePending={approveMutation.isPending}
                  onView={(d, o) => { setViewData(d as Record<string, unknown>); setViewOp(o); }}
                  onApprove={(id) => approveMutation.mutate({ id })}
                  onEditApprove={openEditApprove}
                  onReject={(id) => setRejectId(id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ViewDialog viewData={viewData} viewOp={viewOp} onClose={() => { setViewData(null); setViewOp(null); }} />

      <Dialog open={!!editOp} onOpenChange={(open) => { if (!open) { setEditOp(null); setEditFields({}); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل البيانات قبل الموافقة — طلب #{editOp?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {Object.entries(editFields).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{key}</Label>
                <Input
                  value={value}
                  onChange={(e) => setEditFields({ ...editFields, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setEditOp(null); setEditFields({}); }}>إلغاء</Button>
              <Button
                className="bg-green-700 hover:bg-green-800"
                onClick={submitEditApprove}
                disabled={approveMutation.isPending}
              >
                حفظ وموافقة
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectId !== null} onOpenChange={() => { setRejectId(null); setRejectNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>سبب الرفض</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="أدخل سبب الرفض (اختياري)"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRejectId(null); setRejectNote(""); }}>إلغاء</Button>
              <Button
                variant="destructive"
                onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, note: rejectNote })}
                disabled={rejectMutation.isPending}
              >
                تأكيد الرفض
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewDialog({
  viewData,
  viewOp,
  onClose,
}: {
  viewData: Record<string, unknown> | null;
  viewOp: any;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!viewData} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {viewOp?.operationType === "add" && <span className="text-green-700">طلب إضافة جديد</span>}
            {viewOp?.operationType === "edit" && <span className="text-amber-700">طلب تعديل — الحقول المتغيرة مميزة</span>}
            {viewOp?.operationType === "delete" && <span className="text-red-700">طلب حذف</span>}
            {!viewOp?.operationType && "تفاصيل البيانات"}
          </DialogTitle>
        </DialogHeader>

        {viewOp?.operationType === "delete" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm font-medium">
            طلب حذف السجل رقم {viewOp.recordId} من {PENDING_TABLE_LABELS[viewOp.tableName] || viewOp.tableName}
          </div>
        )}

        {viewOp?.operationType === "add" && viewData && (
          <div className="space-y-1">
            <p className="text-xs text-green-700 bg-green-50 p-2 rounded mb-2">جميع الحقول جديدة (إضافة سجل)</p>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(viewData)
                  .filter(([k]) => !SKIP_FIELDS.includes(k))
                  .map(([key, value]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 font-medium text-muted-foreground w-40 align-top">{key}</td>
                      <td className="py-1.5 text-green-700 font-medium">{String(value ?? "—")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {viewOp?.operationType === "edit" && viewData && (() => {
          const original = (viewOp.originalData ?? {}) as Record<string, unknown>;
          const allKeys = Array.from(new Set([...Object.keys(viewData), ...Object.keys(original)]))
            .filter((k) => !SKIP_FIELDS.includes(k));
          const changedKeys = allKeys.filter((k) => isFieldChanged(k, viewData, original));
          const unchangedKeys = allKeys.filter((k) => !isFieldChanged(k, viewData, original));

          return (
            <div className="space-y-3">
              {changedKeys.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded mb-1">
                    الحقول المعدّلة ({changedKeys.length})
                  </p>
                  <table className="w-full text-sm border border-red-200 rounded overflow-hidden">
                    <thead>
                      <tr className="bg-red-50 text-red-800">
                        <th className="py-1.5 px-3 text-right font-semibold w-36">الحقل</th>
                        <th className="py-1.5 px-3 text-right font-semibold">القيمة الأصلية</th>
                        <th className="py-1.5 px-3 text-right font-semibold">القيمة الجديدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changedKeys.map((key) => (
                        <tr key={key} className="border-t border-red-100 bg-red-50/50">
                          <td className="py-1.5 px-3 font-medium text-red-800 align-top">{key}</td>
                          <td className="py-1.5 px-3 text-muted-foreground line-through align-top">
                            {normalizeVal(original[key]) || "—"}
                          </td>
                          <td className="py-1.5 px-3 text-red-700 font-bold align-top">
                            {normalizeVal(viewData[key]) || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {unchangedKeys.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded mb-1">
                    الحقول غير المعدّلة ({unchangedKeys.length})
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      {unchangedKeys.map((key) => (
                        <tr key={key} className="border-b last:border-0">
                          <td className="py-1 pr-3 font-medium text-muted-foreground w-40 align-top">{key}</td>
                          <td className="py-1 text-foreground">{normalizeVal(original[key] ?? viewData[key]) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
