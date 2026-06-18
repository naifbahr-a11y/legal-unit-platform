import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { hasFullAccess } from "@shared/userRoles";
import { canWriteTable } from "@shared/userPermissions";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Printer, Search, Trash2, Edit, Settings2, MoreHorizontal, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";
import { MobileDataCards } from "@/components/MobileDataCards";
import { PageToolbar } from "@/components/PageToolbar";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { TableSkeleton } from "@/components/ListSkeleton";
import { usePageActions, useRegisterPageActions } from "@/contexts/PageActionsContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { APP_LOGO_URL } from "@/const";
import { brandedExcelFileName, exportBrandedExcel, mapRowsForExcel } from "@/lib/brandedExcelExport";
import { EXPORT_ROW_LIMIT, exportLimitMessage } from "@shared/exportLimits";

const LOGO_URL = APP_LOGO_URL;

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "textarea" | "date" | "select" | "employee";
  showInTable?: boolean;
  options?: { value: string; label: string }[];
  hidden?: boolean;
  adminOnly?: boolean;
}

interface GenericSectionProps {
  tableName: string;
  title: string;
  fields: FieldDef[];
  printTitle: string;
}

export default function GenericSection({ tableName, title, fields, printTitle }: GenericSectionProps) {
  const { user } = useAuth();
  const { confirm } = usePageActions();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [printColumnsOpen, setPrintColumnsOpen] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printItems, setPrintItems] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Load dynamic columns from section_config
  const { data: sectionConfigs } = trpc.cms.getSections.useQuery();
  const sectionKey = tableName.replace(/_/g, "-");
  const sectionCfg = sectionConfigs?.find((sc: any) => sc.sectionKey === sectionKey || sc.sectionKey === tableName);
  const extraColumns: FieldDef[] = ((sectionCfg?.columns as any[]) || [])
    .filter((c: any) => !c._deleted)
    .map((c: any) => ({
      key: c.key,
      label: c.label,
      type: c.type === "textarea" ? "textarea" : c.type === "date" ? "date" : "text",
      showInTable: true,
    }));
  // Apply column renames from CMS to built-in fields
  const renamedFields = fields.map(f => {
    const override = ((sectionCfg?.columns as any[]) || []).find((c: any) => c.key === f.key && c._renamed);
    if (override) return { ...f, label: override.label };
    return f;
  });
  // Filter out deleted built-in columns
  const deletedKeys = ((sectionCfg?.columns as any[]) || []).filter((c: any) => c._deleted).map((c: any) => c.key);
  const visibleBuiltInFields = renamedFields.filter(f => !deletedKeys.includes(f.key));
  const allFields = [...visibleBuiltInFields, ...extraColumns.filter(c => !fields.some(f => f.key === c.key))];

  const [selectedPrintColumns, setSelectedPrintColumns] = useState<string[]>(
    allFields.filter(f => f.showInTable !== false).map(f => f.key)
  );

  const PAGE_SIZE = 50;
  const { data: paged, isLoading } = trpc.tableData.listPaged.useQuery({ tableName, page, pageSize: PAGE_SIZE, search: search || undefined });
  const utils = trpc.useUtils();

  const createMutation = trpc.tableData.create.useMutation({
    onSuccess: (result) => {
      utils.tableData.listPaged.invalidate();
      setDialogOpen(false);
      toast.success(result.pending ? "تم إرسال الطلب للموافقة" : "تمت الإضافة بنجاح");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.tableData.update.useMutation({
    onSuccess: (result) => {
      utils.tableData.listPaged.invalidate();
      setEditItem(null);
      setDialogOpen(false);
      toast.success(result.pending ? "تم إرسال طلب التعديل للموافقة" : "تم التعديل بنجاح");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.tableData.delete.useMutation({
    onSuccess: (result) => {
      utils.tableData.listPaged.invalidate();
      toast.success(result.pending ? "تم إرسال طلب الحذف للموافقة" : "تم الحذف بنجاح");
    },
    onError: (err) => toast.error(err.message),
  });
  const bulkDeleteMutation = trpc.tableData.bulkDelete.useMutation({
    onSuccess: (result) => {
      utils.tableData.listPaged.invalidate();
      setSelectedIds([]);
      toast.success(result.pending ? "تم إرسال طلب الحذف للموافقة" : "تم الحذف بنجاح");
    },
    onError: (err) => toast.error(err.message),
  });

  const records = (paged as any)?.items ?? [];
  const total = (paged as any)?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isPrivileged = hasFullAccess(user?.role ?? "");
  const canWrite = user ? canWriteTable(user, tableName) : false;
  const needsEmployeePicker = isPrivileged && allFields.some((f) => f.type === "employee" || (f.key === "employee" && f.adminOnly));
  const { data: usersList } = trpc.users.list.useQuery(undefined, { enabled: needsEmployeePicker });
  const employeeOptions = (usersList ?? [])
    .map((u: { displayName?: string | null; username?: string }) => u.displayName || u.username || "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ar"));
  const formFields = allFields.filter((f) => !f.hidden && (!f.adminOnly || isPrivileged));

  const tableFields = allFields.filter(f => f.showInTable !== false);

  const handleSubmit = (data: Record<string, string>) => {
    if (editItem) {
      updateMutation.mutate({ tableName, id: editItem.id, data });
    } else {
      createMutation.mutate({ tableName, data });
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ description: "هل أنت متأكد من الحذف؟", destructive: true, confirmLabel: "حذف" });
    if (ok) deleteMutation.mutate({ tableName, id });
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: "حذف جماعي",
      description: `هل أنت متأكد من حذف ${selectedIds.length} سجل؟ لا يمكن التراجع.`,
      destructive: true,
      confirmLabel: "حذف",
    });
    if (ok) {
      bulkDeleteMutation.mutate({ tableName, ids: selectedIds });
    }
  };

  useEffect(() => {
    setPage(1);
  }, [tableName, search]);

  const openAdd = () => { setEditItem(null); setDialogOpen(true); };

  useRegisterPageActions(canWrite ? { onAdd: openAdd } : {});

  const printColumns = allFields.filter(f => selectedPrintColumns.includes(f.key));

  const fetchExportItems = async () => {
    let items = records;
    if (total > records.length) {
      const all = await utils.tableData.listPaged.fetch({
        tableName,
        page: 1,
        pageSize: EXPORT_ROW_LIMIT,
        search: search || undefined,
      });
      items = (all as any)?.items ?? [];
    }
    const limitMsg = exportLimitMessage(total, items.length);
    if (limitMsg) toast.warning(limitMsg);
    return items;
  };

  const handleOpenPrintPreview = async () => {
    const items = await fetchExportItems();
    setPrintItems(items);
    setPrintPreviewOpen(true);
  };

  const handleExcelExport = async () => {
    try {
      const items = await fetchExportItems();
      if (!items.length) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }
      const columns = printColumns.map((f) => ({ key: f.key, label: f.label }));
      await exportBrandedExcel({
        sectionTitle: printTitle,
        sheetName: title.slice(0, 31),
        fileName: brandedExcelFileName(tableName),
        columns,
        rows: mapRowsForExcel(items, columns),
        filtersSummary: search ? `بحث: ${search}` : undefined,
        exportedBy: user?.displayName ?? user?.username,
      });
      toast.success("تم تصدير الملف بنجاح");
    } catch {
      toast.error("فشل تصدير Excel");
    }
  };

  return (
    <div className="space-y-4">
      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        actions={
          <>
            <div className="flex items-center gap-2 ml-2">
              <Button
                variant="outline"
                size={isMobile ? "sm" : "default"}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                السابق
              </Button>
              <div className="text-xs text-muted-foreground min-w-[110px] text-center">
                صفحة {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                size={isMobile ? "sm" : "default"}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                التالي
              </Button>
            </div>
            <Dialog open={printColumnsOpen} onOpenChange={setPrintColumnsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size={isMobile ? "sm" : "default"}>
                  <Settings2 className="h-4 w-4 ml-1" /> أعمدة الطباعة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>اختر أعمدة الطباعة</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
                  {allFields.map(f => (
                    <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedPrintColumns.includes(f.key)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedPrintColumns([...selectedPrintColumns, f.key]);
                          else setSelectedPrintColumns(selectedPrintColumns.filter(k => k !== f.key));
                        }}
                      />
                      <span className="text-sm">{f.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" size="sm" onClick={() => setSelectedPrintColumns(allFields.map(f => f.key))}>تحديد الكل</Button>
                  <Button size="sm" className="bg-green-700 hover:bg-green-800" onClick={() => setPrintColumnsOpen(false)}>تطبيق</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={handleOpenPrintPreview}>
              <Printer className="h-4 w-4 ml-1" /> معاينة
            </Button>
            <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={handleExcelExport}>
              <Download className="h-4 w-4 ml-1" /> تصدير Excel
            </Button>
            {canWrite && selectedIds.length > 0 && (
              <Button variant="destructive" size={isMobile ? "sm" : "default"} onClick={handleBulkDelete}>
                <Trash2 className="h-4 w-4 ml-1" /> حذف ({selectedIds.length})
              </Button>
            )}
            {canWrite && (
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditItem(null); }}>
              <DialogTrigger asChild>
                <Button className="bg-green-700 hover:bg-green-800" size={isMobile ? "sm" : "default"}>
                  <Plus className="h-4 w-4 ml-1" /> إضافة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editItem ? "تعديل" : "إضافة جديد"}</DialogTitle>
                </DialogHeader>
                <RecordForm
                  key={editItem?.id ?? "new"}
                  fields={formFields}
                  employeeOptions={employeeOptions}
                  initialData={editItem}
                  onSubmit={handleSubmit}
                  isLoading={createMutation.isPending || updateMutation.isPending}
                />
              </DialogContent>
            </Dialog>
            )}
          </>
        }
      />

      <PrintPreviewDialog open={printPreviewOpen} onOpenChange={setPrintPreviewOpen} title={printTitle}>
        <div className="text-center mb-4">
          <h1 className="text-lg font-bold">مصرف الرافدين / مكتب مندوب الانبار / الوحدة القانونية</h1>
          <h2 className="text-base">{printTitle}</h2>
          <p className="text-sm">{new Date().toLocaleDateString("ar-IQ")}</p>
        </div>
        <table className="w-full text-sm border-collapse border border-gray-400">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 border border-gray-400 text-right">#</th>
              {printColumns.map(f => (
                <th key={f.key} className="p-2 border border-gray-400 text-right">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(printItems.length ? printItems : records).map((r: any, idx: number) => (
              <tr key={r.id}>
                <td className="p-2 border border-gray-400">{idx + 1}</td>
                {printColumns.map(f => (
                  <td key={f.key} className="p-2 border border-gray-400">{r[f.key] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </PrintPreviewDialog>

      <div className="flex items-center justify-between no-print">
        <p className="text-sm text-muted-foreground">
          عدد السجلات: <span className="font-bold text-foreground">{total}</span>
        </p>
      </div>

      {/* Print header */}
      <div className="hidden print-only">
        <div className="text-center mb-4">
          <h1 className="text-xl font-bold">مصرف الرافدين / مكتب مندوب الانبار / الوحدة القانونية</h1>
          <h2 className="text-lg">{printTitle}</h2>
          <p className="text-sm">{new Date().toLocaleDateString("ar-IQ")}</p>
        </div>
      </div>

      <MobileDataCards
        records={records}
        fields={tableFields.slice(0, 4)}
        titleKey={tableFields[0]?.key}
        subtitleKey={tableFields.find((f) => f.key === "complainant" || f.key === "caseNumber")?.key}
        isLoading={isLoading}
        selectedIds={selectedIds}
        onToggleSelect={(id, checked) => {
          if (checked) setSelectedIds([...selectedIds, id]);
          else setSelectedIds(selectedIds.filter((x) => x !== id));
        }}
        onEdit={canWrite ? (r) => { setEditItem(r); setDialogOpen(true); } : undefined}
        onDelete={canWrite ? (r) => handleDelete(Number(r.id)) : undefined}
        emptyTitle="لا توجد سجلات"
        emptyMessage={canWrite ? 'اضغط "إضافة" لإدخال أول سجل' : "لا توجد سجلات في هذا القسم"}
        emptyActionLabel={canWrite ? "إضافة سجل" : undefined}
        onEmptyAction={canWrite ? openAdd : undefined}
      />

      {isLoading && <TableSkeleton />}

      {/* Table - Screen view (desktop/tablet) */}
      <Card className="no-print hidden md:block">
        <CardContent className="p-0">
          <ScrollSyncTable>
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-green-800 text-white sticky top-0">
              <tr>
                <th className="p-3 text-center font-medium w-10">
                  <Checkbox
                    checked={records.length > 0 && selectedIds.length === records.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIds(records.map((r: any) => r.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="border-white data-[state=checked]:bg-white data-[state=checked]:text-green-800"
                  />
                </th>
                <th className="p-3 text-right font-medium">#</th>
                {tableFields.map(f => (
                  <th key={f.key} className="p-3 text-right font-medium whitespace-nowrap">{f.label}</th>
                ))}
                {canWrite && <th className="p-3 text-right font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={tableFields.length + 3} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={tableFields.length + 3} className="p-8 text-center text-muted-foreground">لا توجد سجلات</td></tr>
              ) : (
                records.map((r: any, idx: number) => (
                  <tr key={r.id} className={`border-b hover:bg-muted/30 transition-colors ${selectedIds.includes(r.id) ? 'bg-red-50' : ''}`}>
                    <td className="p-3 text-center">
                      <Checkbox
                        checked={selectedIds.includes(r.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedIds([...selectedIds, r.id]);
                          } else {
                            setSelectedIds(selectedIds.filter(id => id !== r.id));
                          }
                        }}
                      />
                    </td>
                    <td className="p-3">{idx + 1}</td>
                    {tableFields.map(f => (
                      <td key={f.key} className="p-3 max-w-[200px] truncate" title={r[f.key] ?? ""}>
                        {r[f.key] ?? "-"}
                      </td>
                    ))}
                    {canWrite && (
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => { setEditItem(r); setDialogOpen(true); }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </ScrollSyncTable>
        </CardContent>
      </Card>

      {/* Print watermark */}
      <img src={LOGO_URL} alt="" className="print-watermark" />

      {/* Print Table - only selected columns */}
      <div className="hidden print-only">
        <table className="w-full text-sm border-collapse border border-gray-400">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 text-right border border-gray-400">#</th>
              {allFields.filter(f => selectedPrintColumns.includes(f.key)).map(f => (
                <th key={f.key} className="p-2 text-right border border-gray-400">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(printItems.length ? printItems : records).map((r: any, idx: number) => (
              <tr key={r.id}>
                <td className="p-2 border border-gray-400">{idx + 1}</td>
                {allFields.filter(f => selectedPrintColumns.includes(f.key)).map(f => (
                  <td key={f.key} className="p-2 border border-gray-400">{r[f.key] ?? "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecordForm({ fields, employeeOptions, initialData, onSubmit, isLoading }: {
  fields: FieldDef[];
  employeeOptions?: string[];
  initialData?: any;
  onSubmit: (data: Record<string, string>) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.key] = initialData?.[f.key] ?? ""; });
    return init;
  });

  useEffect(() => {
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.key] = initialData?.[f.key] ?? ""; });
    setForm(init);
  }, [initialData, fields]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map(f => (
        <div key={f.key} className={`space-y-2 ${f.type === "textarea" ? "md:col-span-2" : ""}`}>
          <Label>{f.label}</Label>
          {f.type === "textarea" ? (
            <Textarea value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          ) : f.type === "select" && f.options ? (
            <Select value={form[f.key] || undefined} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
              <SelectTrigger><SelectValue placeholder={`اختر ${f.label}`} /></SelectTrigger>
              <SelectContent>
                {f.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : f.type === "employee" || (f.key === "employee" && f.adminOnly) ? (
            <Select value={form[f.key] || undefined} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>
                {(employeeOptions ?? []).map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={f.type === "date" ? "date" : "text"}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="submit" className="bg-green-700 hover:bg-green-800" disabled={isLoading}>
          {isLoading ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </form>
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
      {/* Top scrollbar */}
      <div
        ref={topScrollRef}
        className="table-scroll-top"
        onScroll={handleTopScroll}
      >
        <div style={{ width: scrollWidth }} />
      </div>
      {/* Table container */}
      <div
        ref={bottomScrollRef}
        className="table-scroll-container"
        onScroll={handleBottomScroll}
      >
        {children}
      </div>
    </div>
  );
}
