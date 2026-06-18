/** جلب مواقع فروع الرافدين من Nominatim/OSM */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("scripts/data/osmRafidainBanks.json");

type Bank = { lat: number; lng: number; name: string; nameAr: string; operator: string; addr: string };

async function nominatimSearch(q: string, limit = 50): Promise<Bank[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "iq");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "legal-unit-platform/1.0 (fetch-osm-banks)" },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { lat: string; lon: string; display_name: string; type?: string; class?: string }[];
  return data
    .filter((d) => d.class === "amenity" || d.display_name.toLowerCase().includes("rafidain") || d.display_name.includes("رافدين"))
    .map((d) => ({
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      name: d.display_name,
      nameAr: d.display_name.includes("رافدين") ? d.display_name : "",
      operator: "Rafidain Bank",
      addr: d.display_name,
    }));
}

async function main() {
  const queries = [
    "Rafidain Bank Iraq",
    "مصرف الرافدين العراق",
    "Rafidain Bank Baghdad",
    "Rafidain Bank Basra",
    "Rafidain Bank Mosul",
    "Rafidain Bank Najaf",
    "Rafidain Bank Karbala",
    "Rafidain Bank Erbil",
  ];

  const seen = new Set<string>();
  const banks: Bank[] = [];

  for (const q of queries) {
    console.log("Searching:", q);
    const hits = await nominatimSearch(q);
    for (const h of hits) {
      const key = `${h.lat.toFixed(4)},${h.lng.toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        banks.push(h);
      }
    }
    await new Promise((r) => setTimeout(r, 1100));
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(banks, null, 2), "utf8");
  console.log(`Saved ${banks.length} OSM/Nominatim banks to ${OUT}`);
}

main().catch(console.error);
