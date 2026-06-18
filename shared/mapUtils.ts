/** أسماء المحافظات القياسية (18 محافظة) */
export const IRAQ_PROVINCES = [
  "دهوك", "أربيل", "البصرة", "المثنى", "السليمانية", "ديالى", "واسط", "ميسان",
  "الأنبار", "النجف", "نينوى", "صلاح الدين", "كركوك", "بغداد", "بابل",
  "القادسية", "ذي قار", "كربلاء",
] as const;

export type IraqProvince = (typeof IRAQ_PROVINCES)[number];

const PROVINCE_ALIASES: Record<string, string> = {
  "محافظة بغداد": "بغداد",
  "بغداد ": "بغداد",
  "محافظة البصرة": "البصرة",
  "محافظة نينوى": "نينوى",
  "محافظة الأنبار": "الأنبار",
  "محافظة النجف": "النجف",
  "محافظة كربلاء": "كربلاء",
  "محافظة بابل": "بابل",
  "محافظة ديالى": "ديالى",
  "محافظة واسط": "واسط",
  "محافظة ميسان": "ميسان",
  "محافظة ذي قار": "ذي قار",
  "محافظة القادسية": "القادسية",
  "محافظة المثنى": "المثنى",
  "محافظة صلاح الدين": "صلاح الدين",
  "محافظة كركوك": "كركوك",
  "محافظة أربيل": "أربيل",
  "محافظة دهوك": "دهوك",
  "محافظة السليمانية": "السليمانية",
  "الانبار": "الأنبار",
  "انبار": "الأنبار",
  "صلاح الدين ": "صلاح الدين",
};

export function normalizeProvinceName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (PROVINCE_ALIASES[trimmed]) return PROVINCE_ALIASES[trimmed];
  const match = IRAQ_PROVINCES.find((p) => p === trimmed || trimmed.includes(p) || p.includes(trimmed));
  return match ?? trimmed;
}

export type MapTimeFilter = "30d" | "90d" | "365d" | "all";

export function mapTimeFilterToSql(timeFilter?: string): { current: string; previous: string } {
  const tf = timeFilter || "30d";
  switch (tf) {
    case "30d":
    case "30days":
      return {
        current: "AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
        previous: "AND createdAt >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY)",
      };
    case "90d":
    case "3months":
      return {
        current: "AND createdAt >= DATE_SUB(NOW(), INTERVAL 90 DAY)",
        previous: "AND createdAt >= DATE_SUB(NOW(), INTERVAL 180 DAY) AND createdAt < DATE_SUB(NOW(), INTERVAL 90 DAY)",
      };
    case "365d":
    case "year":
      return {
        current: "AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 YEAR)",
        previous: "AND createdAt >= DATE_SUB(NOW(), INTERVAL 2 YEAR) AND createdAt < DATE_SUB(NOW(), INTERVAL 1 YEAR)",
      };
  }
  return { current: "", previous: "" };
}

export const MAP_ALERT_PROCESSING_THRESHOLD = 50;

export const PROVINCE_CITIES: Record<string, string[]> = {
  "الأنبار": ["الرمادي", "الفلوجة", "هيت", "حديثة", "القائم", "عانة", "راوة", "الرطبة", "عكاشات", "الكرمة"],
  "بغداد": ["الكرخ", "الرصافة", "الكاظمية", "الأعظمية", "الكرادة", "المنصور", "الشعب", "الحرية"],
  "البصرة": ["البصرة", "الزبير", "أبو الخصيب", "الفاو", "شط العرب", "القرنة", "المدينة"],
  "نينوى": ["الموصل", "تلعفر", "سنجار", "الحمدانية", "تلكيف", "الشيخان", "زمار"],
  "ذي قار": ["الناصرية", "سوق الشيوخ", "الشطرة", "الرفاعي", "الجبايش", "قلعة سكر"],
  "المثنى": ["السماوة", "الرميثة", "الخضر", "المجد"],
  "القادسية": ["الديوانية", "الشامية", "عفك", "الحمزة", "نفر"],
  "ميسان": ["العمارة", "علي الغربي", "قلعة صالح", "المجر الكبير"],
  "واسط": ["الكوت", "الحي", "الصويرة", "بدرة", "الزبيدية"],
  "ديالى": ["بعقوبة", "خانقين", "المقدادية", "بلدروز", "كفري"],
  "صلاح الدين": ["تكريت", "بيجي", "سامراء", "الدور", "الشرقاط", "بلد"],
  "كركوك": ["كركوك", "الحويجة", "الطوز", "داقوق"],
  "بابل": ["الحلة", "المحاويل", "المسيب", "الهاشمية", "الكفل"],
  "كربلاء": ["كربلاء", "عين التمر"],
  "النجف": ["النجف", "الكوفة", "المناذرة", "أبو صخير"],
  "السليمانية": ["السليمانية", "حلبجة", "رانية", "شهربازار"],
  "أربيل": ["أربيل", "شقلاوة", "كويسنجق", "سوران"],
  "دهوك": ["دهوك", "زاخو", "عمادية", "سميل"],
};
