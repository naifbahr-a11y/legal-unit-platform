import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { FileText, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { canAccessPath, type PermissionUser } from "@shared/userPermissions";
import {
  getMenuGroups, getRecentPages, resolvePageTitle, trackRecentPage, type NavItem,
} from "@/lib/navigation";

type MobileMoreMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: PermissionUser;
  isAdmin: boolean;
  customSections?: { slug: string; name: string }[];
  unreadCount?: number;
  pendingCount?: number;
};

function NavButton({
  item,
  active,
  onClick,
  badge,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-primary/10 text-primary" : "hover:bg-muted"
      }`}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      <span className="flex-1 text-right truncate">{item.label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-destructive text-destructive-foreground text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

export function MobileMoreMenu({
  open,
  onOpenChange,
  user,
  isAdmin,
  customSections,
  unreadCount,
  pendingCount,
}: MobileMoreMenuProps) {
  const [location, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  const recentPaths = getRecentPages();
  const groups = getMenuGroups(isAdmin);

  const customItems: NavItem[] = (customSections ?? []).map((cs) => ({
    icon: FileText,
    label: cs.name,
    path: `/custom/${cs.slug}`,
  }));

  const visibleCustomSlugs = useMemo(
    () => (customSections ?? []).map((s) => s.slug),
    [customSections],
  );

  const allItems = useMemo(() => {
    const items = [...groups.flatMap((g) => g.items), ...customItems];
    const seen = new Set<string>();
    return items.filter((i) => {
      if (seen.has(i.path)) return false;
      seen.add(i.path);
      return canAccessPath(user, i.path, { visibleCustomSlugs });
    });
  }, [groups, customItems, user, visibleCustomSlugs]);

  const filtered = query.trim()
    ? allItems.filter((i) => i.label.includes(query.trim()))
    : null;

  const recentItems = recentPaths
    .map((path) => allItems.find((i) => i.path === path))
    .filter(Boolean) as NavItem[];

  const navigate = (path: string) => {
    trackRecentPage(path);
    setLocation(path);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>جميع الأقسام</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4 flex-1 overflow-y-auto space-y-4">
          <Input
            placeholder="ابحث في القائمة..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2"
          />

          {filtered ? (
            <div className="space-y-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد نتائج</p>
              ) : (
                filtered.map((item) => (
                  <NavButton
                    key={item.path}
                    item={item}
                    active={location === item.path}
                    onClick={() => navigate(item.path)}
                    badge={item.path === "/pending" ? pendingCount : undefined}
                  />
                ))
              )}
            </div>
          ) : (
            <>
              {recentItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> آخر الزيارات
                  </p>
                  <div className="space-y-1">
                    {recentItems.map((item) => (
                      <NavButton
                        key={`recent-${item.path}`}
                        item={item}
                        active={location === item.path}
                        onClick={() => navigate(item.path)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {groups.map((group) => (
                <div key={group.id}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{group.label}</p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NavButton
                        key={item.path}
                        item={item}
                        active={location === item.path}
                        onClick={() => navigate(item.path)}
                        badge={item.path === "/pending" ? pendingCount : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {customItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">أقسام مخصصة</p>
                  <div className="space-y-1">
                    {customItems.map((item) => (
                      <NavButton
                        key={item.path}
                        item={item}
                        active={location === item.path}
                        onClick={() => navigate(item.path)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { trackRecentPage, resolvePageTitle };
