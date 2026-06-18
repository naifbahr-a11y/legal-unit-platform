/** أدوار النظام */
export type UserRole = "admin" | "supervisor" | "user";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "مدير",
  supervisor: "إداري",
  user: "موظف قانوني",
};

/** المدير والإداري — صلاحيات مطلقة */
export function hasFullAccess(role: string): boolean {
  return role === "admin" || role === "supervisor";
}

export function isLegalEmployee(role: string): boolean {
  return role === "user";
}

export function canManageUsers(role: string): boolean {
  return hasFullAccess(role);
}

export const PRIVILEGED_ROLES: UserRole[] = ["admin", "supervisor"];
