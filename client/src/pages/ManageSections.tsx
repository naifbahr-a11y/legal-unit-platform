import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageUsers } from "@shared/userRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, FolderPlus, Tag } from "lucide-react";
import { toast } from "sonner";

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "date" | "number" | "select";
  showInTable: boolean;
  options?: string[];
};

export default function ManageSections() {
  const { user } = useAuth();
  const allowed = !!user && canManageUsers(user.role);
  const { data: sections, isLoading } = trpc.customSections.list.useQuery(undefined, { enabled: allowed });
  const { data: caseTypes } = trpc.customCaseTypes.list.useQuery(undefined, { enabled: allowed });
  const utils = trpc.useUtils();

  // Section creation state
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldDef["type"]>("text");
  const [newFieldShowInTable, setNewFieldShowInTable] = useState(true);
  const [newFieldOptions, setNewFieldOptions] = useState("");

  // Case type creation state
  const [newCaseType, setNewCaseType] = useState("");

  const createSection = trpc.customSections.create.useMutation({
    onSuccess: () => {
      utils.customSections.list.invalidate();
      setShowCreateSection(false);
      setSectionName("");
      setFields([]);
      toast.success("تم إنشاء القسم بنجاح");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteSection = trpc.customSections.delete.useMutation({
    onSuccess: () => {
      utils.customSections.list.invalidate();
      toast.success("تم حذف القسم");
    },
  });

  const createCaseType = trpc.customCaseTypes.create.useMutation({
    onSuccess: () => {
      utils.customCaseTypes.list.invalidate();
      setNewCaseType("");
      toast.success("تم إضافة نوع القضية");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCaseType = trpc.customCaseTypes.delete.useMutation({
    onSuccess: () => {
      utils.customCaseTypes.list.invalidate();
      toast.success("تم حذف نوع القضية");
    },
  });

  const addField = () => {
    if (!newFieldLabel.trim()) return;
    const key = newFieldLabel.trim().replace(/\s+/g, "_").toLowerCase() + "_" + Date.now();
    const field: FieldDef = {
      key,
      label: newFieldLabel.trim(),
      type: newFieldType,
      showInTable: newFieldShowInTable,
    };
    if (newFieldType === "select" && newFieldOptions.trim()) {
      field.options = newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean);
    }
    setFields([...fields, field]);
    setNewFieldLabel("");
    setNewFieldOptions("");
  };

  const removeField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx));
  };

  const handleCreateSection = () => {
    if (!sectionName.trim() || fields.length === 0) {
      toast.error("يرجى إدخال اسم القسم وإضافة حقل واحد على الأقل");
      return;
    }
    const slug = sectionName.trim().replace(/\s+/g, "-").toLowerCase() + "-" + Date.now();
    createSection.mutate({ name: sectionName.trim(), slug, fields });
  };

  if (!allowed) {
    return <div className="p-8 text-center text-red-600">ليس لديك صلاحية الوصول لهذه الصفحة</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-8">
      <h1 className="text-2xl font-bold text-green-800">إدارة الأقسام وأنواع القضايا</h1>

      {/* Section 1: Custom Sections */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-green-700" />
            الأقسام المخصصة
          </h2>
          <Button size="sm" onClick={() => setShowCreateSection(!showCreateSection)}>
            <Plus className="w-4 h-4 ml-1" /> إنشاء قسم جديد
          </Button>
        </div>

        {/* Create Section Form */}
        {showCreateSection && (
          <div className="border rounded-lg p-4 mb-4 bg-green-50/50">
            <h3 className="font-semibold mb-3">إنشاء قسم جديد</h3>
            <div className="mb-4">
              <label className="text-sm font-medium block mb-1">اسم القسم</label>
              <Input
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="مثال: العقود التجارية"
              />
            </div>

            {/* Fields list */}
            <div className="mb-4">
              <label className="text-sm font-medium block mb-2">الحقول ({fields.length})</label>
              {fields.length > 0 && (
                <div className="space-y-2 mb-3">
                  {fields.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white rounded p-2 border text-sm">
                      <span className="font-medium">{f.label}</span>
                      <span className="text-gray-500">({f.type})</span>
                      {f.showInTable && <span className="text-xs bg-green-100 text-green-700 px-1 rounded">يظهر بالجدول</span>}
                      {f.options && <span className="text-xs text-gray-400">خيارات: {f.options.join(", ")}</span>}
                      <Button size="sm" variant="ghost" className="mr-auto text-red-500" onClick={() => removeField(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add field form */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                <div>
                  <label className="text-xs text-gray-600">اسم الحقل</label>
                  <Input
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    placeholder="مثال: رقم العقد"
                    onKeyDown={(e) => { if (e.key === "Enter") addField(); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">النوع</label>
                  <select
                    className="w-full border rounded p-2 text-sm"
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as FieldDef["type"])}
                  >
                    <option value="text">نص</option>
                    <option value="textarea">نص طويل</option>
                    <option value="date">تاريخ</option>
                    <option value="number">رقم</option>
                    <option value="select">قائمة اختيار</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">يظهر بالجدول</label>
                  <select
                    className="w-full border rounded p-2 text-sm"
                    value={newFieldShowInTable ? "yes" : "no"}
                    onChange={(e) => setNewFieldShowInTable(e.target.value === "yes")}
                  >
                    <option value="yes">نعم</option>
                    <option value="no">لا</option>
                  </select>
                </div>
                {newFieldType === "select" && (
                  <div>
                    <label className="text-xs text-gray-600">الخيارات (مفصولة بفاصلة)</label>
                    <Input
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      placeholder="خيار1, خيار2, خيار3"
                    />
                  </div>
                )}
                <Button size="sm" onClick={addField}>
                  <Plus className="w-3 h-3 ml-1" /> إضافة حقل
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreateSection} disabled={createSection.isPending}>
                إنشاء القسم
              </Button>
              <Button variant="outline" onClick={() => { setShowCreateSection(false); setSectionName(""); setFields([]); }}>
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {/* Existing Sections List */}
        {isLoading ? (
          <p className="text-gray-500">جاري التحميل...</p>
        ) : !sections || sections.length === 0 ? (
          <p className="text-gray-500 text-sm">لا توجد أقسام مخصصة بعد. أنشئ قسماً جديداً للبدء.</p>
        ) : (
          <div className="space-y-2">
            {sections.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-3 border rounded hover:bg-gray-50">
                <div>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-gray-500 mr-2">
                    ({(s.fields as any[])?.length || 0} حقول)
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => {
                    if (confirm(`هل أنت متأكد من حذف القسم "${s.name}"؟ سيتم حذف جميع السجلات المرتبطة.`)) {
                      deleteSection.mutate({ id: s.id });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Custom Case Types */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-green-700" />
          أنواع القضايا المخصصة
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          أضف أنواع قضايا جديدة تظهر تلقائياً في فلاتر سجل القضايا وقوائم الاختيار.
        </p>

        {/* Add case type */}
        <div className="flex gap-2 mb-4">
          <Input
            value={newCaseType}
            onChange={(e) => setNewCaseType(e.target.value)}
            placeholder="اسم نوع القضية الجديد (مثال: تجارية)"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCaseType.trim()) {
                createCaseType.mutate({ name: newCaseType.trim() });
              }
            }}
          />
          <Button
            onClick={() => { if (newCaseType.trim()) createCaseType.mutate({ name: newCaseType.trim() }); }}
            disabled={createCaseType.isPending || !newCaseType.trim()}
          >
            <Plus className="w-4 h-4 ml-1" /> إضافة
          </Button>
        </div>

        {/* Existing case types */}
        {!caseTypes || caseTypes.length === 0 ? (
          <p className="text-gray-500 text-sm">لا توجد أنواع مخصصة بعد. الأنواع الافتراضية (نزاهة، جزائية، مدنية...) متاحة دائماً.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {caseTypes.map((ct: any) => (
              <div key={ct.id} className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-3 py-1 text-sm">
                <span>{ct.name}</span>
                <button
                  className="text-red-500 hover:text-red-700 mr-1"
                  onClick={() => {
                    if (confirm(`حذف نوع "${ct.name}"؟`)) deleteCaseType.mutate({ id: ct.id });
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
