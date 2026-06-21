import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { isBuiltinSection } from "@shared/cmsSections";
import { hasFullAccess } from "@shared/userRoles";
import { Plus, Trash2, Edit, Upload, GripVertical, Eye, EyeOff, ArrowUp, ArrowDown, Columns, FileSpreadsheet, Palette, Image } from "lucide-react";

type Tab = "sections" | "columns" | "import" | "caseTypes" | "appearance";

export default function AdminCMS() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("sections");

  if (!user || !hasFullAccess(user.role)) {
    return <div className="p-8 text-center text-red-600">ليس لديك صلاحية الوصول لهذه الصفحة</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-green-800">إدارة المحتوى</h1>
      <p className="text-gray-600">تحكم كامل بالأقسام والحقول والمظهر - صلاحية مطلقة بدون برمجة</p>
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {[
          { key: "sections" as Tab, label: "إدارة الأقسام", icon: <GripVertical className="w-4 h-4" /> },
          { key: "columns" as Tab, label: "إدارة الأعمدة", icon: <Columns className="w-4 h-4" /> },
          { key: "import" as Tab, label: "استيراد بيانات", icon: <FileSpreadsheet className="w-4 h-4" /> },
          { key: "caseTypes" as Tab, label: "أنواع القضايا", icon: <Plus className="w-4 h-4" /> },
          { key: "appearance" as Tab, label: "المظهر والشعار", icon: <Palette className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === tab.key ? "bg-green-700 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "sections" && <SectionsManager />}
      {activeTab === "columns" && <ColumnsManager />}
      {activeTab === "import" && <ImportWizard />}
      {activeTab === "caseTypes" && <CaseTypesManager />}
      {activeTab === "appearance" && <AppearanceManager />}
    </div>
  );
}

// ===== Sections Manager =====
function SectionsManager() {
  const { data: sections, refetch, isLoading, isError } = trpc.cms.getSections.useQuery();
  const updateSection = trpc.cms.updateSection.useMutation({ onSuccess: () => { refetch(); toast.success("تم التحديث"); } });
  const reorderSections = trpc.cms.reorderSections.useMutation({ onSuccess: () => { refetch(); toast.success("تم إعادة الترتيب"); } });
  const createSection = trpc.customSections.create.useMutation({ onSuccess: () => { refetch(); toast.success("تم إنشاء القسم"); setShowCreateForm(false); } });

  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionFields, setNewSectionFields] = useState<{ name: string; type: string }[]>([{ name: "", type: "text" }]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const moveSection = (index: number, direction: "up" | "down") => {
    if (!sections) return;
    const items = [...sections];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    [items[index], items[targetIdx]] = [items[targetIdx], items[index]];
    const reordered = items.map((item, i) => ({ id: item.id, sortOrder: i + 1 }));
    reorderSections.mutate({ items: reordered });
  };

  const handleCreateSection = () => {
    if (!newSectionName.trim()) { toast.error("أدخل اسم القسم"); return; }
    const validFields = newSectionFields.filter(f => f.name.trim());
    if (validFields.length === 0) { toast.error("أضف حقل واحد على الأقل"); return; }
    createSection.mutate({
      name: newSectionName,
      slug: newSectionName.replace(/\s+/g, "-").toLowerCase() + "-" + Date.now(),
      fields: validFields.map(f => ({ key: f.name.replace(/\s+/g, "_"), label: f.name, type: f.type as any, showInTable: true })),
    });
    setNewSectionName("");
    setNewSectionFields([{ name: "", type: "text" }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-green-800">الأقسام</h2>
        <button onClick={() => setShowCreateForm(!showCreateForm)} className="flex items-center gap-1 px-3 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800">
          <Plus className="w-4 h-4" /> إنشاء قسم جديد
        </button>
      </div>
      {showCreateForm && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <h3 className="font-bold text-green-800">إنشاء قسم جديد</h3>
          <input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="اسم القسم" className="w-full border rounded-lg px-3 py-2" />
          <div className="space-y-2">
            <label className="font-medium text-sm">الحقول:</label>
            {newSectionFields.map((field, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={field.name} onChange={(e) => { const u = [...newSectionFields]; u[i].name = e.target.value; setNewSectionFields(u); }} placeholder="اسم الحقل" className="flex-1 border rounded-lg px-3 py-2" />
                <select value={field.type} onChange={(e) => { const u = [...newSectionFields]; u[i].type = e.target.value; setNewSectionFields(u); }} className="border rounded-lg px-3 py-2">
                  <option value="text">نص</option>
                  <option value="number">رقم</option>
                  <option value="date">تاريخ</option>
                  <option value="select">قائمة اختيار</option>
                </select>
                <button onClick={() => setNewSectionFields(newSectionFields.filter((_, idx) => idx !== i))} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => setNewSectionFields([...newSectionFields, { name: "", type: "text" }])} className="text-green-700 text-sm hover:underline">+ إضافة حقل</button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateSection} className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800">إنشاء</button>
            <button onClick={() => setShowCreateForm(false)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center text-gray-500">جاري تحميل الأقسام...</div>
        )}
        {isError && (
          <div className="p-8 text-center text-red-600">تعذّر تحميل الأقسام. أعد تحميل الصفحة أو تحقق من اتصال قاعدة البيانات.</div>
        )}
        {!isLoading && !isError && (!sections || sections.length === 0) && (
          <div className="p-8 text-center text-gray-500">لا توجد أقسام. سيتم إنشاء الأقسام المدمجة تلقائياً عند الاتصال بقاعدة البيانات.</div>
        )}
        {!isLoading && !isError && sections && sections.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-right">الترتيب</th>
              <th className="px-4 py-3 text-right">اسم القسم</th>
              <th className="px-4 py-3 text-right">النوع</th>
              <th className="px-4 py-3 text-right">الحالة</th>
              <th className="px-4 py-3 text-right">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sections?.map((section, index) => (
              <tr key={section.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveSection(index, "up")} disabled={index === 0} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => moveSection(index, "down")} disabled={index === (sections?.length || 0) - 1} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingId === section.id ? (
                    <div className="flex gap-2">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                      <button onClick={() => { updateSection.mutate({ id: section.id, name: editName }); setEditingId(null); }} className="text-green-700 text-xs">حفظ</button>
                      <button onClick={() => setEditingId(null)} className="text-gray-500 text-xs">إلغاء</button>
                    </div>
                  ) : (
                    <span className="font-medium">{section.name}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${isBuiltinSection(section) ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                    {isBuiltinSection(section) ? "مدمج" : "مخصص"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => updateSection.mutate({ id: section.id, visible: section.visible ? 0 : 1 })} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${section.visible ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {section.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {section.visible ? "ظاهر" : "مخفي"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => { setEditingId(section.id); setEditName(section.name); }} className="text-blue-600 hover:text-blue-800 p-1"><Edit className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}

// ===== Columns Manager - Works for ALL built-in sections =====
function ColumnsManager() {
  const { data: sections, refetch, isLoading } = trpc.cms.getSections.useQuery();
  const builtinSections = useMemo(() => (sections ?? []).filter(isBuiltinSection), [sections]);
  const addColumn = trpc.cms.addColumn.useMutation({ onSuccess: () => { refetch(); toast.success("تم إضافة العمود"); } });
  const removeColumn = trpc.cms.removeColumn.useMutation({ onSuccess: () => { refetch(); toast.success("تم حذف العمود"); } });
  const renameColumn = trpc.cms.renameColumn.useMutation({ onSuccess: () => { refetch(); toast.success("تم تغيير الاسم"); } });

  const [selectedSection, setSelectedSection] = useState("");
  const [newColLabel, setNewColLabel] = useState("");
  const [newColType, setNewColType] = useState("text");
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const currentSection = sections?.find((s: any) => s.sectionKey === selectedSection);
  const extraColumns = (currentSection?.columns as any[]) || [];

  // Built-in column definitions for each section
  const builtInColumns: Record<string, { key: string; label: string }[]> = {
    "cases": [
      { key: "caseNumber", label: "رقم القضية" }, { key: "type", label: "نوع القضية" },
      { key: "employee", label: "الموظف المسؤول" }, { key: "authority", label: "الجهة" },
      { key: "subject", label: "الموضوع" }, { key: "damageAmount", label: "مبلغ الضرر" },
      { key: "currency", label: "العملة" }, { key: "caseStatus", label: "حالة القضية" },
      { key: "notes", label: "الملاحظات" },
    ],
    "compensation": [
      { key: "caseNumber", label: "رقم القضية" }, { key: "employee", label: "الموظف" },
      { key: "amount", label: "المبلغ" }, { key: "reason", label: "السبب" },
      { key: "status", label: "الحالة" }, { key: "notes", label: "الملاحظات" },
    ],
    "guarantees": [
      { key: "guaranteeNumber", label: "رقم الكفالة" }, { key: "guarantor", label: "الكفيل" },
      { key: "amount", label: "المبلغ" }, { key: "date", label: "التاريخ" },
      { key: "status", label: "الحالة" }, { key: "notes", label: "الملاحظات" },
    ],
    "investigation": [
      { key: "branch", label: "الفرع" }, { key: "caseNumber", label: "رقم القضية" },
      { key: "subject", label: "الموضوع" }, { key: "referredEmployee", label: "الموظف المحال" },
      { key: "employee", label: "الموظف المسؤول" }, { key: "actions", label: "الإجراءات" },
      { key: "notes", label: "الملاحظات" },
    ],
    "bank-properties": [
      { key: "propertyName", label: "اسم العقار" }, { key: "propertyNumber", label: "رقم العقار" },
      { key: "branch", label: "فرع المصرف" }, { key: "propertyType", label: "نوع العقار" },
      { key: "possessionStatus", label: "حالة الحيازة" }, { key: "location", label: "الموقع" },
      { key: "area", label: "المساحة" }, { key: "relatedCaseNumber", label: "رقم القضية" },
      { key: "employee", label: "الموظف المسؤول" }, { key: "notes", label: "الملاحظات" },
    ],
    "mortgaged-properties": [
      { key: "propertyName", label: "اسم العقار" }, { key: "propertyNumber", label: "رقم العقار" },
      { key: "branch", label: "فرع المصرف" }, { key: "ownerName", label: "المدين / المالك" },
      { key: "mortgageAmount", label: "مبلغ الرهن" }, { key: "currency", label: "العملة" },
      { key: "relatedCaseNumber", label: "رقم القضية" }, { key: "procedureStatus", label: "حالة الإجراء" },
      { key: "mortgageDate", label: "تاريخ الرهن" }, { key: "lastFollowup", label: "آخر متابعة" },
      { key: "location", label: "الموقع" }, { key: "employee", label: "الموظف المسؤول" },
      { key: "notes", label: "الملاحظات" },
    ],
    "forged-checks": [
      { key: "entity", label: "الفرع" }, { key: "complainant", label: "المشتكي" },
      { key: "notes", label: "المشكو منه" }, { key: "checkNumber", label: "رقم الصك" },
      { key: "amount", label: "جهة نظر الدعوى" }, { key: "employee", label: "الموظف المسؤول" },
      { key: "actions", label: "الإجراءات" },
    ],
    "general-files": [
      { key: "fileTitle", label: "عنوان الملف" }, { key: "fileCategory", label: "نوع الملف" },
      { key: "subject", label: "الموضوع" }, { key: "fileStatus", label: "الحالة" },
      { key: "relatedCaseNumber", label: "رقم القضية" }, { key: "lastFollowup", label: "آخر متابعة" },
      { key: "employee", label: "الموظف المسؤول" }, { key: "notes", label: "الملاحظات" },
    ],
  };

  // Filter out deleted columns and apply renames
  const deletedKeys = extraColumns.filter((c: any) => c._deleted).map((c: any) => c.key);
  const renamedMap = Object.fromEntries(extraColumns.filter((c: any) => c._renamed).map((c: any) => [c.key, c.label]));
  const allColumns = [
    ...(builtInColumns[selectedSection] || [])
      .filter(c => !deletedKeys.includes(c.key))
      .map(c => ({ ...c, label: renamedMap[c.key] || c.label, isBuiltIn: true })),
    ...extraColumns
      .filter((c: any) => !c._deleted && !c._renamed)
      .filter((c: any) => !(builtInColumns[selectedSection] || []).some(b => b.key === c.key))
      .map((c: any) => ({ key: c.key, label: c.label, type: c.type, isBuiltIn: false })),
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-green-800">إدارة أعمدة الأقسام</h2>
      <p className="text-sm text-gray-600">أضف أو احذف أو أعد تسمية أعمدة لأي قسم. الأعمدة المضافة تظهر تلقائياً في الجداول والنماذج.</p>

      <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} className="border rounded-lg px-4 py-2 w-full max-w-md" disabled={isLoading}>
        <option value="">{isLoading ? "جاري التحميل..." : "اختر القسم"}</option>
        {builtinSections.map((s: any) => (
          <option key={s.sectionKey} value={s.sectionKey}>{s.name}</option>
        ))}
      </select>
      {!isLoading && builtinSections.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">لا توجد أقسام مدمجة. أعد تشغيل السيرفر أو تحقق من جدول section_config في قاعدة البيانات.</p>
      )}

      {selectedSection && (
        <div className="space-y-4">
          {/* All columns display */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-medium mb-3">جميع أعمدة القسم ({allColumns.length} عمود):</h3>
            <div className="space-y-2">
              {allColumns.map((col) => (
                <div key={col.key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  {renamingCol === col.key ? (
                    <div className="flex gap-2 items-center">
                      <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                      <button onClick={() => { renameColumn.mutate({ sectionKey: selectedSection, columnKey: col.key, newLabel: renameValue }); setRenamingCol(null); }} className="text-green-700 text-xs font-medium">حفظ</button>
                      <button onClick={() => setRenamingCol(null)} className="text-gray-500 text-xs">إلغاء</button>
                    </div>
                  ) : (
                    <span>
                      {col.label}
                      {col.isBuiltIn && <span className="text-blue-500 text-xs mr-2">(أساسي)</span>}
                      {!col.isBuiltIn && <span className="text-purple-500 text-xs mr-2">(مضاف)</span>}
                    </span>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => { setRenamingCol(col.key); setRenameValue(col.label); }} className="text-blue-600 hover:text-blue-800" title="إعادة تسمية"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm("هل أنت متأكد من حذف/إخفاء هذا العمود؟")) removeColumn.mutate({ sectionKey: selectedSection, columnKey: col.key }); }} className="text-red-600 hover:text-red-800" title="حذف/إخفاء"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add new column */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <h3 className="font-medium text-green-800">إضافة عمود جديد</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} placeholder="اسم العمود (مثال: رقم الهاتف)" className="border rounded-lg px-3 py-2" />
              <select value={newColType} onChange={(e) => setNewColType(e.target.value)} className="border rounded-lg px-3 py-2">
                <option value="text">نص</option>
                <option value="number">رقم</option>
                <option value="date">تاريخ</option>
                <option value="textarea">نص طويل</option>
                <option value="select">قائمة اختيار</option>
              </select>
              <button onClick={() => {
                if (!newColLabel.trim()) { toast.error("أدخل اسم العمود"); return; }
                const key = "extra_" + newColLabel.replace(/\s+/g, "_").toLowerCase() + "_" + Date.now();
                addColumn.mutate({ sectionKey: selectedSection, column: { key, label: newColLabel, type: newColType } });
                setNewColLabel(""); setNewColType("text");
              }} className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800">إضافة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Built-in section field definitions (key → Arabic label) =====
const BUILTIN_SECTION_FIELDS: Record<string, { key: string; label: string }[]> = {
  "cases": [
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
  ],
  "compensation": [
    { key: "ministerialOrder", label: "الأمر الوزاري بالتضمين" },
    { key: "administrativeOrder", label: "الأمر الإداري بالتضمين" },
    { key: "investigativeCase", label: "القضية التحقيقية" },
    { key: "caseTitle", label: "عنوان القضية" },
    { key: "guarantorName", label: "اسم المضمن" },
    { key: "compensationAmount", label: "مبلغ التضمين" },
    { key: "paymentDetails", label: "تفاصيل التسديد" },
    { key: "lastActions", label: "آخر الإجراءات" },
    { key: "employee", label: "الموظف" },
  ],
  "guarantees": [
    { key: "debtorName", label: "اسم المدين" },
    { key: "guarantor", label: "الكفيل" },
    { key: "debtAmount", label: "مبلغ الدين" },
    { key: "paymentDetails", label: "تفاصيل التسديد" },
    { key: "lastActions", label: "آخر الإجراءات" },
    { key: "employee", label: "الموظف" },
  ],
  "investigation": [
    { key: "branch", label: "الفرع" },
    { key: "subject", label: "الموضوع" },
    { key: "caseNumber", label: "رقم القضية" },
    { key: "receivedDate", label: "تاريخ الاستلام" },
    { key: "completionDate", label: "تاريخ الإنجاز" },
    { key: "referredEmployee", label: "الموظف المحال عليه" },
    { key: "damage", label: "مبلغ الضرر" },
    { key: "currency", label: "العملة" },
    { key: "actions", label: "الإجراءات" },
    { key: "notes", label: "الملاحظات" },
    { key: "employee", label: "الموظف" },
  ],
  "bank-properties": [
    { key: "propertyName", label: "اسم العقار" },
    { key: "propertyNumber", label: "رقم العقار" },
    { key: "branch", label: "فرع المصرف" },
    { key: "propertyType", label: "نوع العقار" },
    { key: "possessionStatus", label: "حالة الحيازة" },
    { key: "location", label: "الموقع" },
    { key: "area", label: "المساحة" },
    { key: "relatedCaseNumber", label: "رقم القضية المرتبطة" },
    { key: "notes", label: "ملاحظات" },
    { key: "employee", label: "الموظف المسؤول" },
  ],
  "mortgaged-properties": [
    { key: "propertyName", label: "اسم العقار" },
    { key: "propertyNumber", label: "رقم العقار" },
    { key: "branch", label: "فرع المصرف" },
    { key: "ownerName", label: "اسم المدين / المالك" },
    { key: "mortgageAmount", label: "مبلغ الرهن" },
    { key: "currency", label: "العملة" },
    { key: "relatedCaseNumber", label: "رقم القضية / التحقيق" },
    { key: "procedureStatus", label: "حالة الإجراء" },
    { key: "mortgageDate", label: "تاريخ الرهن" },
    { key: "lastFollowup", label: "آخر متابعة" },
    { key: "location", label: "الموقع" },
    { key: "area", label: "المساحة" },
    { key: "notes", label: "ملاحظات" },
    { key: "employee", label: "الموظف المسؤول" },
  ],
  "general-files": [
    { key: "fileTitle", label: "عنوان الملف" },
    { key: "fileCategory", label: "نوع الملف" },
    { key: "subject", label: "الموضوع" },
    { key: "fileStatus", label: "الحالة" },
    { key: "relatedCaseNumber", label: "رقم القضية" },
    { key: "relatedInvestigationNumber", label: "رقم التحقيق" },
    { key: "receivedDate", label: "تاريخ الورود" },
    { key: "lastFollowup", label: "آخر متابعة" },
    { key: "lastActions", label: "آخر الإجراءات" },
    { key: "notes", label: "ملاحظات" },
    { key: "employee", label: "الموظف المسؤول" },
  ],
  "forged-checks": [
    { key: "entity", label: "الفرع" },
    { key: "complainant", label: "المشتكي" },
    { key: "notes", label: "المشكو منه" },
    { key: "checkNumber", label: "رقم الصك" },
    { key: "amount", label: "جهة نظر الدعوى" },
    { key: "checkDate", label: "التاريخ" },
    { key: "employee", label: "الموظف المسؤول" },
    { key: "status", label: "الحالة" },
    { key: "actions", label: "الإجراءات" },
  ],
};

// Auto-map Excel headers to DB keys by matching Arabic labels
function autoMapHeaders(headers: string[], sectionKey: string, sectionConfig: any): Record<string, string> {
  const mapping: Record<string, string> = {};
  const builtinFields = BUILTIN_SECTION_FIELDS[sectionKey] || [];
  // Also include renamed fields from section_config
  const configCols: { key: string; label: string }[] = (sectionConfig?.columns || [])
    .filter((c: any) => !c._deleted)
    .map((c: any) => ({ key: c.key, label: c.label }));
  const allFields = [...builtinFields, ...configCols];

  headers.forEach(header => {
    const trimmed = header.trim();
    // Try exact label match
    const exactMatch = allFields.find(f => f.label === trimmed || f.label.replace(/\s+/g, '') === trimmed.replace(/\s+/g, ''));
    if (exactMatch) { mapping[header] = exactMatch.key; return; }
    // Try key match directly (if user already uses English keys)
    const keyMatch = allFields.find(f => f.key === trimmed);
    if (keyMatch) { mapping[header] = keyMatch.key; return; }
    // Try partial match (label contains header or vice versa)
    const partialMatch = allFields.find(f => f.label.includes(trimmed) || trimmed.includes(f.label));
    if (partialMatch) { mapping[header] = partialMatch.key; }
  });
  return mapping;
}

// ===== Import Wizard - Works for ALL sections (built-in + custom) =====
function ImportWizard() {
  const { data: sections } = trpc.cms.getSections.useQuery();
  const { data: customSections } = trpc.customSections.list.useQuery();
  const importData = trpc.cms.importData.useMutation({
    onSuccess: (data: any) => {
      toast.success(`تم الاستيراد: ${data.count} | فشل: ${data.failed || 0}`);
      if (data.errors?.length) {
        const preview = data.errors.slice(0, 3).map((e: { message?: string }) => e.message || "خطأ غير معروف").join("؛ ");
        toast.error(`أخطاء الاستيراد (${data.errors.length}): ${preview}${data.errors.length > 3 ? "…" : ""}`);
      }
      setStep("select"); setParsedData(null);
    },
    onError: (err) => { toast.error(err.message); },
  });
  const importBuiltIn = trpc.cms.importBuiltIn.useMutation({
    onSuccess: (data: any) => {
      toast.success(`تم الاستيراد: ${data.count} | فشل: ${data.failed || 0} | تم تخطي: ${data.skipped || 0}`);
      if (data.errors?.length) toast.error(`أخطاء (عينة): ${data.errors[0].message}`);
      setStep("select"); setParsedData(null);
    },
    onError: (err) => { toast.error(err.message); },
  });

  const [step, setStep] = useState<"select" | "upload" | "map">("select");
  const [selectedTarget, setSelectedTarget] = useState<{ type: "builtin" | "custom"; key?: string; id?: number; name: string } | null>(null);
  const [parsedData, setParsedData] = useState<{ headers: string[]; records: any[]; count: number } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  // Get available target fields for the selected section
  const targetFields = useMemo(() => {
    if (!selectedTarget) return [];
    if (selectedTarget.type === "builtin" && selectedTarget.key) {
      const builtinFields = BUILTIN_SECTION_FIELDS[selectedTarget.key] || [];
      const sectionCfg = sections?.find((s: any) => s.sectionKey === selectedTarget.key);
      const configCols: { key: string; label: string }[] = ((sectionCfg?.columns as any[]) || [])
        .filter((c: any) => !c._deleted)
        .map((c: any) => ({ key: c.key, label: c.label }));
      // Apply renames from config
      const renamed = builtinFields.map((f: { key: string; label: string }) => {
        const override = ((sectionCfg?.columns as any[]) || []).find((c: any) => c.key === f.key && c._renamed);
        return override ? { ...f, label: override.label } : f;
      });
      return [...renamed, ...configCols.filter(c => !builtinFields.some(f => f.key === c.key))];
    }
    return [];
  }, [selectedTarget, sections]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = await apiFetch("/api/import-file", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
        body: buffer,
      });
      const data = await res.json();
      if (data.success) {
        setParsedData(data);
        // Auto-map headers based on section field labels
        if (selectedTarget?.type === "builtin" && selectedTarget.key) {
          const sectionCfg = sections?.find((s: any) => s.sectionKey === selectedTarget.key);
          const autoMap = autoMapHeaders(data.headers, selectedTarget.key, sectionCfg);
          setColumnMapping(autoMap);
        } else {
          setColumnMapping({});
        }
        setStep("map");
      } else {
        toast.error(data.error || "فشل في قراءة الملف");
      }
    } catch (err: any) {
      toast.error("خطأ في رفع الملف: " + err.message);
    }
    setUploading(false);
  };

  const handleImport = () => {
    if (!selectedTarget || !parsedData) return;
    const mappedRecords = parsedData.records.map(record => {
      const mapped: any = {};
      // Apply column mapping (Arabic header → DB key)
      Object.entries(columnMapping).forEach(([fileCol, targetField]) => {
        if (targetField && targetField !== "__skip__" && record[fileCol] !== undefined && record[fileCol] !== "") {
          mapped[targetField] = record[fileCol];
        }
      });
      // For unmapped columns that have no mapping set, skip them for built-in sections
      // (they would cause DB errors with Arabic key names)
      if (selectedTarget.type === "custom") {
        Object.keys(record).forEach(key => {
          if (!columnMapping[key] && record[key]) {
            mapped[key] = record[key];
          }
        });
      }
      return mapped;
    });

    if (selectedTarget.type === "custom" && selectedTarget.id) {
      importData.mutate({ sectionId: selectedTarget.id, records: mappedRecords });
    } else if (selectedTarget.type === "builtin" && selectedTarget.key) {
      importBuiltIn.mutate({ sectionKey: selectedTarget.key, records: mappedRecords });
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-green-800">استيراد بيانات من ملفات</h2>
      <p className="text-sm text-gray-600">ارفع ملف Excel (.xlsx) أو Word (.docx) واستورد البيانات لأي قسم (مدمج أو مخصص)</p>

      {step === "select" && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-medium">الخطوة 1: اختر القسم المستهدف</h3>
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-2">الأقسام المدمجة:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(sections ?? []).filter(isBuiltinSection).map((section: any) => (
                <button key={section.sectionKey} onClick={() => { setSelectedTarget({ type: "builtin", key: section.sectionKey, name: section.name }); setStep("upload"); }}
                  className="text-right px-4 py-3 border rounded-lg hover:bg-green-50 hover:border-green-300 transition-all">
                  <span className="font-medium">{section.name}</span>
                  <span className="text-blue-500 text-xs mr-2">(مدمج)</span>
                </button>
              ))}
            </div>
          </div>
          {customSections && customSections.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">الأقسام المخصصة:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {customSections.map((section: any) => (
                  <button key={section.id} onClick={() => { setSelectedTarget({ type: "custom", id: section.id, name: section.name }); setStep("upload"); }}
                    className="text-right px-4 py-3 border rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-all">
                    <span className="font-medium">{section.name}</span>
                    <span className="text-purple-500 text-xs mr-2">(مخصص)</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === "upload" && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-medium">الخطوة 2: ارفع الملف</h3>
          <p className="text-sm text-gray-500">القسم المختار: <strong>{selectedTarget?.name}</strong></p>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600 mb-3">اسحب الملف هنا أو اضغط لاختيار ملف</p>
            <input type="file" accept=".xlsx,.xls,.docx,.doc" onChange={handleFileUpload} className="mx-auto" disabled={uploading} />
            {uploading && <p className="text-green-700 mt-3">جاري قراءة الملف...</p>}
          </div>
          <button onClick={() => { setStep("select"); setSelectedTarget(null); }} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">رجوع</button>
        </div>
      )}

      {step === "map" && parsedData && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-medium">الخطوة 3: مطابقة الأعمدة</h3>
          <p className="text-sm text-gray-500">تم قراءة {parsedData.count} سجل و {parsedData.headers.length} عمود</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <strong>تعليمات:</strong> طابق كل عمود من الملف مع الحقل المناسب في النظام. الأعمدة المعلّمة بـ ✓ تم ربطها تلقائياً. اختر "تجاهل" لتخطي عمود.
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {parsedData.headers.map((header) => {
              const mapped = columnMapping[header];
              const isAutoMapped = mapped && mapped !== "__skip__" && mapped !== header;
              return (
                <div key={header} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isAutoMapped ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <span className="font-medium min-w-[160px] text-sm">
                    {isAutoMapped && <span className="text-green-600 ml-1">✓</span>}
                    {header}
                  </span>
                  <span className="text-gray-400">←</span>
                  {selectedTarget?.type === "builtin" && targetFields.length > 0 ? (
                    <select
                      value={columnMapping[header] || ""}
                      onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                      className="border rounded-lg px-3 py-1 flex-1 text-sm bg-white"
                    >
                      <option value="">-- اختر الحقل --</option>
                      <option value="__skip__">تجاهل هذا العمود</option>
                      {targetFields.map(f => (
                        <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={columnMapping[header] || header}
                      onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                      className="border rounded-lg px-3 py-1 flex-1 text-sm"
                      placeholder="اسم الحقل في النظام"
                    />
                  )}
                </div>
              );
            })}
          </div>
          {parsedData.records.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-sm mb-2">معاينة أول 3 سجلات:</h4>
              <div className="overflow-x-auto">
                <table className="text-xs border w-full">
                  <thead><tr className="bg-gray-100">{parsedData.headers.map(h => <th key={h} className="px-2 py-1 border">{h}</th>)}</tr></thead>
                  <tbody>{parsedData.records.slice(0, 3).map((r, i) => (<tr key={i}>{parsedData.headers.map(h => <td key={h} className="px-2 py-1 border">{r[h]}</td>)}</tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={importData.isPending || importBuiltIn.isPending} className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
              {(importData.isPending || importBuiltIn.isPending) ? "جاري الاستيراد..." : `استيراد ${parsedData.count} سجل`}
            </button>
            <button onClick={() => { setStep("upload"); setParsedData(null); }} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">رجوع</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Case Types Manager =====
function CaseTypesManager() {
  const { data: caseTypes, refetch } = trpc.customCaseTypes.list.useQuery();
  const createType = trpc.customCaseTypes.create.useMutation({ onSuccess: () => { refetch(); toast.success("تم إضافة النوع"); setNewTypeName(""); } });
  const deleteType = trpc.customCaseTypes.delete.useMutation({ onSuccess: () => { refetch(); toast.success("تم الحذف"); } });
  const [newTypeName, setNewTypeName] = useState("");
  const defaultTypes = ["نزاهة", "جزائية", "مدنية", "نزاهة محسومة", "جزائية محسومة", "مدنية محسومة"];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-green-800">أنواع القضايا</h2>
      <p className="text-sm text-gray-600">أضف أنواع قضايا جديدة تظهر تلقائياً في الفلاتر والقوائم</p>
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-medium mb-3">الأنواع الأساسية (مدمجة):</h3>
        <div className="flex flex-wrap gap-2">
          {defaultTypes.map(t => (<span key={t} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{t}</span>))}
        </div>
      </div>
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-medium mb-3">أنواع مخصصة:</h3>
        {(!caseTypes || caseTypes.length === 0) ? (
          <p className="text-gray-500 text-sm">لم تتم إضافة أنواع مخصصة بعد</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {caseTypes?.map((ct: any) => (
              <span key={ct.id} className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                {ct.name}
                <button onClick={() => { if (confirm("حذف هذا النوع؟")) deleteType.mutate({ id: ct.id }); }} className="text-red-500 hover:text-red-700"><Trash2 className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="اسم النوع الجديد (مثال: تجارية)" className="flex-1 border rounded-lg px-3 py-2" onKeyDown={(e) => { if (e.key === "Enter" && newTypeName.trim()) createType.mutate({ name: newTypeName.trim() }); }} />
          <button onClick={() => { if (newTypeName.trim()) createType.mutate({ name: newTypeName.trim() }); }} disabled={!newTypeName.trim() || createType.isPending} className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">إضافة</button>
        </div>
      </div>
    </div>
  );
}

// ===== Appearance Manager (Logo + Theme) =====
function AppearanceManager() {
  const { data: settings, refetch } = trpc.cms.getSettings.useQuery();
  const updateSettings = trpc.cms.updateSettings.useMutation({ onSuccess: () => { refetch(); toast.success("تم حفظ الإعدادات - أعد تحميل الصفحة لرؤية التغييرات"); } });
  const [uploading, setUploading] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#15803d");
  const [accentColor, setAccentColor] = useState("#b8860b");
  const [fontFamily, setFontFamily] = useState("Cairo");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (settings) {
      setPrimaryColor(settings.primaryColor || "#15803d");
      setAccentColor(settings.accentColor || "#b8860b");
      setFontFamily(settings.fontFamily || "Cairo");
      setDarkMode(settings.darkMode || false);
    }
  }, [settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = await apiFetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
        body: buffer,
      });
      const data = await res.json();
      if (data.url) {
        updateSettings.mutate({ logoUrl: data.url });
        toast.success("تم تحديث الشعار");
      }
    } catch (err: any) {
      toast.error("خطأ في رفع الشعار: " + err.message);
    }
    setUploading(false);
  };

  const handleSaveTheme = () => {
    updateSettings.mutate({ primaryColor, accentColor, fontFamily, darkMode });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-green-800">المظهر والشعار</h2>
      <p className="text-sm text-gray-600">غيّر شعار التطبيق والألوان والخطوط والثيم من هنا</p>

      {/* Logo Upload */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h3 className="font-bold text-green-800 flex items-center gap-2"><Image className="w-5 h-5" /> تغيير الشعار</h3>
        <div className="flex items-center gap-6">
          {settings?.logoUrl && (
            <img src={settings.logoUrl} alt="الشعار الحالي" className="w-20 h-20 object-contain rounded-lg border" />
          )}
          <div>
            <p className="text-sm text-gray-600 mb-2">ارفع صورة جديدة (PNG أو JPG) لتغيير الشعار في كل مكان</p>
            <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} />
            {uploading && <p className="text-green-700 text-sm mt-1">جاري الرفع...</p>}
          </div>
        </div>
      </div>

      {/* Theme Settings */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h3 className="font-bold text-green-800 flex items-center gap-2"><Palette className="w-5 h-5" /> إعدادات الثيم</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">اللون الرئيسي</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
              <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="border rounded px-3 py-1 text-sm w-28" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">اللون الثانوي (ذهبي)</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
              <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="border rounded px-3 py-1 text-sm w-28" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الخط</label>
            <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="border rounded-lg px-3 py-2 w-full">
              <option value="Cairo">Cairo</option>
              <option value="Tajawal">Tajawal</option>
              <option value="Almarai">Almarai</option>
              <option value="Noto Kufi Arabic">Noto Kufi Arabic</option>
              <option value="IBM Plex Sans Arabic">IBM Plex Sans Arabic</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الوضع</label>
            <div className="flex gap-3">
              <button onClick={() => setDarkMode(false)} className={`px-4 py-2 rounded-lg border ${!darkMode ? "bg-green-700 text-white" : "bg-gray-100"}`}>فاتح</button>
              <button onClick={() => setDarkMode(true)} className={`px-4 py-2 rounded-lg border ${darkMode ? "bg-green-700 text-white" : "bg-gray-100"}`}>داكن</button>
            </div>
          </div>
        </div>
        <div className="border rounded-lg p-4 mt-4" style={{ backgroundColor: darkMode ? "#1a1a2e" : "#f9fafb", color: darkMode ? "#fff" : "#111" }}>
          <p className="text-sm mb-2">معاينة:</p>
          <div className="flex gap-3 items-center">
            <div className="w-8 h-8 rounded" style={{ backgroundColor: primaryColor }}></div>
            <div className="w-8 h-8 rounded" style={{ backgroundColor: accentColor }}></div>
            <span style={{ fontFamily }}>نص تجريبي بالخط المختار</span>
          </div>
        </div>
        <button onClick={handleSaveTheme} disabled={updateSettings.isPending} className="px-6 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
          {updateSettings.isPending ? "جاري الحفظ..." : "حفظ إعدادات الثيم"}
        </button>
      </div>
    </div>
  );
}
