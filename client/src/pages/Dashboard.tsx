import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardMap from "@/components/DashboardMap";
import { hasFullAccess } from "@shared/userRoles";
import { canAccessSection } from "@shared/userPermissions";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Scale, Clock, AlertTriangle, Star, Activity, Bell, TrendingUp, XCircle, MapPin, X, Users, FileSearch, Calendar, Mail, Send, Inbox, CheckCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatsSkeleton } from "@/components/ListSkeleton";

const COLORS = ["#1a5c2e", "#c8a415", "#2d8a4e", "#e6c84d", "#145224", "#8b6914", "#3b82f6", "#ef4444", "#8b5cf6", "#f97316"];

function getRatingInfo(score: number): { label: string; color: string; stars: number } {
  if (score >= 80) return { label: "ذهبي", color: "text-yellow-500", stars: 5 };
  if (score >= 60) return { label: "فضي", color: "text-gray-400", stars: 4 };
  if (score >= 40) return { label: "برونزي", color: "text-amber-700", stars: 3 };
  return { label: "يحتاج تحسين", color: "text-red-500", stars: 2 };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isPrivileged = hasFullAccess(user?.role ?? "");
  const [period, setPeriod] = useState<"week" | "month" | "year" | undefined>(undefined);
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: enhanced } = trpc.dashboard.enhanced.useQuery({ period });
  const { data: expiringCases = [] } = trpc.dashboard.expiringCases.useQuery();
  const { data: ratings } = trpc.dashboard.employeeRatings.useQuery();
  const { data: activityStats } = trpc.dashboard.activityStats.useQuery();
  const { data: allUsers } = trpc.users.list.useQuery(undefined, { enabled: isPrivileged });
  const canViewAppointments = user ? canAccessSection(user, "appointments") : false;
  const canViewCorrespondence = user ? canAccessSection(user, "correspondence") : false;
  const { data: dashboardAppointments = [] } = trpc.appointments.upcoming.useQuery(
    { limit: 5 },
    { enabled: canViewAppointments },
  );
  const { data: correspondenceStats } = trpc.correspondence.stats.useQuery(
    undefined,
    { enabled: canViewCorrespondence },
  );

  const sendExpiryAlert = trpc.notifications.sendExpiryAlert.useMutation({
    onSuccess: () => toast.success("تم إرسال التنبيه بنجاح"),
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={4} />
      </div>
    );
  }

  // Expiring cases loaded via dedicated endpoint (not limited to first 200)

  const typeData = stats?.casesByType?.map(t => ({
    name: t.type || "غير محدد",
    value: t.count,
  })) ?? [];

  const statusData = stats?.casesByStatus?.map(s => ({
    name: s.status || "غير محدد",
    value: s.count,
  })) ?? [];

  // Sort employee data descending by count and take top 10
  const employeeData = stats?.casesByEmployee
    ?.filter(e => e.employee && e.employee.trim() !== "")
    .map(e => ({
      name: e.employee!.length > 12 ? e.employee!.substring(0, 12) + "..." : e.employee!,
      fullName: e.employee!,
      value: e.count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10) ?? [];

  // Calculate employee ratings
  const employeeRatings = (() => {
    if (!ratings || Array.isArray(ratings)) return [];
    const { allCasesByEmployee, activeCasesByEmployee, followedUpCases } = ratings;
    const employees = allCasesByEmployee.filter((e: any) => e.employee && !e.employee.includes("+") && !e.employee.startsWith("1 "));

    return employees.map((emp: any) => {
      const total = emp.total;
      const active = activeCasesByEmployee.find((a: any) => a.employee === emp.employee)?.active ?? 0;
      const followed = followedUpCases.find((f: any) => f.employee === emp.employee)?.followed ?? 0;
      const activeRatio = total > 0 ? (active / total) * 100 : 0;
      const followRatio = total > 0 ? (followed / total) * 100 : 0;
      const score = Math.round((activeRatio * 0.5) + (followRatio * 0.5));
      return {
        employee: emp.employee,
        total,
        active,
        followed,
        score,
        ...getRatingInfo(score),
      };
    }).sort((a: any, b: any) => b.score - a.score);
  })();

  const findEmployeeId = (employeeName: string) => {
    if (!allUsers) return null;
    const u = allUsers.find(u => u.displayName === employeeName);
    return u?.id ?? null;
  };

  return (
    <div className="space-y-6">
      {/* Stats cards - 4 on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="border-r-4 border-r-green-600">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي القضايا</p>
                <p className="text-3xl font-bold text-green-700 mt-1">{stats?.totalCases ?? 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <FileText className="h-6 w-6 text-green-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`border-r-4 border-r-yellow-500 ${isPrivileged ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
          onClick={isPrivileged ? () => setLocation("/pending") : undefined}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">الموافقات المعلقة</p>
                <p className="text-3xl font-bold text-yellow-600 mt-1">{stats?.pendingApprovals ?? 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-r-4 border-r-purple-500 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setLocation("/legal-reviews")}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">طلبات مراجعة مفتوحة</p>
                <p className="text-3xl font-bold text-purple-600 mt-1">{(stats as any)?.openLegalReviews ?? 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <FileSearch className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-r-4 border-r-orange-500">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">تقترب من الانتهاء</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{expiringCases.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NEW: Expired cases card (30+ days without update) */}
        <Card className="border-r-4 border-r-red-600">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">منتهية الصلاحية</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{(stats as any)?.expiredCases ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">30+ يوم بدون تحديث</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-r-4 border-r-blue-500 hidden lg:block">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">أنواع القضايا</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{typeData.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Scale className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {canViewAppointments && dashboardAppointments.length > 0 && (
        <Card className="border-r-4 border-r-cyan-600">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-cyan-700" />
              مواعيد قادمة
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/appointments")}>عرض الكل</Button>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {dashboardAppointments.map((a: {
              id: number;
              title: string;
              appointmentDate: string;
              appointmentTime?: string | null;
              location?: string | null;
            }) => (
              <button
                key={a.id}
                type="button"
                className="text-right p-3 border rounded-lg hover:bg-muted/40 transition-colors"
                onClick={() => setLocation(`/appointments?id=${a.id}`)}
              >
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {a.appointmentDate}{a.appointmentTime ? ` — ${a.appointmentTime}` : ""}
                </div>
                {a.location && <div className="text-xs text-muted-foreground mt-1">{a.location}</div>}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {canViewCorrespondence && correspondenceStats && (
        <Card className="border-r-4 border-r-emerald-600">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-emerald-700" />
              المراسلات الرسمية
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/correspondence")}>عرض الكل</Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <button type="button" className="p-3 rounded-lg border bg-blue-50/80 hover:bg-blue-100/80 text-right" onClick={() => setLocation("/correspondence")}>
                <div className="flex items-center gap-2 text-blue-700 mb-1"><Inbox className="h-4 w-4" /><span className="text-xs">وارد اليوم</span></div>
                <div className="text-2xl font-bold text-blue-800">{correspondenceStats.todayInbox}</div>
              </button>
              <button type="button" className="p-3 rounded-lg border bg-indigo-50/80 hover:bg-indigo-100/80 text-right" onClick={() => setLocation("/correspondence")}>
                <div className="flex items-center gap-2 text-indigo-700 mb-1"><Send className="h-4 w-4" /><span className="text-xs">صادر اليوم</span></div>
                <div className="text-2xl font-bold text-indigo-800">{correspondenceStats.todayOutbox ?? 0}</div>
              </button>
              <button type="button" className="p-3 rounded-lg border bg-yellow-50/80 hover:bg-yellow-100/80 text-right" onClick={() => setLocation("/correspondence")}>
                <div className="flex items-center gap-2 text-yellow-700 mb-1"><Clock className="h-4 w-4" /><span className="text-xs">قيد المعالجة</span></div>
                <div className="text-2xl font-bold text-yellow-800">{correspondenceStats.processing}</div>
              </button>
              <button type="button" className="p-3 rounded-lg border bg-red-50/80 hover:bg-red-100/80 text-right" onClick={() => setLocation("/correspondence")}>
                <div className="flex items-center gap-2 text-red-700 mb-1"><AlertTriangle className="h-4 w-4" /><span className="text-xs">متأخر</span></div>
                <div className="text-2xl font-bold text-red-800">{correspondenceStats.delayed}</div>
              </button>
              <button type="button" className="p-3 rounded-lg border bg-green-50/80 hover:bg-green-100/80 text-right col-span-2 md:col-span-1" onClick={() => setLocation("/correspondence")}>
                <div className="flex items-center gap-2 text-green-700 mb-1"><CheckCircle className="h-4 w-4" /><span className="text-xs">منجز الشهر</span></div>
                <div className="text-2xl font-bold text-green-800">{correspondenceStats.completedThisMonth}</div>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile: tabbed detail sections */}
      <div className="md:hidden">
        <Tabs defaultValue="map">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="map" className="text-xs">خريطة</TabsTrigger>
            <TabsTrigger value="staff" className="text-xs">موظفون</TabsTrigger>
            <TabsTrigger value="charts" className="text-xs">رسوم</TabsTrigger>
            <TabsTrigger value="alerts" className="text-xs">تنبيهات</TabsTrigger>
          </TabsList>
          <TabsContent value="map" className="mt-3">
            <Card className="overflow-hidden">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> خريطة القضايا</CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-72 overflow-hidden">
                <DashboardMap />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="staff" className="mt-3 space-y-2">
            {employeeRatings.slice(0, 8).map((emp: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                <span className="font-medium truncate">{emp.employee}</span>
                <Badge variant="outline">{emp.score}%</Badge>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="charts" className="mt-3">
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">حسب النوع</CardTitle></CardHeader>
              <CardContent className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                      {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="alerts" className="mt-3 space-y-2">
            {expiringCases.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد قضايا تقترب من الانتهاء</p>
            ) : expiringCases.slice(0, 8).map(c => (
              <div key={c.id} className="p-3 rounded-lg border border-red-200 bg-red-50/50 text-sm">
                <p className="font-medium">{c.caseNumber}</p>
                <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                <p className="text-xs text-red-600 mt-1">ينتهي: {c.expiry}</p>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* Interactive Iraq Map - desktop */}
      <Card className="overflow-hidden border-green-900/30 shadow-lg hidden md:block">
        <CardHeader className="bg-gradient-to-l from-[#071a07] to-[#0f2e0f] py-3 px-4">
          <CardTitle className="text-base text-amber-400 flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            خريطة توزيع القضايا على محافظات العراق
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DashboardMap />
        </CardContent>
      </Card>

      {/* Employee Ratings - desktop */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            تقييم الموظفين
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-right font-medium">الموظف</th>
                  <th className="p-3 text-right font-medium">إجمالي القضايا</th>
                  <th className="p-3 text-right font-medium">القضايا النشطة</th>
                  <th className="p-3 text-right font-medium">المتابعة</th>
                  <th className="p-3 text-right font-medium">النقاط</th>
                  <th className="p-3 text-right font-medium">التقييم</th>
                </tr>
              </thead>
              <tbody>
                {employeeRatings.map((emp: any, idx: number) => (
                  <tr key={idx} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{emp.employee}</td>
                    <td className="p-3">{emp.total}</td>
                    <td className="p-3">{emp.active}</td>
                    <td className="p-3">{emp.followed}</td>
                    <td className="p-3 font-bold">{emp.score}%</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {Array.from({ length: emp.stars }).map((_, i) => (
                            <Star key={i} className={`h-4 w-4 fill-current ${emp.color}`} />
                          ))}
                        </div>
                        <Badge className={`text-xs ${
                          emp.label === "ذهبي" ? "bg-yellow-100 text-yellow-800" :
                          emp.label === "فضي" ? "bg-gray-100 text-gray-800" :
                          emp.label === "برونزي" ? "bg-amber-100 text-amber-800" :
                          "bg-red-100 text-red-800"
                        }`}>
                          {emp.label}
                        </Badge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Desktop-only sections */}
      <div className="hidden md:block space-y-6">
      {/* Most Active Users */}
      {activityStats && activityStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-600" />
              أكثر الموظفين استخداماً للتطبيق
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activityStats.slice(0, 6).map((stat: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-green-700">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{stat.username}</p>
                    <p className="text-xs text-muted-foreground">{stat.actionCount} عملية</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {stat.lastActivity ? new Date(stat.lastActivity).toLocaleDateString("ar-IQ") : "-"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Time Period Filter */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              الإحصائيات التفاعلية
            </CardTitle>
            <div className="flex gap-1">
              <Button variant={period === undefined ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setPeriod(undefined)}>الكل</Button>
              <Button variant={period === "week" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setPeriod("week")}>أسبوع</Button>
              <Button variant={period === "month" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setPeriod("month")}>شهر</Button>
              <Button variant={period === "year" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setPeriod("year")}>سنة</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-green-50 text-center">
              <p className="text-2xl font-bold text-green-700">{enhanced?.totalCases ?? 0}</p>
              <p className="text-xs text-muted-foreground">القضايا</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 text-center">
              <p className="text-2xl font-bold text-blue-700">{enhanced?.compensationCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">التضمين</p>
            </div>
            {isPrivileged && (
            <div className="p-3 rounded-lg bg-purple-50 text-center">
              <p className="text-2xl font-bold text-purple-700">{enhanced?.investigationCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">التحقيقية</p>
            </div>
            )}
            <div className="p-3 rounded-lg bg-amber-50 text-center">
              <p className="text-2xl font-bold text-amber-700">{enhanced?.bankPropertiesCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">عقارات المصرف</p>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 text-center">
              <p className="text-2xl font-bold text-rose-700">{enhanced?.mortgagedPropertiesCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">العقارات المرهونة</p>
            </div>
          </div>
          {/* Monthly Trend */}
          {enhanced?.monthlyTrend && enhanced.monthlyTrend.length > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={enhanced.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="#1a5c2e" fill="#1a5c2e" fillOpacity={0.2} name="عدد القضايا" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts - FIXED: proper sizing and layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cases by Type - Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">القضايا حسب النوع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={100}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ name, value }) => `${name} (${value})`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {typeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`${value} قضية`, "العدد"]} />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cases by Employee - Bar Chart - FIXED */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">القضايا حسب الموظف</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(300, employeeData.length * 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={employeeData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${value} قضية`, "العدد"]}
                    labelFormatter={(label) => {
                      const item = employeeData.find(e => e.name === label);
                      return item?.fullName || label;
                    }}
                  />
                  <Bar dataKey="value" fill="#1a5c2e" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expiring cases alert */}
      {expiringCases.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader>
            <CardTitle className="text-base text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              قضايا تقترب مواعيدها من الانتهاء (خلال 30 يوماً)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right p-2 font-medium">رقم القضية</th>
                    <th className="text-right p-2 font-medium">الموضوع</th>
                    <th className="text-right p-2 font-medium">الموظف</th>
                    <th className="text-right p-2 font-medium">تاريخ الانتهاء</th>
                    {isPrivileged && <th className="text-right p-2 font-medium">تنبيه</th>}
                  </tr>
                </thead>
                <tbody>
                  {expiringCases.slice(0, 10).map(c => {
                    const employeeId = findEmployeeId(c.employee ?? "");
                    return (
                      <tr key={c.id} className="border-b hover:bg-red-50">
                        <td className="p-2">{c.caseNumber}</td>
                        <td className="p-2 max-w-xs truncate">{c.subject}</td>
                        <td className="p-2">{c.employee}</td>
                        <td className="p-2 text-red-600 font-medium">{c.expiry}</td>
                        {isPrivileged && (
                          <td className="p-2">
                            {employeeId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => sendExpiryAlert.mutate({ caseId: c.id, employeeId })}
                                disabled={sendExpiryAlert.isPending}
                              >
                                <Bell className="h-3 w-3 ml-1" />
                                تنبيه
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cases by status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">القضايا حسب الحالة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {statusData.map((s, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold text-green-700">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.name}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
