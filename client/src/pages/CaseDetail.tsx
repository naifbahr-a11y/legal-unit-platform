import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasFullAccess } from "@shared/userRoles";
import { canWriteSection } from "@shared/userPermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, Paperclip, Upload, Trash2, FileText, Image, Download, History, Printer, Edit } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { usePageActions } from "@/contexts/PageActionsContext";

interface CaseDetailProps {
  id: number;
}

export default function CaseDetail({ id }: CaseDetailProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isPrivileged = user ? hasFullAccess(user.role) : false;
  const canWrite = user ? canWriteSection(user, "cases") : false;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const utils = trpc.useUtils();
  const { confirm } = usePageActions();

  if (!id || Number.isNaN(id)) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">معرّف القضية غير صالح</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/cases")}>العودة لسجل القضايا</Button>
      </div>
    );
  }

  const { data: caseData, isLoading, isError, refetch } = trpc.caseDetail.get.useQuery({ id });
  const { data: attachments, refetch: refetchAttachments } = trpc.attachments.list.useQuery({ caseId: id, tableName: "cases" });

  const uploadMutation = trpc.attachments.upload.useMutation({
    onSuccess: () => {
      toast.success("تم رفع الملف بنجاح");
      refetchAttachments();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.attachments.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المرفق");
      refetchAttachments();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: employeeList = [] } = trpc.cases.employees.useQuery();
  const { data: customCaseTypes } = trpc.customCaseTypes.list.useQuery();
  const caseTypes = ["نزاهة", "جزائية", "مدنية", ...(customCaseTypes?.map((ct: { name: string }) => ct.name) || [])];

  const updateCase = trpc.cases.update.useMutation({
    onSuccess: (result) => {
      utils.caseDetail.get.invalidate({ id });
      setEditOpen(false);
      toast.success(result.pending ? "تم إرسال التعديل للموافقة" : "تم تحديث القضية");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("حجم الملف يتجاوز 16 ميغابايت");
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const result = await res.json();
      if (result.success) {
        await uploadMutation.mutateAsync({
          caseId: id,
          tableName: "cases",
          fileName: file.name,
          fileUrl: result.url,
          fileKey: result.key,
          fileSize: file.size,
          mimeType: file.type,
        });
      } else {
        toast.error("فشل رفع الملف");
      }
    } catch (err) {
      toast.error("خطأ في رفع الملف");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-8 bg-muted rounded w-48" />
        <div className="animate-pulse h-64 bg-muted rounded" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">تعذّر تحميل بيانات القضية</p>
        <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
        <Button variant="ghost" onClick={() => navigate("/cases")}>العودة لسجل القضايا</Button>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">القضية غير موجودة</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/cases")}>
          <ArrowRight className="h-4 w-4 ml-2" />
          العودة لسجل القضايا
        </Button>
      </div>
    );
  }

  const fields = [
    { label: "رقم القضية", value: caseData.caseNumber },
    { label: "رقم التحقيق", value: caseData.investigationNumber },
    { label: "النوع", value: caseData.type },
    { label: "الموضوع", value: caseData.subject },
    { label: "المشتكي", value: caseData.complainant },
    { label: "المتهم", value: caseData.accused },
    { label: "الجهة", value: caseData.authority },
    { label: "الضرر", value: caseData.damage },
    { label: "العملة", value: caseData.currency === "IQD" ? "دينار عراقي" : caseData.currency === "USD" ? "دولار أمريكي" : caseData.currency === "both" ? "كلاهما" : caseData.currency },
    { label: "المحافظة", value: caseData.province },
    { label: "الفرع", value: caseData.branch },
    { label: "الموظف المسؤول", value: caseData.employee },
    { label: "حالة القضية", value: caseData.caseStatus },
    { label: "تاريخ الاستلام", value: caseData.caseReceived },
    { label: "آخر متابعة", value: caseData.lastFollowup },
    { label: "تاريخ الانتهاء", value: caseData.expiry },
    { label: "الأيام المتبقية", value: caseData.remainingDays },
    { label: "التوثيق", value: caseData.documentation },
    { label: "آخر الإجراءات", value: caseData.lastActions },
  ];

  return (
    <div className="space-y-6 print-content">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/cases")}>
            <ArrowRight className="h-4 w-4 ml-1" />
            العودة
          </Button>
          <h1 className="text-xl font-bold text-green-800">
            تفاصيل القضية #{caseData.caseNumber || caseData.id}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
          <Button variant="outline" size="sm" onClick={() => { setForm({ ...caseData }); setEditOpen(true); }}>
            <Edit className="h-4 w-4 ml-1" />
            تعديل
          </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 ml-1" />
            طباعة
          </Button>
        </div>
      </div>

      {/* Case Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">بيانات القضية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map((f, i) => (
              f.value ? (
                <div key={i} className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">{f.label}</p>
                  <p className="font-medium text-sm">{f.value}</p>
                </div>
              ) : null
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card className="no-print">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-green-600" />
              المرفقات ({attachments?.length ?? 0})
            </CardTitle>
            {canWrite && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xls,.xlsx"
                onChange={handleFileUpload}
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 ml-1" />
                {uploading ? "جاري الرفع..." : "رفع ملف"}
              </Button>
            </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(!attachments || attachments.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد مرفقات</p>
          ) : (
            <div className="space-y-2">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                  <div className="flex items-center gap-3">
                    {att.mimeType?.startsWith("image/") ? (
                      <Image className="h-5 w-5 text-blue-500" />
                    ) : (
                      <FileText className="h-5 w-5 text-green-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{att.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {att.uploadedByName} • {new Date(att.createdAt).toLocaleDateString("ar-IQ")}
                        {att.fileSize ? ` • ${(att.fileSize / 1024).toFixed(0)} KB` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={att.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                    {(isPrivileged || user?.id === att.uploadedBy) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "حذف المرفق",
                            description: `حذف المرفق "${att.fileName}"؟`,
                            confirmLabel: "حذف",
                            destructive: true,
                          });
                          if (ok) deleteMutation.mutate({ id: att.id });
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit History */}
      {caseData.auditHistory && caseData.auditHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-5 w-5 text-amber-600" />
              سجل العمليات على هذه القضية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {caseData.auditHistory.map((entry: any) => (
                <div key={entry.id} className="flex items-start gap-3 p-2 rounded border-r-2 border-r-green-500 bg-muted/30">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{entry.description || entry.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.username} • {new Date(entry.createdAt).toLocaleString("ar-IQ")}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">{entry.action}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل القضية</DialogTitle></DialogHeader>
          <CaseForm
            form={form}
            setForm={setForm}
            caseTypes={caseTypes}
            employees={employeeList}
            isAdmin={isPrivileged}
            currentEmployee={user?.displayName ?? ""}
          />
          <Button
            className="w-full mt-2"
            disabled={updateCase.isPending}
            onClick={() => {
              const { id: _id, createdAt, updatedAt, createdBy, auditHistory, ...data } = form as any;
              updateCase.mutate({ id, data });
            }}
          >
            {updateCase.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
