import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { canManageUsers } from "@shared/userRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Key, Check, Send, Link, Unlink, Bell, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function ChangePassword() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const mustChange = Number((user as { mustChangePassword?: number })?.mustChangePassword) === 1;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [linkInfo, setLinkInfo] = useState<{ code: string; deepLink: string; botUsername: string } | null>(null);
  const [alertUserId, setAlertUserId] = useState<string>("");
  const [alertMessage, setAlertMessage] = useState("");

  // Password change
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      await utils.auth.me.invalidate();
      toast.success("تم تغيير كلمة المرور بنجاح");
      if (mustChange) setLocation("/");
    },
    onError: (err) => toast.error(err.message),
  });

  // Telegram status
  const { data: telegramStatus, refetch: refetchStatus } = trpc.telegram.getStatus.useQuery();

  // Generate link code
  const generateCode = trpc.telegram.generateLinkCode.useMutation({
    onSuccess: (data) => {
      setLinkInfo(data);
      toast.success("تم توليد الكود. افتح البوت وأرسل الكود.");
    },
    onError: (err) => toast.error(err.message),
  });

  // Unlink self
  const unlinkSelf = trpc.telegram.unlinkSelf.useMutation({
    onSuccess: () => {
      setLinkInfo(null);
      refetchStatus();
      toast.success("تم إلغاء ربط تلغرام");
    },
    onError: (err) => toast.error(err.message),
  });

  // Admin: send alert
  const sendAlert = trpc.telegram.sendAlert.useMutation({
    onSuccess: (data) => {
      if (data.sent) toast.success("تم إرسال التنبيه عبر تلغرام");
      else toast.warning("المستخدم لم يربط حساب تلغرام بعد");
      setAlertMessage("");
    },
    onError: (err) => toast.error(err.message),
  });

  // Admin: check expiry
  const checkExpiry = trpc.telegram.checkExpiry.useMutation({
    onSuccess: (data) => toast.success(`تم إرسال ${data.notified} إشعار للقضايا المنتهية`),
    onError: (err) => toast.error(err.message),
  });

  // Admin: get users list for alert target
  const { data: usersData } = trpc.users.listFull.useQuery(undefined, { enabled: !!user && canManageUsers(user.role) });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("كلمتا المرور الجديدتان غير متطابقتين"); return; }
    if (newPassword.length < 8) { toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {mustChange && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 text-sm text-amber-900">
            يجب تغيير كلمة المرور قبل متابعة استخدام النظام.
          </CardContent>
        </Card>
      )}
      {/* Password Change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            تغيير كلمة المرور
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>كلمة المرور الحالية</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>تأكيد كلمة المرور الجديدة</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} dir="ltr" />
            </div>
            <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={changePassword.isPending}>
              {changePassword.isPending ? "جاري التغيير..." : (<><Check className="h-4 w-4 ml-1" />تغيير كلمة المرور</>)}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Telegram Linking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-500" />
            ربط حساب تلغرام
            {telegramStatus?.linked && <Badge className="bg-green-600 text-white text-xs">مرتبط ✓</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {telegramStatus?.linked ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700 dark:text-green-400">
                ✅ حسابك مرتبط بتلغرام. ستصلك إشعارات القضايا تلقائياً.
              </p>
              <Button
                variant="outline"
                className="w-full border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => unlinkSelf.mutate()}
                disabled={unlinkSelf.isPending}
              >
                <Unlink className="h-4 w-4 ml-1" />
                إلغاء ربط تلغرام
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                اربط حسابك بتلغرام لتلقي إشعارات فورية عند اقتراب مواعيد القضايا أو انتهائها.
              </p>
              {!linkInfo ? (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => generateCode.mutate()}
                  disabled={generateCode.isPending}
                >
                  <Link className="h-4 w-4 ml-1" />
                  {generateCode.isPending ? "جاري التوليد..." : "توليد كود الربط"}
                </Button>
              ) : (
                <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium">الخطوات:</p>
                  <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                    <li>افتح بوت تلغرام: <strong>@{linkInfo.botUsername}</strong></li>
                    <li>اضغط Start أو أرسل الكود التالي:</li>
                  </ol>
                  <div className="flex items-center gap-2">
                    <code className="text-2xl font-bold tracking-widest text-blue-700 dark:text-blue-300 bg-white dark:bg-blue-900 px-4 py-2 rounded border">
                      {linkInfo.code}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { navigator.clipboard.writeText(linkInfo.code); toast.success("تم نسخ الكود"); }}
                    >
                      نسخ
                    </Button>
                  </div>
                  <a
                    href={linkInfo.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button className="w-full bg-blue-500 hover:bg-blue-600">
                      <Send className="h-4 w-4 ml-1" />
                      فتح البوت مباشرة
                    </Button>
                  </a>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { refetchStatus(); toast.info("جاري التحقق..."); }}
                    >
                      <RefreshCw className="h-3 w-3 ml-1" />
                      تحقق من الربط
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 text-muted-foreground"
                      onClick={() => setLinkInfo(null)}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin: Send Alert & Check Expiry */}
      {user && canManageUsers(user.role) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              إرسال تنبيهات تلغرام (للمدير)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Check expiry button */}
            <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
              <p className="text-sm text-muted-foreground mb-2">إرسال إشعارات تلقائية لجميع الموظفين عن القضايا المنتهية أو المقتربة من الانتهاء:</p>
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700"
                onClick={() => checkExpiry.mutate()}
                disabled={checkExpiry.isPending}
              >
                <Bell className="h-4 w-4 ml-1" />
                {checkExpiry.isPending ? "جاري الإرسال..." : "فحص وإرسال إشعارات القضايا المنتهية"}
              </Button>
            </div>

            {/* Manual alert to specific employee */}
            <div className="space-y-3">
              <Label>إرسال تنبيه لموظف محدد</Label>
              <Select value={alertUserId} onValueChange={setAlertUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الموظف..." />
                </SelectTrigger>
                <SelectContent>
                  {usersData?.filter(u => u.role !== "admin").map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.displayName}
                      {!(u as any).telegramChatId && " (غير مرتبط)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="نص التنبيه..."
                value={alertMessage}
                onChange={(e) => setAlertMessage(e.target.value)}
                rows={3}
              />
              <Button
                className="w-full"
                disabled={!alertUserId || !alertMessage || sendAlert.isPending}
                onClick={() => sendAlert.mutate({ userId: Number(alertUserId), message: alertMessage })}
              >
                <Send className="h-4 w-4 ml-1" />
                {sendAlert.isPending ? "جاري الإرسال..." : "إرسال التنبيه"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
