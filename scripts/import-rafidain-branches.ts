/**
 * استيراد فروع مصرف الرافدين من الصفحة الرسمية (داخل العراق فقط)
 * المصدر: https://www.rafidain-bank.gov.iq/?page=15
 *
 * التشغيل:
 *   pnpm import:branches          — استيراد مع geocoding كامل
 *   pnpm import:branches          — مع Nominatim للفروع غير المطابقة
 *   pnpm import:branches --precise — geocoding دقيق (OSM + Nominatim، ~15 دقيقة)
 */
import fs from "node:fs";
import path from "node:path";
import { geocodeAllBranches } from "./branchGeocoder";
import { preciseGeocodeAll } from "./preciseGeocoder";

const HTML_PATH = path.resolve("scripts/rafidain-page15-full.html");
const OUT_PATH = path.resolve("shared/rafidainBranches.ts");

const GOV_MAP: Record<string, string> = {
  "صلاح الدين": "صلاح الدين",
  "كركوك": "كركوك",
  "نينوى": "نينوى",
  "الانبار": "الأنبار",
  "الأنبار": "الأنبار",
  "الديوانية": "القادسية",
  "المثنى": "المثنى",
  "النجف الأشرف": "النجف",
  "النجف": "النجف",
  "بابل": "بابل",
  "ديالى": "ديالى",
  "كربلاء": "كربلاء",
  "واسط": "واسط",
  "البصرة": "البصرة",
  "ذي قار": "ذي قار",
  "ميسان": "ميسان",
  "بغداد/ الكرخ": "بغداد",
  "بغداد/ الرصافة": "بغداد",
  "بغداد": "بغداد",
};

type RawBranch = { governorate: string; name: string; branchNumber: string; address: string };

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

const MANUAL_BRANCH_NUMBERS: Record<string, string> = {
  "الرئيسي": "001",
  "شارع الصيادلة": "172",
};

function parseNameAndNumber(raw: string): { name: string; branchNumber: string } {
  const text = cleanText(raw);
  const baseName = text.replace(/^فرع\s+/i, "").trim();

  const spaced = text.match(/^(.*?)(?:\s+)(\d(?:\s*\d)*)\s*$/);
  if (spaced) {
    const digits = spaced[2].replace(/\s+/g, "");
    let branchNumber = digits.padStart(3, "0");
    const name = spaced[1].replace(/^فرع\s+/i, "").trim();
    if (/الرئيسي/i.test(name) && branchNumber === "010") branchNumber = "001";
    if (MANUAL_BRANCH_NUMBERS[name]) branchNumber = MANUAL_BRANCH_NUMBERS[name];
    return { name: name || baseName, branchNumber };
  }

  const m = text.match(/(\d{2,3})\s*$/);
  if (!m) {
    const manual = MANUAL_BRANCH_NUMBERS[baseName];
    return { name: baseName, branchNumber: manual ?? "" };
  }
  const branchNumber = (MANUAL_BRANCH_NUMBERS[baseName.replace(new RegExp(`\\s*${m[1]}\\s*$`), "").trim()] ?? m[1]).padStart(3, "0");
  const name = text.replace(new RegExp(`\\s*${m[1]}\\s*$`), "").replace(/^فرع\s+/i, "").trim();
  return { name: name || text, branchNumber };
}

function parseBranches(html: string): RawBranch[] {
  const contentStart = html.indexOf('<div class="content">');
  const outsideIdx = html.indexOf("فروع مصرف الرافدين خارج العراق");
  const slice = outsideIdx > 0 ? html.slice(contentStart, outsideIdx) : html.slice(contentStart);

  const sections = slice.split(/<p><span[^>]*><strong>/i).slice(1);
  const branches: RawBranch[] = [];

  for (const section of sections) {
    const govRaw = cleanText(section.split("</strong>")[0]).replace(/<br\s*\/?>/gi, "");
    if (!govRaw || govRaw.includes("خارج العراق")) continue;

    const governorate = GOV_MAP[govRaw] ?? govRaw;
    const tablePart = section.split("</span></p>")[1] ?? "";
    const rows = tablePart.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

    for (const row of rows) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => cleanText(c[1]));
      if (cells.length < 2) continue;
      if (/اسم|rقم|موقع الفرع/i.test(cells[0])) continue;

      const { name, branchNumber } = parseNameAndNumber(cells[0]);
      if (!name) continue;

      branches.push({ governorate, name, branchNumber, address: cells[1] });
    }
  }

  return branches;
}

type BranchWithCoords = RawBranch & { lat: number; lng: number };

function buildTs(branches: BranchWithCoords[]): string {
  const lines: string[] = [];
  lines.push(`// بيانات فروع مصرف الرافدين داخل العراق فقط`);
  lines.push(`// المصدر الرسمي: https://www.rafidain-bank.gov.iq/?page=15`);
  lines.push(`// آخر تحديث: ${new Date().toISOString().slice(0, 10)} — ${branches.length} فرع — إحداثيات دقيقة (OSM/Nominatim)`);
  lines.push(``);
  lines.push(`export interface RafidainBranch {`);
  lines.push(`  id: number;`);
  lines.push(`  name: string;`);
  lines.push(`  branchNumber: string;`);
  lines.push(`  governorate: string;`);
  lines.push(`  address: string;`);
  lines.push(`  lat: number;`);
  lines.push(`  lng: number;`);
  lines.push(`  aliases?: string[];`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export const RAFIDAIN_BRANCHES: RafidainBranch[] = [`);

  let id = 1;
  let currentGov = "";
  for (const b of branches) {
    if (b.governorate !== currentGov) {
      currentGov = b.governorate;
      lines.push(``);
      lines.push(`  // ===== ${currentGov} =====`);
    }
    const aliases: string[] = [];
    if (b.name !== `فرع ${b.name}`) aliases.push(`فرع ${b.name}`);
    if (b.branchNumber) aliases.push(b.branchNumber);
    const aliasStr = aliases.length ? `, aliases: ${JSON.stringify([...new Set(aliases)])}` : "";
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(
      `  { id: ${id++}, name: "${esc(b.name)}", branchNumber: "${esc(b.branchNumber)}", governorate: "${esc(b.governorate)}", address: "${esc(b.address)}", lat: ${b.lat}, lng: ${b.lng}${aliasStr} },`,
    );
  }

  lines.push(`];`);
  lines.push(``);
  lines.push(`export const getBranchesByGovernorate = (governorate: string): RafidainBranch[] => {`);
  lines.push(`  return RAFIDAIN_BRANCHES.filter((b) => b.governorate === governorate);`);
  lines.push(`};`);
  lines.push(``);
  lines.push(`export const GOVERNORATES: string[] = Array.from(new Set(RAFIDAIN_BRANCHES.map((b) => b.governorate)));`);
  lines.push(``);
  lines.push(`export const TOTAL_BRANCH_COUNT = RAFIDAIN_BRANCHES.length;`);
  lines.push(``);

  return lines.join("\n");
}

async function main() {
  const fast = process.argv.includes("--fast");
  const precise = process.argv.includes("--precise");

  if (!fs.existsSync(HTML_PATH)) {
    console.error("Missing HTML. Download page 15 first.");
    process.exit(1);
  }

  const html = fs.readFileSync(HTML_PATH, "utf8");
  const branches = parseBranches(html);
  console.log(`Parsed ${branches.length} Iraq branches (foreign section excluded)`);

  let results: { lat: number; lng: number }[];

  if (precise) {
    const osmPath = path.resolve("scripts/data/osmRafidainBanks.json");
    if (!fs.existsSync(osmPath)) {
      console.log("Fetching OSM bank data first...");
      const { execSync } = await import("node:child_process");
      execSync("pnpm tsx scripts/fetch-osm-banks.ts", { stdio: "inherit", cwd: process.cwd() });
    }
    console.log("Precise geocoding (OSM + Nominatim) — قد يستغرق 10–20 دقيقة...");
    const out = await preciseGeocodeAll(branches);
    console.log("Geocode sources:", out.stats);
    results = out.results;
  } else {
    console.log(fast ? "Geocoding (fast: places + legacy only)..." : "Geocoding (places + legacy + Nominatim)...");
    const out = await geocodeAllBranches(branches, { useNominatim: !fast });
    console.log("Geocode sources:", out.stats);
    results = out.results;
  }

  const withCoords: BranchWithCoords[] = branches.map((b, i) => ({
    ...b,
    lat: results[i].lat,
    lng: results[i].lng,
  }));

  fs.writeFileSync(OUT_PATH, buildTs(withCoords), "utf8");
  console.log(`Written ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
