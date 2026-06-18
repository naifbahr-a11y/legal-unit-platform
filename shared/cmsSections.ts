/** مفاتيح الأقسام المدمجة في النظام */
export const BUILTIN_SECTION_KEYS = [
  "cases",
  "compensation",
  "guarantees",
  "investigation",
  "bank-properties",
  "mortgaged-properties",
  "forged-checks",
  "general-files",
] as const;

export type BuiltinSectionKey = (typeof BUILTIN_SECTION_KEYS)[number];

const BUILTIN_SET = new Set<string>(BUILTIN_SECTION_KEYS);

export function isBuiltinSectionKey(sectionKey: string): boolean {
  return BUILTIN_SET.has(sectionKey);
}

export function isBuiltinSection(section: { sectionKey: string; isBuiltIn?: number | boolean | null }): boolean {
  return isBuiltinSectionKey(section.sectionKey) || Number(section.isBuiltIn) === 1;
}

export function isManageableCmsSection(section: { sectionKey: string }): boolean {
  return section.sectionKey !== "__app_settings__";
}

export const DEFAULT_BUILTIN_SECTIONS: Array<{
  sectionKey: BuiltinSectionKey;
  name: string;
  icon: string;
  sortOrder: number;
}> = [
  { sectionKey: "cases", name: "سجل القضايا", icon: "FileText", sortOrder: 1 },
  { sectionKey: "compensation", name: "قضايا التضمين", icon: "Scale", sortOrder: 2 },
  { sectionKey: "guarantees", name: "الكفالات الشخصية", icon: "Shield", sortOrder: 3 },
  { sectionKey: "investigation", name: "اللجنة التحقيقية", icon: "Search", sortOrder: 4 },
  { sectionKey: "bank-properties", name: "عقارات المصرف", icon: "Building2", sortOrder: 5 },
  { sectionKey: "mortgaged-properties", name: "العقارات المرهونة", icon: "Landmark", sortOrder: 6 },
  { sectionKey: "forged-checks", name: "الصكوك المزورة", icon: "Banknote", sortOrder: 7 },
  { sectionKey: "general-files", name: "الملفات العامة", icon: "FolderOpen", sortOrder: 8 },
];
