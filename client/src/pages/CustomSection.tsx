import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasFullAccess } from "@shared/userRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Edit, Printer } from "lucide-react";
import { toast } from "sonner";
import { MobileDataCards } from "@/components/MobileDataCards";
import { usePageActions } from "@/contexts/PageActionsContext";
import { APP_LOGO_URL } from "@/const";

interface CustomSectionProps {
  slug: string;
}

export default function CustomSection({ slug }: CustomSectionProps) {
  const { user } = useAuth();
  const { confirm } = usePageActions();
  const isPrivileged = hasFullAccess(user?.role ?? "");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const { data: section, isLoading: sectionLoading } = trpc.customSections.getBySlug.useQuery({ slug });
  const { data: paged, isLoading: recordsLoading } = trpc.customSections.recordsPaged.useQuery(
    { sectionId: section?.id ?? 0, page, pageSize: PAGE_SIZE },
    { enabled: !!section?.id }
  );
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const addRecord = trpc.customSections.addRecord.useMutation({
    onSuccess: () => {
      utils.customSections.records.invalidate();
      utils.customSections.recordsPaged.invalidate();
      setShowForm(false);
      setFormData({});
      toast.success("تمت الإضافة بنجاح");
    },
  });

  const updateRecord = trpc.customSections.updateRecord.useMutation({
    onSuccess: () => {
      utils.customSections.records.invalidate();
      utils.customSections.recordsPaged.invalidate();
      setEditId(null);
      setFormData({});
      toast.success("تم التعديل بنجاح");
    },
  });

  const deleteRecord = trpc.customSections.deleteRecord.useMutation({
    onSuccess: () => {
      utils.customSections.records.invalidate();
      utils.customSections.recordsPaged.invalidate();
      toast.success("تم الحذف بنجاح");
    },
  });
  const bulkDeleteRecords = trpc.customSections.bulkDeleteRecords.useMutation({
    onSuccess: () => {
      utils.customSections.recordsPaged.invalidate();
      setSelectedIds([]);
      toast.success("تم الحذف بنجاح");
    },
  });

  if (sectionLoading) return <div className="p-6 text-center">جاري التحميل...</div>;
  if (!section) return <div className="p-6 text-center text-red-500">القسم غير موجود</div>;

  const fields = (section.fields as any[]) || [];
  const tableFields = fields.filter((f: any) => f.showInTable);

  const handleSubmit = () => {
    if (editId) {
      updateRecord.mutate({ id: editId, data: formData });
    } else {
      addRecord.mutate({ sectionId: section.id, data: formData });
    }
  };

  const handleEdit = (record: any) => {
    setEditId(record.id);
    setFormData(record.data || {});
    setShowForm(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: "حذف جماعي",
      description: `هل أنت متأكد من حذف ${selectedIds.length} سجل؟ لا يمكن التراجع.`,
      destructive: true,
      confirmLabel: "حذف",
    });
    if (ok) {
      bulkDeleteRecords.mutate({ ids: selectedIds });
    }
  };

  const records = (paged as any)?.items ?? [];
  const total = (paged as any)?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const flatRecords = (records ?? []).map((r: any) => ({ id: r.id, ...r.data }));

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6 no-print">
        <h1 className="text-2xl font-bold text-green-800">{section.name}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            السابق
          </Button>
          <div className="text-xs text-muted-foreground self-center min-w-[90px] text-center">
            صفحة {page}/{totalPages}
          </div>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            التالي
          </Button>
          {selectedIds.length > 0 && isPrivileged && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="w-4 h-4 ml-1" /> حذف المحدد ({selectedIds.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 ml-1" /> طباعة
          </Button>
          {isPrivileged && (
            <Button size="sm" onClick={() => { setShowForm(!showForm); setEditId(null); setFormData({}); }}>
              <Plus className="w-4 h-4 ml-1" /> إضافة سجل
            </Button>
          )}
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-4 mb-4 no-print">
          <h3 className="font-semibold mb-3">{editId ? "تعديل سجل" : "إضافة سجل جديد"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {fields.map((field: any) => (
              <div key={field.key}>
                <label className="text-sm font-medium text-gray-700 block mb-1">{field.label}</label>
                {field.type === "textarea" ? (
                  <textarea
                    className="w-full border rounded p-2 text-sm"
                    value={formData[field.key] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    rows={3}
                  />
                ) : field.type === "select" && field.options ? (
                  <select
                    className="w-full border rounded p-2 text-sm"
                    value={formData[field.key] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  >
                    <option value="">اختر...</option>
                    {field.options.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                    value={formData[field.key] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={handleSubmit} disabled={addRecord.isPending || updateRecord.isPending}>
              {editId ? "حفظ التعديلات" : "إضافة"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditId(null); setFormData({}); }}>
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      <MobileDataCards
        records={flatRecords}
        isLoading={recordsLoading}
        emptyMessage="لا توجد سجلات"
        titleKey={tableFields[0]?.key}
        fields={tableFields.slice(1, 5).map((f: any) => ({ key: f.key, label: f.label }))}
        selectedIds={isPrivileged ? selectedIds : undefined}
        onToggleSelect={isPrivileged ? (id, checked) => {
          if (checked) setSelectedIds([...selectedIds, id]);
          else setSelectedIds(selectedIds.filter(x => x !== id));
        } : undefined}
        onEdit={isPrivileged ? (r) => {
          const original = records?.find((rec: any) => rec.id === r.id);
          if (original) handleEdit(original);
        } : undefined}
        onDelete={isPrivileged ? async (r) => {
          const ok = await confirm({ description: "هل أنت متأكد من الحذف؟", destructive: true, confirmLabel: "حذف" });
          if (ok) deleteRecord.mutate({ id: Number(r.id) });
        } : undefined}
      />

      {/* Table - desktop */}
      <div className="bg-white rounded-lg border overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-green-50">
              <tr>
                {isPrivileged && (
                  <th className="p-3 text-center w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={records && records.length > 0 && selectedIds.length === records.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((records ?? []).map((r: any) => r.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th className="p-3 text-right font-semibold text-green-800">#</th>
                {tableFields.map((f: any) => (
                  <th key={f.key} className="p-3 text-right font-semibold text-green-800">{f.label}</th>
                ))}
                {isPrivileged && <th className="p-3 text-right font-semibold text-green-800 no-print">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {recordsLoading ? (
                <tr><td colSpan={tableFields.length + 3} className="p-4 text-center">جاري التحميل...</td></tr>
              ) : !records || records.length === 0 ? (
                <tr><td colSpan={tableFields.length + 3} className="p-4 text-center text-gray-500">لا توجد سجلات</td></tr>
              ) : (
                records.map((record: any, idx: number) => (
                  <tr key={record.id} className={`border-t hover:bg-gray-50 ${selectedIds.includes(record.id) ? 'bg-red-50' : ''}`}>
                    {isPrivileged && (
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          checked={selectedIds.includes(record.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, record.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== record.id));
                            }
                          }}
                        />
                      </td>
                    )}
                    <td className="p-3">{idx + 1}</td>
                    {tableFields.map((f: any) => (
                      <td key={f.key} className="p-3">{record.data?.[f.key] || "-"}</td>
                    ))}
                    {isPrivileged && (
                      <td className="p-3 no-print">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(record)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600"                           onClick={async () => {
                            const ok = await confirm({ description: "هل أنت متأكد من الحذف؟", destructive: true, confirmLabel: "حذف" });
                            if (ok) deleteRecord.mutate({ id: record.id });
                          }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print watermark */}
      <img src={APP_LOGO_URL} alt="" className="print-watermark" />
    </div>
  );
}
