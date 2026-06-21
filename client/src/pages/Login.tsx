import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Scale, Loader2 } from "lucide-react";
import { setAuthToken, usesExternalApi } from "@/lib/apiBase";
import { APP_LOGO_URL } from "@/const";

const DEFAULT_LOGO_URL = APP_LOGO_URL;

export default function Login() {
  const { data: appSettings } = trpc.cms.getSettings.useQuery();
  const LOGO_URL = appSettings?.logoUrl || DEFAULT_LOGO_URL;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data.token && usesExternalApi()) {
        setAuthToken(data.token);
      }
      await utils.auth.me.invalidate();
      if (data.user?.mustChangePassword) setLocation("/change-password");
      else setLocation("/");
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-900 via-green-800 to-green-950 p-4">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-yellow-500 blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 rounded-full bg-green-400 blur-3xl" />
      </div>
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-0 bg-white/95 backdrop-blur">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex justify-center mb-4">
            <img src={LOGO_URL} alt="مصرف الرافدين" className="w-40 h-40 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-green-800">مصرف الرافدين</h1>
          <p className="text-sm text-muted-foreground mt-1">مكتب مندوب الأنبار / الوحدة القانونية</p>
        </CardHeader>
        <CardContent className="pt-4 pb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">اسم المستخدم</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="h-11 text-right"
                autoComplete="username"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className="h-11 text-right"
                autoComplete="current-password"
                dir="ltr"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg text-center">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-11 bg-green-700 hover:bg-green-800 text-white font-semibold text-base"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Scale className="h-5 w-5 ml-2" />
                  تسجيل الدخول
                </>
              )}
            </Button>
          </form>
          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-xs text-muted-foreground">
              مصرف الرافدين / مكتب مندوب الانبار / الوحدة القانونية
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
