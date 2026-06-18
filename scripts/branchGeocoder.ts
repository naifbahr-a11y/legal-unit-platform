import fs from "node:fs";
import path from "node:path";
import { IRAQ_PLACES } from "./data/iraqPlaces";
import { LEGACY_BRANCH_COORDS } from "./data/legacyBranchCoords";

export type GeocodeResult = {
  lat: number;
  lng: number;
  source: "legacy" | "place" | "nominatim" | "governorate";
  matched?: string;
};

export type RawBranchForGeocode = {
  name: string;
  branchNumber: string;
  governorate: string;
  address: string;
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

const CACHE_PATH = path.resolve("scripts/branch-coords-cache.json");

type CacheEntry = GeocodeResult & { query?: string };
type CoordCache = Record<string, CacheEntry>;

function norm(s: string): string {
  return s
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cacheKey(b: RawBranchForGeocode): string {
  return `${b.branchNumber || b.name}|${b.governorate}`;
}

export function loadCoordCache(): CoordCache {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as CoordCache;
  } catch {
    return {};
  }
}

export function saveCoordCache(cache: CoordCache): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

/** استخراج أسماء أماكن محتملة من العنوان واسم الفرع */
export function extractPlaceCandidates(b: RawBranchForGeocode): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
    if (t.length >= 2) out.push(t);
  };

  push(b.name.replace(/^فرع\s+/i, "").split("/")[0].trim());

  const addr = b.address;
  for (const m of addr.matchAll(/قضاء\s+([^/،]+)/g)) push(m[1]);
  for (const m of addr.matchAll(/ناحية\s+([^/،]+)/g)) push(m[1]);
  for (const m of addr.matchAll(/حي\s+([^/،]+)/g)) push(m[1]);

  for (const part of addr.split(/[/،]/)) {
    const p = part.trim().replace(/^(بغداد|الانبار|الأنبار|نينوى|التأميم|التاميم|القادسية|المثنى|النجف|بابل|ديالى|كربلاء|واسط|البصرة|ذي قار|ميسان|صلاح الدين|كركوك)\s*/i, "");
    if (p.length >= 2) push(p);
  }

  return [...new Set(out)];
}

function matchPlace(candidates: string[], governorate: string): GeocodeResult | null {
  const sortedPlaces = Object.keys(IRAQ_PLACES).sort((a, b) => b.length - a.length);

  for (const cand of candidates) {
    const nc = norm(cand);
    for (const place of sortedPlaces) {
      const np = norm(place);
      if (nc === np || nc.includes(np) || np.includes(nc)) {
        const coord = IRAQ_PLACES[place];
        if (!coord.governorate || coord.governorate === governorate) {
          return { lat: coord.lat, lng: coord.lng, source: "place", matched: place };
        }
      }
    }
  }
  return null;
}

function withinIraq(lat: number, lng: number): boolean {
  return lat >= 29 && lat <= 38 && lng >= 38.5 && lng <= 49;
}

async function nominatimSearch(query: string): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "iq");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "legal-unit-platform/1.0 (branch-geocoder)" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  if (!withinIraq(lat, lng)) return null;

  return { lat: +lat.toFixed(4), lng: +lng.toFixed(4), source: "nominatim", matched: query };
}

function buildNominatimQueries(b: RawBranchForGeocode, candidates: string[]): string[] {
  const queries: string[] = [];
  for (const c of candidates.slice(0, 4)) {
    queries.push(`${c}, ${b.governorate}, Iraq`);
    queries.push(`Rafidain Bank, ${c}, Iraq`);
  }
  queries.push(`${b.name}, ${b.governorate}, Iraq`);
  queries.push(`${b.governorate}, Iraq`);
  return [...new Set(queries)];
}

function slightOffset(base: { lat: number; lng: number }, seed: number): { lat: number; lng: number } {
  const angle = ((seed * 97) % 360) * (Math.PI / 180);
  const r = 0.004 + (seed % 3) * 0.002;
  return {
    lat: +(base.lat + r * Math.sin(angle)).toFixed(4),
    lng: +(base.lng + r * Math.cos(angle)).toFixed(4),
  };
}

export async function geocodeBranch(
  b: RawBranchForGeocode,
  cache: CoordCache,
  opts: { useNominatim: boolean; branchId: number },
): Promise<GeocodeResult> {
  const key = cacheKey(b);
  if (cache[key]?.source === "nominatim" || cache[key]?.source === "legacy") {
    return cache[key];
  }
  if (cache[key]?.source === "place" && cache[key].matched) {
    return cache[key];
  }

  if (b.branchNumber && LEGACY_BRANCH_COORDS[b.branchNumber]) {
    const r = { ...LEGACY_BRANCH_COORDS[b.branchNumber], source: "legacy" as const, matched: b.branchNumber };
    cache[key] = r;
    return r;
  }

  const candidates = extractPlaceCandidates(b);
  const placeHit = matchPlace(candidates, b.governorate);
  if (placeHit) {
    const offset = slightOffset(placeHit, opts.branchId);
    const r = { ...offset, source: "place" as const, matched: placeHit.matched };
    cache[key] = r;
    return r;
  }

  if (opts.useNominatim) {
    for (const q of buildNominatimQueries(b, candidates)) {
      const hit = await nominatimSearch(q);
      if (hit) {
        cache[key] = { ...hit, query: q };
        await sleep(1100);
        return hit;
      }
      await sleep(1100);
    }
  }

  const gov = GOV_COORDS[b.governorate] ?? { lat: 33.3, lng: 44.4 };
  const r = { ...slightOffset(gov, opts.branchId), source: "governorate" as const };
  cache[key] = r;
  return r;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function geocodeAllBranches(
  branches: RawBranchForGeocode[],
  opts: { useNominatim: boolean } = { useNominatim: true },
): Promise<{ results: GeocodeResult[]; cache: CoordCache; stats: Record<string, number> }> {
  const cache = loadCoordCache();
  const results: GeocodeResult[] = [];
  const stats: Record<string, number> = {};

  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    const r = await geocodeBranch(b, cache, { useNominatim: opts.useNominatim, branchId: i + 1 });
    results.push(r);
    stats[r.source] = (stats[r.source] || 0) + 1;
    if ((i + 1) % 20 === 0) console.log(`  geocoded ${i + 1}/${branches.length}...`);
  }

  saveCoordCache(cache);
  return { results, cache, stats };
}
