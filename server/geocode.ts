// Address → map coordinates, via OpenStreetMap's Nominatim. Its usage policy
// asks for at most one request per second, an identifying User-Agent and
// caching, so requests are queued and answers kept in memory.

export interface GeoResult {
  lat: number;
  lng: number;
  /** True when only part of the address (e.g. the neighbourhood) was found. */
  approx: boolean;
}

const BASE = process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'HomeHunt/0.1 (personal home-search organiser; https://homehunt-85f4.onrender.com)';
const MIN_GAP_MS = 1100;
const cache = new Map<string, { lat: number; lng: number } | null>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

export async function geocode(address: string, country?: string): Promise<GeoResult | null> {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  // Try the full address, then drop the most specific part until something matches.
  for (let i = 0; i < parts.length; i++) {
    const q = parts.slice(i).join(', ');
    if (/^\d+\w?$/.test(parts[i]) && i > 0) continue; // a lone house number is not worth a lookup
    const hit = await lookup(q, country);
    if (hit) return { ...hit, approx: i > 0 };
  }
  return null;
}

async function lookup(q: string, country?: string): Promise<{ lat: number; lng: number } | null> {
  const key = `${country ?? ''}|${q.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const run = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const url = new URL('/search', BASE);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('q', q);
    if (country) url.searchParams.set('countrycodes', country);
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Geocoder answered HTTP ${res.status}`);
    const rows = (await res.json()) as { lat: string; lon: string }[];
    const hit = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
    cache.set(key, hit);
    return hit;
  });
  queue = run.catch(() => {});
  return run;
}
