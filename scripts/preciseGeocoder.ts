/**
 * Geocoding دقيق: OSM + Nominatim + مراجعة بالقرب من المدينة المرجعية
 */
import fs from "node:fs";
import path from "node:path";
import { IRAQ_PLACES } from "./data/iraqPlaces";
import { LEGACY_BRANCH_COORDS } from "./data/legacyBranchCoords";
import { extractPlaceCandidates, type RawBranchForGeocode, type GeocodeResult } from "./branchGeocoder";

const GOV_EN: Record<string, string> = {
  "بغداد": "Baghdad",
  "الأنبار": "Al Anbar",
  "البصرة": "Basra",
  "نينوى": "Nineveh",
  "كركوك": "Kirkuk",
  "ديالى": "Diyala",
  "صلاح الدين": "Saladin",
  "بابل": "Babylon",
  "كربلاء": "Karbala",
  "النجف": "Najaf",
  "القادسية": "Qadisiyyah",
  "المثنى": "Muthanna",
  "ذي قار": "Dhi Qar",
  "ميسان": "Maysan",
  "واسط": "Wasit",
};

const GOV_COORDS: Record<string, { lat: number; lng: number }> = {
  "بغداد": { lat: 33.3152, lng: 44.3661 },
  "الأنبار": { lat: 33.4231, lng: 43.2987 },
  "البصرة": { lat: 30.5085, lng: 47.7804 },
  "نينوى": { lat: 36.3356, lng: 43.1178 },
  "كركوك": { lat: 35.4681, lng: 44.3922 },
  "ديالى": { lat: 33.7456, lng: 44.6523 },
  "صلاح الدين": { lat: 34.6089, lng: 43.6823 },
  "بابل": { lat: 32.4823, lng: 44.4234 },
  "كربلاء": { lat: 32.6089, lng: 44.0312 },
  "النجف": { lat: 32.01, lng: 44.34 },
  "القادسية": { lat: 31.9923, lng: 44.9234 },
  "المثنى": { lat: 31.3189, lng: 45.2823 },
  "ذي قار": { lat: 31.0423, lng: 46.2712 },
  "ميسان": { lat: 31.8423, lng: 47.1512 },
  "واسط": { lat: 32.4923, lng: 45.8312 },
};

type OsmBank = { lat: number; lng: number; name: string; nameAr: string; operator: string; addr: string };

type ScoredHit = GeocodeResult & { score: number; query?: string };

const OSM_PATH = path.resolve("scripts/data/osmRafidainBanks.json");
const PRECISE_CACHE = path.resolve("scripts/branch-coords-precise.json");

function norm(s: string): string {
  return s
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function getAddressAnchor(address: string): { lat: number; lng: number; radiusKm: number } | null {
  const rules: { pattern: RegExp; place: string; radiusKm: number }[] = [
    { pattern: /العشار|حي الزهور|اسد بابل/i, place: "العشار", radiusKm: 20 },
    { pattern: /شارع المحيط|المعقل/i, place: "المعقل", radiusKm: 20 },
    { pattern: /مطار البصرة/i, place: "مطار البصرة", radiusKm: 15 },
    { pattern: /خور الزبير/i, place: "خور الزبير", radiusKm: 25 },
    { pattern: /الجنينة/i, place: "الجنينة", radiusKm: 25 },
    { pattern: /الشورجة/i, place: "الشورجة", radiusKm: 12 },
    { pattern: /الكاظمية/i, place: "الكاظمية", radiusKm: 12 },
    { pattern: /الأعظمية|الاعظمية/i, place: "الأعظمية", radiusKm: 12 },
    { pattern: /المنصور/i, place: "المنصور", radiusKm: 15 },
    { pattern: /الموصل|نينوى/i, place: "الموصل", radiusKm: 35 },
    { pattern: /العشار/i, place: "العشار", radiusKm: 20 },
    { pattern: /قضاء الفلوجة|الفلوجة/i, place: "الفلوجة", radiusKm: 20 },
    { pattern: /الرمادي/i, place: "الرمادي", radiusKm: 25 },
    { pattern: /النجف/i, place: "النجف", radiusKm: 25 },
    { pattern: /كربلاء/i, place: "كربلاء", radiusKm: 20 },
    { pattern: /الحلة|حلة/i, place: "الحلة", radiusKm: 20 },
    { pattern: /بعقوبة/i, place: "بعقوبة", radiusKm: 20 },
    { pattern: /الناصرية/i, place: "الناصرية", radiusKm: 25 },
    { pattern: /العمارة/i, place: "العمارة", radiusKm: 25 },
    { pattern: /الكوت/i, place: "الكوت", radiusKm: 25 },
  ];

  for (const { pattern, place, radiusKm } of rules) {
    if (pattern.test(address)) {
      const coord = IRAQ_PLACES[place];
      if (coord) return { lat: coord.lat, lng: coord.lng, radiusKm };
    }
  }
  return null;
}

function isValidForAddress(hit: { lat: number; lng: number }, address: string): boolean {
  const anchor = getAddressAnchor(address);
  if (!anchor) return true;
  return haversineKm(anchor, hit) <= anchor.radiusKm;
}

function getCityAnchor(b: RawBranchForGeocode): { lat: number; lng: number } {
  if (b.branchNumber && LEGACY_BRANCH_COORDS[b.branchNumber]) {
    return LEGACY_BRANCH_COORDS[b.branchNumber];
  }
  const candidates = extractPlaceCandidates(b);
  for (const c of candidates) {
    const nc = norm(c);
    for (const [place, coord] of Object.entries(IRAQ_PLACES)) {
      const np = norm(place);
      if ((nc === np || nc.includes(np) || np.includes(nc)) && (!coord.governorate || coord.governorate === b.governorate)) {
        return { lat: coord.lat, lng: coord.lng };
      }
    }
  }
  return GOV_COORDS[b.governorate] ?? { lat: 33.3, lng: 44.4 };
}

function loadOsmBanks(): OsmBank[] {
  if (!fs.existsSync(OSM_PATH)) return [];
  return JSON.parse(fs.readFileSync(OSM_PATH, "utf8")) as OsmBank[];
}

function matchOsm(b: RawBranchForGeocode, osmBanks: OsmBank[], anchor: { lat: number; lng: number }): ScoredHit | null {
  const bn = norm(b.name.replace(/^فرع\s+/i, "").split("/")[0]);
  let best: ScoredHit | null = null;

  for (const bank of osmBanks) {
    const names = [bank.name, bank.nameAr, bank.operator].map(norm).filter(Boolean);
    const dist = haversineKm(anchor, bank);
    if (dist > 80) continue;

    for (const n of names) {
      let score = 0;
      if (n.includes("رافدين") || n.includes("rafidain")) score += 30;
      if (bn && (n.includes(bn) || bn.includes(n))) score += 40;
      if (dist < 5) score += 25;
      else if (dist < 15) score += 15;
      else if (dist < 30) score += 5;

      if (score >= 45 && (!best || score > best.score)) {
        const hit = { lat: +bank.lat.toFixed(4), lng: +bank.lng.toFixed(4) };
        if (!isValidForAddress(hit, b.address)) continue;
        best = {
          lat: hit.lat,
          lng: hit.lng,
          source: "nominatim",
          matched: `osm:${bank.name || bank.nameAr}`,
          score,
        };
      }
    }
  }
  return best;
}

type NominatimItem = {
  lat: string;
  lon: string;
  importance?: number;
  type?: string;
  class?: string;
  display_name?: string;
};

async function nominatimSearch(query: string, limit = 3): Promise<NominatimItem[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "iq");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "legal-unit-platform/1.0 (precise-branch-geocoder)" },
  });
  if (!res.ok) return [];
  return (await res.json()) as NominatimItem[];
}

function withinIraq(lat: number, lng: number): boolean {
  return lat >= 29 && lat <= 38 && lng >= 38.5 && lng <= 49;
}

function scoreNominatimHit(item: NominatimItem, b: RawBranchForGeocode, anchor: { lat: number; lng: number }, query: string): ScoredHit | null {
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);
  if (!withinIraq(lat, lng)) return null;

  const hit = { lat: +lat.toFixed(4), lng: +lng.toFixed(4) };
  if (!isValidForAddress(hit, b.address)) return null;

  const dist = haversineKm(anchor, { lat, lng });
  if (dist > 120) return null;

  let score = (item.importance ?? 0.1) * 20;
  const dn = norm(item.display_name ?? "");
  const bn = norm(b.name);

  if (item.class === "amenity" && item.type === "bank") score += 35;
  if (dn.includes("رافدين") || dn.includes("rafidain")) score += 30;
  if (bn && dn.includes(bn.split(" ")[0])) score += 15;

  if (dist < 3) score += 30;
  else if (dist < 8) score += 22;
  else if (dist < 20) score += 12;
  else if (dist < 50) score += 5;
  else score -= 10;

  if (/شارع|حي|قضاء|ناحية/.test(query)) score += 5;

  return {
    lat: +lat.toFixed(4),
    lng: +lng.toFixed(4),
    source: "nominatim",
    matched: query,
    score,
    query,
  };
}

function buildPreciseQueries(b: RawBranchForGeocode): string[] {
  const govEn = GOV_EN[b.governorate] ?? b.governorate;
  const addr = b.address.replace(/\s+/g, " ").trim();
  const name = b.name.replace(/^فرع\s+/i, "").trim();
  const candidates = extractPlaceCandidates(b);

  const queries: string[] = [
    `مصرف الرافدين ${name}, ${addr}, العراق`,
    `Rafidain Bank ${name}, ${addr}, Iraq`,
    `${addr}, ${b.governorate}, العراق`,
    `Rafidain Bank, ${name}, ${govEn}, Iraq`,
  ];

  for (const c of candidates.slice(0, 3)) {
    queries.push(`Rafidain Bank, ${c}, ${govEn}, Iraq`);
    queries.push(`${c}, ${govEn}, Iraq`);
    if (/شارع|ساحة|حي/.test(c)) queries.push(`${c}, ${govEn}, Iraq`);
  }

  return [...new Set(queries)];
}

function pickBest(hits: ScoredHit[]): ScoredHit | null {
  if (!hits.length) return null;
  return hits.sort((a, b) => b.score - a.score)[0];
}

export async function preciseGeocodeBranch(
  b: RawBranchForGeocode,
  osmBanks: OsmBank[],
  cache: Record<string, ScoredHit>,
): Promise<GeocodeResult & { score?: number }> {
  const key = `${b.branchNumber || b.name}|${b.governorate}`;
  const cached = cache[key];
  if (cached?.score && cached.score >= 50 && isValidForAddress(cached, b.address)) {
    return cached;
  }

  const anchor = getCityAnchor(b);

  const osmHit = matchOsm(b, osmBanks, anchor);
  if (osmHit && osmHit.score >= 55) {
    cache[key] = osmHit;
    return osmHit;
  }

  const allHits: ScoredHit[] = osmHit ? [osmHit] : [];

  for (const q of buildPreciseQueries(b).slice(0, 5)) {
    const items = await nominatimSearch(q, 3);
    for (const item of items) {
      const hit = scoreNominatimHit(item, b, anchor, q);
      if (hit) allHits.push(hit);
    }
    await sleep(1100);
    const best = pickBest(allHits);
    if (best && best.score >= 50) break;
  }

  const best = pickBest(allHits);
  if (best && best.score >= 40) {
    cache[key] = best;
    return best;
  }

  if (b.branchNumber && LEGACY_BRANCH_COORDS[b.branchNumber]) {
    const r: ScoredHit = { ...LEGACY_BRANCH_COORDS[b.branchNumber], source: "legacy", matched: b.branchNumber, score: 35 };
    cache[key] = r;
    return r;
  }

  const fallback: ScoredHit = { ...anchor, source: "place", matched: "anchor", score: 25 };
  cache[key] = fallback;
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function loadPreciseCache(): Record<string, ScoredHit> {
  if (!fs.existsSync(PRECISE_CACHE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PRECISE_CACHE, "utf8"));
  } catch {
    return {};
  }
}

export function savePreciseCache(cache: Record<string, ScoredHit>): void {
  fs.writeFileSync(PRECISE_CACHE, JSON.stringify(cache, null, 2), "utf8");
}

export async function preciseGeocodeAll(
  branches: RawBranchForGeocode[],
  opts?: { startAt?: number },
): Promise<{ results: GeocodeResult[]; stats: Record<string, number> }> {
  const osmBanks = loadOsmBanks();
  console.log(`OSM banks loaded: ${osmBanks.length}`);
  const cache = loadPreciseCache();
  const results: GeocodeResult[] = [];
  const stats: Record<string, number> = {};
  const start = opts?.startAt ?? 0;

  for (let i = start; i < branches.length; i++) {
    const b = branches[i];
    const r = await preciseGeocodeBranch(b, osmBanks, cache);
    results.push(r);
    stats[r.source] = (stats[r.source] || 0) + 1;
    if ((i + 1) % 10 === 0) {
      savePreciseCache(cache);
      console.log(`  precise ${i + 1}/${branches.length} — last: ${b.name} (${r.source}, score ${(r as ScoredHit).score ?? "?"})`);
    }
  }

  savePreciseCache(cache);
  return { results, stats };
}
