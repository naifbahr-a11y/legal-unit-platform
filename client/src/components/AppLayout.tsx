import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { getNotificationLink, NOTIFICATION_TYPE_LABELS } from "@shared/notificationTypes";
import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  FileText, Search, Bell, Users, LogOut, Menu, X, CheckCircle, ChevronLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MobileMoreMenu, trackRecentPage } from "@/components/MobileMoreMenu";
import { usePageActions } from "@/contexts/PageActionsContext";
import {
  mainMenuItems, workflowMenuItems, adminMenuItems, commonMenuItems,
  bottomNavItems, searchRoutes, sectionKeyToPath, resolvePageTitle, buildBreadcrumbs,
} from "@/lib/navigation";
import { canAccessPath } from "@shared/userPermissions";
import { sanitizeCssColor, sanitizeFontFamily } from "@shared/themeSanitize";
import { hasFullAccess, canManageUsers, USER_ROLE_LABELS, type UserRole } from "@shared/userRoles";
import { toast } from "sonner";
import { APP_LOGO_URL } from "@/const";

const DEFAULT_LOGO_URL = APP_LOGO_URL;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const { pageActions } = usePageActions();
  const { data: searchResults } = trpc.search.global.useQuery({ query: globalSearch }, { enabled: globalSearch.length >= 2 });

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });
  const { data: pendingCount } = trpc.pending.count.useQuery(undefined, {
    enabled: !!user && hasFullAccess(user.role),
    refetchInterval: 30000,
  });
  const { data: customSections } = trpc.customSections.list.useQuery(undefined, { enabled: !!user });
  const { data: sectionConfigs } = trpc.cms.getSections.useQuery(undefined, { enabled: !!user });
  const { data: appSettings } = trpc.cms.getSettings.useQuery(undefined, { enabled: !!user });
  const LOGO_URL = appSettings?.logoUrl || DEFAULT_LOGO_URL;

  // Apply dynamic theme settings
  useEffect(() => {
    if (appSettings) {
      const root = document.documentElement;
      const primary = sanitizeCssColor(appSettings.primaryColor);
      const accent = sanitizeCssColor(appSettings.accentColor);
      const font = sanitizeFontFamily(appSettings.fontFamily);
      if (primary) root.style.setProperty("--dynamic-primary", primary);
      if (accent) root.style.setProperty("--dynamic-accent", accent);
      if (font) root.style.setProperty("--dynamic-font", font);
      if (appSettings.darkMode) { root.classList.add("dark"); } else { root.classList.remove("dark"); }
    }
  }, [appSettings]);
  const prevUnreadRef = useRef<number | undefined>(undefined);

  // Browser push notifications
  useEffect(() => {
    if (user && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [user]);

  useEffect(() => {
    if (unreadCount !== undefined && prevUnreadRef.current !== undefined) {
      if (unreadCount > prevUnreadRef.current && "Notification" in window && Notification.permission === "granted") {
        new Notification("\u0627\u0644\u0648\u062d\u062f\u0629 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629 - \u0625\u0634\u0639\u0627\u0631 \u062c\u062f\u064a\u062f", {
          body: "\u0644\u062f\u064a\u0643 \u0625\u0634\u0639\u0627\u0631\u0627\u062a \u062c\u062f\u064a\u062f\u0629 \u063a\u064a\u0631 \u0645\u0642\u0631\u0648\u0621\u0629",
          icon: LOGO_URL,
          dir: "rtl",
        });
      }
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    if (!loading && !user && location !== "/login") {
      setLocation("/login");
    }
  }, [loading, user, location, setLocation]);

  useEffect(() => {
    if (user) trackRecentPage(location);
  }, [location, user]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable;

      if (e.key === "Escape") {
        setMobileOpen(false);
        setMoreMenuOpen(false);
        setMobileSearchOpen(false);
        setSearchOpen(false);
        return;
      }

      if (inInput) return;

      if (e.key === "/") {
        e.preventDefault();
        if (window.innerWidth < 768) setMobileSearchOpen(true);
        else desktopSearchRef.current?.focus();
      }

      if ((e.key === "n" || e.key === "N") && pageActions.onAdd) {
        e.preventDefault();
        pageActions.onAdd();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pageActions.onAdd]);

  const visibleCustomSlugs = useMemo(
    () => (customSections ?? []).map((s) => s.slug),
    [customSections],
  );

  const pathAllowed = useMemo(() => {
    if (!user || hasFullAccess(user.role)) return true;
    const path = location.startsWith("/cases/") ? "/cases" : location.split("?")[0];
    return canAccessPath(user, path, { visibleCustomSlugs });
  }, [user, location, visibleCustomSlugs]);

  useEffect(() => {
    if (!user || hasFullAccess(user.role)) return;
    if (!pathAllowed) {
      toast.error("ليس لديك صلاحية الوصول لهذا القسم");
      setLocation("/");
    }
  }, [pathAllowed, user, setLocation]);

  useEffect(() => {
    if (!user) return;
    const mustChange = Number((user as { mustChangePassword?: number }).mustChangePassword) === 1;
    if (mustChange && location !== "/change-password" && location !== "/login") {
      setLocation("/change-password");
    }
  }, [user, location, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img src={LOGO_URL} alt="Logo" className="w-32 h-32 animate-pulse" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!pathAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">جاري التحقق من الصلاحيات...</p>
      </div>
    );
  }

  const isAdmin = hasFullAccess(user.role);

  // Filter and reorder menu items based on section_config
  const pageTitle = resolvePageTitle(location, customSections);
  const breadcrumbs = pageActions.breadcrumbs ?? buildBreadcrumbs(location, customSections);

  const handleSearchSelect = (r: { type: string; id: number }) => {
    let route = "/";
    if (r.type === "cases") route = `/cases/${r.id}`;
    else if (r.type === "legal_reviews") route = `/legal-reviews?id=${r.id}`;
    else route = searchRoutes[r.type] || "/";
    if (!canAccessPath(user, route.split("?")[0], { visibleCustomSlugs })) {
      toast.error("ليس لديك صلاحية الوصول لهذا القسم");
      return;
    }
    setLocation(route);
    setGlobalSearch("");
    setSearchOpen(false);
    setMobileSearchOpen(false);
  };

  const filteredMenuItems = (sectionConfigs
    ? mainMenuItems
        .filter(item => {
          const config = sectionConfigs.find((sc: any) => sectionKeyToPath[sc.sectionKey] === item.path);
          return !config || config.visible;
        })
        .sort((a, b) => {
          const configA = sectionConfigs.find((sc: any) => sectionKeyToPath[sc.sectionKey] === a.path);
          const configB = sectionConfigs.find((sc: any) => sectionKeyToPath[sc.sectionKey] === b.path);
          return (configA?.sortOrder || 99) - (configB?.sortOrder || 99);
        })
    : mainMenuItems
  ).filter((item) => canAccessPath(user, item.path, { visibleCustomSlugs }));

  const filteredWorkflowItems = workflowMenuItems.filter((item) => canAccessPath(user, item.path, { visibleCustomSlugs }));
  const filteredBottomNav = bottomNavItems.filter((item) => canAccessPath(user, item.path, { visibleCustomSlugs }));

  const showSidebarLabels = sidebarOpen || mobileOpen;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 right-0 z-50 h-screen
        bg-sidebar text-sidebar-foreground
        transition-all duration-300 ease-in-out
        w-64 ${sidebarOpen ? "lg:w-64" : "lg:w-16"}
        ${mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
        flex flex-col shadow-xl overflow-hidden
      `}>
        {/* Logo area */}
        <div className="p-4 border-b border-sidebar-border flex flex-col items-center justify-center">
          <img src={LOGO_URL} alt="Logo" className={`object-contain ${showSidebarLabels ? "w-32 h-32" : "w-12 h-12"}`} />
          {(showSidebarLabels) && (
            <div className="text-center mt-3">
              <h2 className="text-sm font-bold text-sidebar-primary">مصرف الرافدين</h2>
              <p className="text-xs text-sidebar-foreground/80 mt-0.5">مكتب مندوب الأنبار</p>
              <p className="text-xs text-sidebar-foreground/70 mt-0.5">الوحدة القانونية</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          <div className="space-y-1">
            {filteredMenuItems.map((item) => {
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { setLocation(item.path); setMobileOpen(false); }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }
                  `}
                  title={!showSidebarLabels ? item.label : undefined}
                >
                  <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
                  {showSidebarLabels && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
            {/* Dynamic custom sections (filtered/sorted via section_config) */}
            {customSections && customSections.length > 0 && customSections
              .slice()
              .sort((a: any, b: any) => {
                const cfgA = sectionConfigs?.find((sc: any) => sc.sectionKey === `custom-${a.slug}`);
                const cfgB = sectionConfigs?.find((sc: any) => sc.sectionKey === `custom-${b.slug}`);
                return (cfgA?.sortOrder || 500) - (cfgB?.sortOrder || 500);
              })
              .filter((cs: any) => {
                const cfg = sectionConfigs?.find((sc: any) => sc.sectionKey === `custom-${cs.slug}`);
                if (cfg && !cfg.visible) return false;
                return canAccessPath(user, `/custom/${cs.slug}`, { visibleCustomSlugs });
              })
              .map((cs: any) => {
              const csPath = `/custom/${cs.slug}`;
              const isActive = location === csPath;
              return (
                <button
                  key={cs.id}
                  onClick={() => { setLocation(csPath); setMobileOpen(false); }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }
                  `}
                  title={!showSidebarLabels ? cs.name : undefined}
                >
                  <FileText className={`h-5 w-5 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
                  {showSidebarLabels && <span className="truncate">{cs.name}</span>}
                </button>
              );
            })}
          </div>

          {/* Workflow items */}
          <div className="my-3 mx-3 border-t border-sidebar-border" />
          {showSidebarLabels && <div className="px-3 text-xs font-semibold text-sidebar-foreground/50 mb-1">سير العمل</div>}
          <div className="space-y-1">
            {filteredWorkflowItems.map((item) => {
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { setLocation(item.path); setMobileOpen(false); }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }
                  `}
                  title={!showSidebarLabels ? item.label : undefined}
                >
                  <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
                  {showSidebarLabels && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>

          {/* Common items for all users */}
          <div className="my-3 mx-3 border-t border-sidebar-border" />
          <div className="space-y-1">
            {commonMenuItems.map((item) => {
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { setLocation(item.path); setMobileOpen(false); }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }
                  `}
                  title={!showSidebarLabels ? item.label : undefined}
                >
                  <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
                  {showSidebarLabels && (
                    <span className="truncate flex items-center gap-2">
                      {item.label}
                      {item.path === "/pending" && isAdmin && pendingCount != null && pendingCount > 0 && (
                        <Badge variant="destructive" className="text-xs h-5 min-w-5 flex items-center justify-center">
                          {pendingCount > 9 ? "9+" : pendingCount}
                        </Badge>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {isAdmin && (
            <>
              <div className="my-3 mx-3 border-t border-sidebar-border" />
              <div className="space-y-1">
                {adminMenuItems.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => { setLocation(item.path); setMobileOpen(false); }}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                        transition-all duration-200
                        ${isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        }
                      `}
                      title={!showSidebarLabels ? item.label : undefined}
                    >
                      <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
                      {showSidebarLabels && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-sidebar-primary/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-sidebar-primary">
                {user.displayName?.charAt(0) || user.name?.charAt(0) || "U"}
              </span>
            </div>
            {showSidebarLabels && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.displayName || user.name}</p>
                <p className="text-xs text-sidebar-foreground/60">
                  {USER_ROLE_LABELS[user.role as UserRole] ?? "موظف"}
                </p>
              </div>
            )}
            {showSidebarLabels && (
              <Button variant="ghost" size="icon" onClick={logout} className="text-sidebar-foreground/60 hover:text-red-400 h-8 w-8">
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 bg-card border-b flex items-center justify-between px-4 shadow-sm no-print">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <ChevronLeft className={`h-5 w-5 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} />
            </Button>
            <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate max-w-[42vw] sm:max-w-none">
              {pageTitle}
            </h1>
          </div>

          {/* Global Search - desktop */}
          <div className="relative hidden md:block">
            <Input
              ref={desktopSearchRef}
              placeholder="بحث شامل... ( / )"
              className="h-9 w-48 lg:w-64 text-sm"
              value={globalSearch}
              onChange={(e) => { setGlobalSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            />
            {searchOpen && searchResults && searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-card border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                {searchResults.map((r: any) => (
                  <button key={`${r.type}-${r.id}`} className="w-full text-right px-3 py-2 hover:bg-muted text-sm border-b last:border-0" onClick={() => handleSearchSelect(r)}>
                    <p className="font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.subtitle || r.type}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="بحث"
            >
              <Search className="h-5 w-5" />
            </Button>
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount && unreadCount > 0 && (
                    <span className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <NotificationsList />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 mobile-main-padding">
          <Breadcrumbs items={breadcrumbs} />
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav className="mobile-bottom-nav fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden no-print">
          <div className="grid grid-cols-5 h-14">
            {filteredBottomNav.map((item) => {
              const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => setLocation(item.path)}
                  className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                    active ? "text-primary font-semibold" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="truncate max-w-full px-1">{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreMenuOpen(true)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                moreMenuOpen ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              <Menu className="h-5 w-5" />
              <span>المزيد</span>
            </button>
          </div>
        </nav>

        <Sheet open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>بحث شامل</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4 space-y-3 overflow-y-auto flex-1">
              <Input
                autoFocus
                placeholder="ابحث عن قضية، موظف، سجل..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              {globalSearch.length < 2 ? (
                <p className="text-sm text-muted-foreground text-center py-8">اكتب حرفين على الأقل للبحث</p>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((r: any) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      className="w-full text-right px-3 py-3 rounded-lg hover:bg-muted border"
                      onClick={() => handleSearchSelect(r)}
                    >
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.subtitle || r.type}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">لا توجد نتائج</p>
              )}
            </div>
          </SheetContent>
        </Sheet>

        <MobileMoreMenu
          open={moreMenuOpen}
          onOpenChange={setMoreMenuOpen}
          user={user}
          isAdmin={isAdmin}
          customSections={customSections}
          unreadCount={unreadCount}
          pendingCount={pendingCount}
        />
      </div>
    </div>
  );
}

function NotificationsList() {
  const [, setLocation] = useLocation();
  const { data: notifications } = trpc.notifications.list.useQuery({ limit: 15 });
  const utils = trpc.useUtils();
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
    },
  });

  const handleClick = (n: { id: number; type?: string | null; relatedId?: number | null; isRead?: number | null }) => {
    if (!n.isRead) markRead.mutate({ id: n.id });
    const link = getNotificationLink(n.type, n.relatedId);
    if (link) setLocation(link);
  };

  if (!notifications || notifications.length === 0) {
    return <div className="p-4 text-center text-sm text-muted-foreground">لا توجد إشعارات</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">الإشعارات</span>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => markAllRead.mutate()}>
          تحديد الكل كمقروء
        </Button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {notifications.slice(0, 15).map((n) => (
          <button
            key={n.id}
            type="button"
            className={`w-full text-right flex flex-col items-start gap-1 p-3 border-b last:border-0 hover:bg-muted/50 transition-colors ${
              n.isRead ? "opacity-75" : "bg-primary/5"
            }`}
            onClick={() => handleClick(n)}
          >
            <div className="flex items-center gap-2 w-full">
              <span className={`text-sm flex-1 ${n.isRead ? "text-muted-foreground" : "font-medium"}`}>
                {n.title}
              </span>
              {n.type && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {NOTIFICATION_TYPE_LABELS[n.type] || n.type}
                </Badge>
              )}
            </div>
            {n.message && <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>}
            <span className="text-[10px] text-muted-foreground">
              {new Date(n.createdAt).toLocaleString("ar-IQ")}
            </span>
          </button>
        ))}
      </div>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => setLocation("/notifications")}
        >
          عرض كل الإشعارات
        </Button>
      </div>
    </div>
  );
}
