import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, FileText, Scale, Shield, Search, Building2, Landmark,
  Banknote, FolderOpen, Users, CheckCircle, History, Settings, Mail,
  Calendar, FileSearch, BarChart3, Key, Bell, Layers,
} from "lucide-react";

export type NavItem = { icon: LucideIcon; label: string; path: string };

export const mainMenuItems: NavItem[] = [
  { icon: LayoutDashboard, label: "لوحة المعلومات", path: "/" },
  { icon: FileText, label: "سجل القضايا", path: "/cases" },
  { icon: Scale, label: "قضايا التضمين", path: "/compensation" },
  { icon: Shield, label: "الكفالات الشخصية", path: "/guarantees" },
  { icon: Search, label: "اللجنة التحقيقية الخاصة بمحافظة الأنبار", path: "/investigation" },
  { icon: Building2, label: "عقارات المصرف", path: "/bank-properties" },
  { icon: Landmark, label: "العقارات المرهونة", path: "/mortgaged-properties" },
  { icon: Banknote, label: "الصكوك المزورة", path: "/forged-checks" },
  { icon: FolderOpen, label: "الملفات العامة", path: "/general-files" },
];

export function getCorrespondenceNavItem(isPrivileged: boolean): NavItem {
  return isPrivileged
    ? { icon: Mail, label: "المراسلات الرسمية", path: "/correspondence" }
    : { icon: Mail, label: "إحالات المراسلات", path: "/correspondence-assignments" };
}

export const workflowMenuItems: NavItem[] = [
  getCorrespondenceNavItem(true),
  { icon: Calendar, label: "المواعيد والتذكرات", path: "/appointments" },
  { icon: FileSearch, label: "طلبات المراجعة", path: "/legal-reviews" },
  { icon: BarChart3, label: "الموقف الفصلي", path: "/quarterly-status" },
];

export const adminMenuItems: NavItem[] = [
  { icon: History, label: "سجل العمليات", path: "/audit-log" },
  { icon: Users, label: "إدارة المستخدمين", path: "/users" },
  { icon: Layers, label: "إدارة الأقسام", path: "/manage-sections" },
  { icon: Settings, label: "إدارة المحتوى", path: "/admin-cms" },
];

export const commonMenuItems: NavItem[] = [
  { icon: CheckCircle, label: "الموافقات والطلبات", path: "/pending" },
  { icon: Bell, label: "الإشعارات", path: "/notifications" },
  { icon: Key, label: "تغيير كلمة المرور", path: "/change-password" },
];

export const bottomNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "الرئيسية", path: "/" },
  { icon: FileText, label: "القضايا", path: "/cases" },
  getCorrespondenceNavItem(true),
  { icon: Calendar, label: "المواعيد", path: "/appointments" },
];

export const searchRoutes: Record<string, string> = {
  cases: "/cases",
  compensation: "/compensation",
  investigation: "/investigation",
  users: "/users",
  legal_reviews: "/legal-reviews",
  guarantees: "/guarantees",
  correspondence: "/correspondence",
  correspondence_assignments: "/correspondence-assignments",
  appointments: "/appointments",
  "bank-properties": "/bank-properties",
  "mortgaged-properties": "/mortgaged-properties",
  "forged-checks": "/forged-checks",
  "general-files": "/general-files",
};

export const sectionKeyToPath: Record<string, string> = {
  cases: "/cases",
  compensation: "/compensation",
  guarantees: "/guarantees",
  investigation: "/investigation",
  "bank-properties": "/bank-properties",
  "mortgaged-properties": "/mortgaged-properties",
  "forged-checks": "/forged-checks",
  "general-files": "/general-files",
  correspondence: "/correspondence",
  correspondence_assignments: "/correspondence-assignments",
  appointments: "/appointments",
  "legal-reviews": "/legal-reviews",
  "quarterly-status": "/quarterly-status",
  "cases-map": "/cases-map",
};

const RECENT_KEY = "legal-unit-recent-pages";

export function trackRecentPage(path: string) {
  if (path === "/login" || path.startsWith("/cases-map")) return;
  try {
    const recent = getRecentPages().filter((p) => p !== path);
    recent.unshift(path);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 6)));
  } catch { /* ignore */ }
}

export function getRecentPages(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function resolvePageTitle(
  location: string,
  customSections?: { slug: string; name: string }[],
) {
  const all = [...mainMenuItems, ...workflowMenuItems, ...adminMenuItems, ...commonMenuItems];
  return (
    all.find((i) => i.path === location)?.label
    || customSections?.find((cs) => `/custom/${cs.slug}` === location)?.name
    || (location.startsWith("/correspondence-assignments") ? "إحالات المراسلات" : null)
    || (location.startsWith("/cases/") ? "تفاصيل القضية" : null)
    || "الوحدة القانونية"
  );
}

export type BreadcrumbItem = { label: string; path?: string };

export function buildBreadcrumbs(
  location: string,
  customSections?: { slug: string; name: string }[],
  extra?: BreadcrumbItem[],
): BreadcrumbItem[] {
  if (extra?.length) return extra;
  const crumbs: BreadcrumbItem[] = [{ label: "الرئيسية", path: "/" }];
  if (location === "/") return crumbs;

  if (location.startsWith("/cases/")) {
    crumbs.push({ label: "سجل القضايا", path: "/cases" });
    crumbs.push({ label: "تفاصيل القضية" });
    return crumbs;
  }

  const title = resolvePageTitle(location, customSections);
  if (title && title !== "الوحدة القانونية") {
    crumbs.push({ label: title, path: location });
  }
  return crumbs;
}

export function getMenuGroups(isAdmin: boolean) {
  const groups = [
    { id: "main", label: "الأقسام الرئيسية", items: mainMenuItems },
    { id: "workflow", label: "سير العمل", items: workflowMenuItems },
  ];
  if (isAdmin) groups.push({ id: "admin", label: "الإدارة", items: adminMenuItems });
  groups.push({ id: "account", label: "الحساب", items: commonMenuItems });
  return groups;
}
