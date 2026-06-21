import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasFullAccess } from "@shared/userRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getNotificationLink,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_OPTIONS,
} from "@shared/notificationTypes";

export default function Notifications() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isPrivileged = user ? hasFullAccess(user.role) : true;
  const utils = trpc.useUtils();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: notifications, isLoading, isError, refetch } = trpc.notifications.list.useQuery({
    type: typeFilter === "all" ? undefined : typeFilter,
    limit: 200,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("تم تحديد جميع الإشعارات كمقروءة");
    },
  });

  const unreadCount = useMemo(
    () => (notifications ?? []).filter((n) => !n.isRead).length,
    [notifications],
  );

  const handleOpen = (n: {
    id: number;
    type?: string | null;
    relatedId?: number | null;
    isRead?: number | null;
  }) => {
    if (!n.isRead) markRead.mutate({ id: n.id });
    const link = getNotificationLink(n.type, n.relatedId, { isPrivileged });
    if (link) setLocation(link);
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            الإشعارات
            {unreadCount > 0 && (
              <Badge variant="destructive">{unreadCount} غير مقروء</Badge>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="نوع الإشعار" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {NOTIFICATION_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending || unreadCount === 0}
            >
              <CheckCheck className="h-4 w-4 ml-1" />
              تحديد الكل كمقروء
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-muted-foreground">تعذّر تحميل الإشعارات</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
            </div>
          ) : isLoading ? (
            <p className="text-center text-muted-foreground py-10">جاري التحميل...</p>
          ) : !notifications?.length ? (
            <p className="text-center text-muted-foreground py-10">لا توجد إشعارات</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleOpen(n)}
                  className={`w-full text-right border rounded-lg p-4 hover:bg-muted/40 transition-colors ${
                    n.isRead ? "opacity-80" : "bg-primary/5 border-primary/20"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${n.isRead ? "text-muted-foreground" : "font-semibold"}`}>
                        {n.title}
                      </p>
                      {n.message && (
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{n.message}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-2">
                        {new Date(n.createdAt).toLocaleString("ar-IQ")}
                      </p>
                    </div>
                    {n.type && (
                      <Badge variant="outline" className="shrink-0">
                        {NOTIFICATION_TYPE_LABELS[n.type] || n.type}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
