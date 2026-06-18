const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const SAFE_FONTS = new Set([
  "Cairo",
  "Tahoma",
  "Arial",
  "Segoe UI",
  "Noto Sans Arabic",
  "IBM Plex Sans Arabic",
  "Amiri",
]);

export function sanitizeCssColor(value?: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return HEX_COLOR.test(v) ? v : undefined;
}

export function sanitizeFontFamily(value?: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim().replace(/["';]/g, "");
  if (SAFE_FONTS.has(v)) return v;
  if (/^[\w\s-]{2,64}$/.test(v)) return v;
  return undefined;
}
