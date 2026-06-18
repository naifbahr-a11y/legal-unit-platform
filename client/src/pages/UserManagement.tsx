import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  UserPlus, Edit, Key, Shield, Users, Search, Download, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { MobileDataCards } from "@/components/MobileDataCards";
import {
  PERMISSION_GROUPS,
  buildDefaultPermissionsState,
  countEnabledPermissions,
} from "@shared/userPermissions";
import { USER_ROLE_LABELS, canManageUsers, hasFullAccess, type UserRole } from "@shared/userRoles";
import { getPlatformBranches, getBranchDisplayLabel } from "@shared/branchUtils";
import { brandedExcelFileName, exportBrandedExcel } from "@/lib/brandedExcelExport";

const PASSWORD_MIN_LENGTH = 8;

function passwordStrengthLabel(password: string): { label: string; color: string } {
  if (password.length < PASSWORD_MIN_LENGTH) return { label: "ضعيفة", color: "text-red-600" };
  let score = 0;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  if (score >= 4) return { label: "قوية", color: "text-green-700" };
  if (score >= 2) return { label: "متوسطة", color: "text-amber-700" };
  return { label: "ضعيفة", color: "text-red-600" };
}

function roleBadgeClass(role: string): string {
  if (role === "admin") return "bg-green-100 text-green-800";
  if (role === "supervisor") return "bg-purple-100 text-purple-800";
  return "bg-blue-100 text-blue-800";
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [resetPassUser, setResetPassUser] = useState<any>(null);
  const [permissionsUser, setPermissionsUser] = useState<any>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data: users, isLoading, isError, refetch } = trpc.users.listFull.useQuery();
  const { data: userDetail, isLoading: detailLoading } = trpc.users.getDetail.useQuery(
    { id: detailUserId! },
    { enabled: detailUserId != null },
  );
  const utils = trpc.useUtils();

  const privilegedCount = useMemo(
    () => (users ?? []).filter((u: any) => hasFullAccess(u.role) && Number(u.active) !== 0).length,
    [users],
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter((u: any) =>
      [u.displayName, u.username, u.specialization, u.jobTitle, u.phone, u.branch]
        .some((v) => v && String(v).toLowerCase().includes(q)),
    );
  }, [users, search]);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, page]);

  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.listFull.invalidate();
      setAddDialogOpen(false);
      toast.success("تمت إضافة المستخدم بنجاح");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateUser = trpc.users.update.useMutation({
    onSuccess: () => {
      utils.users.listFull.invalidate();
      if (detailUserId) utils.users.getDetail.invalidate({ id: detailUserId });
      setEditUser(null);
      setPermissionsUser(null);
      toast.success("تم تحديث البيانات بنجاح");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetPassword = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      setResetPassUser(null);
      toast.success("تم تغيير كلمة المرور بنجاح");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleExport = async () => {
    try {
      if (!filteredUsers.length) {
        toast.error("لا توجد بيانات للتصدير");
        return;
      }
      const columns = [
        { key: "username", label: "اسم المستخدم" },
        { key: "displayName", label: "الاسم الظاهر" },
        { key: "roleLabel", label: "الدور" },
        { key: "branch", label: "الفرع" },
        { key: "specialization", label: "التخصص" },
        { key: "jobTitle", label: "المسمى الوظيفي" },
        { key: "phone", label: "الهاتف" },
        { key: "activeLabel", label: "الحالة" },
      ];
      const rows = filteredUsers.map((u: any) => ({
        username: u.username || "",
        displayName: u.displayName || "",
        roleLabel: USER_ROLE_LABELS[u.role as UserRole] || u.role || "",
        branch: u.branch || "",
        specialization: u.specialization || "",
        jobTitle: u.jobTitle || "",
        phone: u.phone || "",
        activeLabel: Number(u.active) !== 0 ? "نشط" : "معطّل",
      }));
      await exportBrandedExcel({
        sectionTitle: "قائمة المستخدمين",
        sheetName: "المستخدمون",
        fileName: brandedExcelFileName("users"),
        columns,
        rows,
        filtersSummary: search ? `بحث: ${search}` : undefined,
        exportedBy: currentUser?.displayName ?? currentUser?.username,
      });
      toast.success("تم تصدير قائمة المستخدمين");
    } catch (err: any) {
      toast.error(err.message || "فشل التصدير");
    }
  };

  const toggleActive = (u: any) => {
    const next = Number(u.active) === 0 ? 1 : 0;
    if (next === 0 && hasFullAccess(u.role) && privilegedCount <= 1) {
      toast.error("لا يمكن تعطيل آخر مدير/إداري نشط في النظام");
      return;
    }
    updateUser.mutate({ id: u.id, active: next });
  };

  if (!currentUser || !canManageUsers(currentUser.role)) {
    return <div className="text-center p-8 text-muted-foreground">ليس لديك صلاحية الوصول لهذه الصفحة</div>;
  }

  return (
    <div className="space-y-6">
      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-red-700">تعذّر تحميل قائمة المستخدمين.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Users className="h-5 w-5" />
          إدارة المستخدمين
          <Badge variant="secondary" className="font-normal">{filteredUsers.length} مستخدم</Badge>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو اسم المستخدم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 ml-1" /> تصدير Excel
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-700 hover:bg-green-800">
                <UserPlus className="h-4 w-4 ml-1" /> إضافة مستخدم
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>إضافة مستخدم جديد</DialogTitle>
              </DialogHeader>
              <AddUserForm onSubmit={(data: any) => createUser.mutate(data)} isLoading={createUser.isPending} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <MobileDataCards
        records={paginatedUsers as Record<string, unknown>[]}
        isLoading={isLoading}
        emptyMessage="لا يوجد مستخدمون"
        titleKey="displayName"
        subtitleKey="username"
        headerExtra={(u) => (
          <div className="flex flex-wrap gap-1 mt-2">
            <Badge className={roleBadgeClass(String(u.role))}>
              {USER_ROLE_LABELS[u.role as UserRole] ?? u.role}
            </Badge>
            {Number(u.active) === 0 && (
              <Badge variant="destructive" className="text-xs">معطّل</Badge>
            )}
            {u.role === "user" && (
              <Badge variant="outline" className="text-xs">
                {countEnabledPermissions(u.permissions)} صلاحية
              </Badge>
            )}
          </div>
        )}
        fields={[
          { key: "branch", label: "الفرع", render: (v) => String(v || "—") },
          { key: "specialization", label: "التخصص", render: (v) => String(v || "—") },
          { key: "jobTitle", label: "العنوان الوظيفي", render: (v) => String(v || "—") },
          { key: "phone", label: "الهاتف", render: (v) => String(v || "—") },
          {
            key: "lastSignedIn",
            label: "آخر دخول",
            render: (v) => (v ? new Date(String(v)).toLocaleDateString("ar-IQ") : "—"),
          },
        ]}
        renderActions={(u) => (
          <>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetailUserId(u.id as number)}>
              <Eye className="h-3.5 w-3.5 ml-1" /> تفاصيل
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditUser(u)}>
              <Edit className="h-3.5 w-3.5 ml-1" /> تعديل
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setResetPassUser(u)}>
              <Key className="h-3.5 w-3.5 ml-1" /> كلمة المرور
            </Button>
            {u.role === "user" && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPermissionsUser(u)}>
                <Shield className="h-3.5 w-3.5 ml-1" /> الصلاحيات
              </Button>
            )}
          </>
        )}
      />

      <Card>
        <CardContent className="p-0 overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-green-800 text-white">
              <tr>
                <th className="p-3 text-right font-medium">الاسم</th>
                <th className="p-3 text-right font-medium">اسم المستخدم</th>
                <th className="p-3 text-right font-medium">الدور</th>
                <th className="p-3 text-right font-medium">الحالة</th>
                <th className="p-3 text-right font-medium">الصلاحيات</th>
                <th className="p-3 text-right font-medium">الفرع</th>
                <th className="p-3 text-right font-medium">آخر دخول</th>
                <th className="p-3 text-right font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="p-8 text-center text-red-600">فشل التحميل — <button type="button" className="underline" onClick={() => refetch()}>إعادة المحاولة</button></td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا يوجد مستخدمون مطابقون للبحث</td></tr>
              ) : (
                paginatedUsers.map((u: any) => (
                  <tr key={u.id} className={`border-b hover:bg-muted/30 ${Number(u.active) === 0 ? "opacity-60" : ""}`}>
                    <td className="p-3 font-medium">{u.displayName}</td>
                    <td className="p-3 font-mono text-sm" dir="ltr">{u.username}</td>
                    <td className="p-3">
                      <Badge className={roleBadgeClass(u.role)}>
                        {USER_ROLE_LABELS[u.role as UserRole] ?? u.role}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Number(u.active) !== 0}
                          onCheckedChange={() => toggleActive(u)}
                          disabled={u.id === currentUser?.id}
                        />
                        <span className="text-xs">{Number(u.active) !== 0 ? "نشط" : "معطّل"}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {hasFullAccess(u.role)
                        ? "صلاحيات مطلقة"
                        : `${countEnabledPermissions(u.permissions)} قسم`}
                    </td>
                    <td className="p-3 text-xs">{u.branch || "—"}</td>
                    <td className="p-3 text-xs">{u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("ar-IQ") : "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="تفاصيل" onClick={() => setDetailUserId(u.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="تعديل" onClick={() => setEditUser(u)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="كلمة المرور" onClick={() => setResetPassUser(u)}>
                          <Key className="h-3.5 w-3.5" />
                        </Button>
                        {u.role === "user" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="الصلاحيات" onClick={() => setPermissionsUser(u)}>
                            <Shield className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {filteredUsers.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {filteredUsers.length.toLocaleString()} مستخدم — صفحة {page} من {totalPages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>التالي</Button>
          </div>
        </div>
      )}

      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيانات {editUser?.displayName}</DialogTitle>
          </DialogHeader>
          {editUser && (
            <EditUserForm
              user={editUser}
              privilegedCount={privilegedCount}
              currentUserId={currentUser?.id}
              onSubmit={(data: any) => updateUser.mutate({ id: editUser.id, ...data })}
              isLoading={updateUser.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetPassUser} onOpenChange={(open) => { if (!open) setResetPassUser(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تغيير كلمة مرور {resetPassUser?.displayName}</DialogTitle>
          </DialogHeader>
          {resetPassUser && (
            <ResetPasswordForm
              onSubmit={(password: string) => resetPassword.mutate({ id: resetPassUser.id, newPassword: password })}
              isLoading={resetPassword.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!permissionsUser} onOpenChange={(open) => { if (!open) setPermissionsUser(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>صلاحيات {permissionsUser?.displayName}</DialogTitle>
          </DialogHeader>
          {permissionsUser && (
            <PermissionsForm
              user={permissionsUser}
              onSubmit={(perms: Record<string, boolean>) => updateUser.mutate({ id: permissionsUser.id, permissions: perms })}
              isLoading={updateUser.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={detailUserId != null} onOpenChange={(open) => { if (!open) setDetailUserId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل المستخدم</DialogTitle>
          </DialogHeader>
          {detailLoading || !userDetail ? (
            <p className="text-center text-muted-foreground py-6">جاري التحميل...</p>
          ) : (
            <UserDetailPanel user={userDetail.user} activity={userDetail.activity} stats={userDetail.stats} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserDetailPanel({ user, activity, stats }: { user: any; activity: any[]; stats: any }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div><span className="text-muted-foreground">الاسم:</span> {user.displayName}</div>
        <div><span className="text-muted-foreground">المستخدم:</span> <span dir="ltr">{user.username}</span></div>
        <div><span className="text-muted-foreground">الدور:</span> {USER_ROLE_LABELS[user.role as UserRole] ?? user.role}</div>
        <div><span className="text-muted-foreground">الفرع:</span> {user.branch || "—"}</div>
        <div><span className="text-muted-foreground">الحالة:</span> {Number(user.active) !== 0 ? "نشط" : "معطّل"}</div>
        <div><span className="text-muted-foreground">آخر دخول:</span> {user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleString("ar-IQ") : "—"}</div>
      </div>
      <div className="border rounded-lg p-3 bg-muted/30">
        <h4 className="font-semibold mb-2">إحصائيات السجلات</h4>
        <div className="flex gap-4 text-xs">
          <span>قضايا: <strong>{stats.cases}</strong></span>
          <span>مراسلات: <strong>{stats.correspondence}</strong></span>
          <span>مواعيد: <strong>{stats.appointments}</strong></span>
        </div>
      </div>
      <div>
        <h4 className="font-semibold mb-2">آخر النشاطات</h4>
        {activity.length === 0 ? (
          <p className="text-muted-foreground text-xs">لا يوجد نشاط مسجّل</p>
        ) : (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {activity.map((a: any) => (
              <li key={a.id} className="text-xs border-b pb-1">
                <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleString("ar-IQ")}</span>
                {" — "}{a.details || a.action}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const platformBranches = getPlatformBranches();

function BranchSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— بدون فرع —</SelectItem>
        {platformBranches.map((b) => (
          <SelectItem key={b.id} value={b.name}>{getBranchDisplayLabel(b)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddUserForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({
    username: "", password: "", displayName: "", role: "user" as UserRole,
    specialization: "", jobTitle: "", phone: "", branch: "",
  });
  const strength = passwordStrengthLabel(form.password);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < PASSWORD_MIN_LENGTH) {
      toast.error(`كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`);
      return;
    }
    onSubmit(form);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>اسم المستخدم (للدخول)</Label>
        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required dir="ltr" />
      </div>
      <div className="space-y-2">
        <Label>كلمة المرور ({PASSWORD_MIN_LENGTH} أحرف على الأقل — حرف ورقم)</Label>
        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={PASSWORD_MIN_LENGTH} dir="ltr" />
        {form.password && <p className={`text-xs ${strength.color}`}>قوة كلمة المرور: {strength.label}</p>}
      </div>
      <div className="space-y-2">
        <Label>الاسم الكامل</Label>
        <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
      </div>
      <div className="space-y-2">
        <Label>الدور</Label>
        <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="user">موظف قانوني</SelectItem>
            <SelectItem value="supervisor">إداري</SelectItem>
            <SelectItem value="admin">مدير</SelectItem>
          </SelectContent>
        </Select>
        {form.role === "user" && (
          <p className="text-xs text-muted-foreground">الموظف القانوني يحصل على صلاحيات افتراضية يمكن تخصيصها لاحقاً.</p>
        )}
        {hasFullAccess(form.role) && (
          <p className="text-xs text-green-700">المدير والإداري لديهما صلاحيات مطلقة على النظام.</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>الفرع</Label>
        <BranchSelect value={form.branch} onChange={(branch) => setForm({ ...form, branch })} />
      </div>
      <div className="space-y-2">
        <Label>التخصص</Label>
        <Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>العنوان الوظيفي</Label>
        <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>الهاتف</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
      </div>
      <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={isLoading}>
        {isLoading ? "جاري الإضافة..." : "إضافة"}
      </Button>
    </form>
  );
}

function EditUserForm({
  user,
  privilegedCount,
  currentUserId,
  onSubmit,
  isLoading,
}: {
  user: any;
  privilegedCount: number;
  currentUserId?: number;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    displayName: user.displayName || "",
    role: user.role || "user",
    specialization: user.specialization || "",
    jobTitle: user.jobTitle || "",
    phone: user.phone || "",
    branch: user.branch || "",
  });

  const isLastPrivileged = hasFullAccess(user.role) && privilegedCount <= 1;
  const cannotDemote = isLastPrivileged && form.role === "user";

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (cannotDemote) { toast.error("لا يمكن إزالة آخر مدير/إداري في النظام"); return; }
      onSubmit(form);
    }} className="space-y-4">
      <div className="space-y-2">
        <Label>الاسم الكامل</Label>
        <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>الدور</Label>
        <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })} disabled={isLastPrivileged}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="user">موظف قانوني</SelectItem>
            <SelectItem value="supervisor">إداري</SelectItem>
            <SelectItem value="admin">مدير</SelectItem>
          </SelectContent>
        </Select>
        {isLastPrivileged && (
          <p className="text-xs text-amber-700">هذا آخر مدير/إداري نشط — لا يمكن تغيير دوره.</p>
        )}
        {user.id === currentUserId && hasFullAccess(user.role) && !isLastPrivileged && (
          <p className="text-xs text-muted-foreground">تنبيه: أنت تعدّل حسابك الحالي.</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>الفرع</Label>
        <BranchSelect value={form.branch} onChange={(branch) => setForm({ ...form, branch })} />
      </div>
      <div className="space-y-2">
        <Label>التخصص</Label>
        <Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>العنوان الوظيفي</Label>
        <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>الهاتف</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
      </div>
      <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={isLoading || cannotDemote}>
        {isLoading ? "جاري الحفظ..." : "حفظ التعديلات"}
      </Button>
    </form>
  );
}

function ResetPasswordForm({ onSubmit, isLoading }: { onSubmit: (password: string) => void; isLoading: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const strength = passwordStrengthLabel(password);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (password.length < PASSWORD_MIN_LENGTH) {
        toast.error(`كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`);
        return;
      }
      if (password !== confirm) { toast.error("كلمتا المرور غير متطابقتين"); return; }
      onSubmit(password);
    }} className="space-y-4">
      <p className="text-xs text-amber-700">سيُطلب من المستخدم تغيير كلمة المرور عند تسجيل الدخول التالي.</p>
      <div className="space-y-2">
        <Label>كلمة المرور الجديدة</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} dir="ltr" />
        {password && <p className={`text-xs ${strength.color}`}>قوة كلمة المرور: {strength.label}</p>}
      </div>
      <div className="space-y-2">
        <Label>تأكيد كلمة المرور</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} dir="ltr" />
      </div>
      <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={isLoading}>
        {isLoading ? "جاري التغيير..." : "تغيير كلمة المرور"}
      </Button>
    </form>
  );
}

function PermissionsForm({
  user,
  onSubmit,
  isLoading,
}: {
  user: any;
  onSubmit: (perms: Record<string, boolean>) => void;
  isLoading: boolean;
}) {
  const [perms, setPerms] = useState<Record<string, boolean>>(() =>
    buildDefaultPermissionsState(user.permissions),
  );

  const toggleAll = (enabled: boolean) => {
    const next = { ...perms };
    for (const key of Object.keys(next)) {
      next[key] = enabled;
    }
    setPerms(next);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(perms); }} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        حدّد الأقسام المتاحة للموظف القانوني. يمكنك تفعيل <strong>قراءة فقط</strong> لمنع التعديل مع الإبقاء على العرض.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => toggleAll(true)}>تحديد الكل</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => toggleAll(false)}>إلغاء الكل</Button>
      </div>
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.id} className="space-y-2">
          <h4 className="text-sm font-semibold text-green-800 border-b pb-1">{group.label}</h4>
          <div className="space-y-1">
            {group.items.map((item) => (
              <div key={item.key} className="p-2 rounded hover:bg-muted/50 space-y-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={perms[item.key] !== false}
                    onCheckedChange={(checked) => setPerms({ ...perms, [item.key]: !!checked })}
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
                {item.readonlyKey && perms[item.key] !== false && (
                  <label className="flex items-center gap-3 cursor-pointer mr-8 text-muted-foreground">
                    <Checkbox
                      checked={perms[item.readonlyKey] === true}
                      onCheckedChange={(checked) => setPerms({ ...perms, [item.readonlyKey!]: !!checked })}
                    />
                    <span className="text-xs">قراءة فقط (بدون تعديل)</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={isLoading}>
        {isLoading ? "جاري الحفظ..." : "حفظ الصلاحيات"}
      </Button>
    </form>
  );
}
