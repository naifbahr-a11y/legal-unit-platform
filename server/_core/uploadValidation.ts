type SignatureRule = { mime: string; bytes: number[]; offset?: number };

const SIGNATURES: SignatureRule[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  { mime: "application/vnd.ms-excel", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  { mime: "application/msword", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
];

const ALLOWED_MIMES = new Set(SIGNATURES.map((s) => s.mime));

export function getAllowedUploadMimes(): Set<string> {
  return ALLOWED_MIMES;
}

function matchesSignature(buf: Buffer, rule: SignatureRule): boolean {
  const offset = rule.offset ?? 0;
  if (buf.length < offset + rule.bytes.length) return false;
  return rule.bytes.every((b, i) => buf[offset + i] === b);
}

export function detectMimeFromBuffer(buf: Buffer): string | null {
  if (!buf?.length) return null;
  for (const rule of SIGNATURES) {
    if (matchesSignature(buf, rule)) return rule.mime;
  }
  return null;
}

export function validateUploadBuffer(
  buf: Buffer,
  declaredMime: string,
): { ok: true; mime: string } | { ok: false; error: string } {
  const detected = detectMimeFromBuffer(buf);
  if (!detected) {
    return { ok: false, error: "تعذّر التحقق من نوع الملف — الملف غير مدعوم" };
  }
  if (declaredMime !== detected && declaredMime !== "application/octet-stream") {
    return { ok: false, error: "نوع الملف المُعلَن لا يطابق محتوى الملف" };
  }
  return { ok: true, mime: detected };
}
