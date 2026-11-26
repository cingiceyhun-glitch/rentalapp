import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A stand-in for OpenStreetMap's Nominatim that only knows two places.
const KNOWN: Record<string, [string, string]> = {
  'cascais e estoril': ['38.70', '-9.42'],
  'avenida faial, estoril': ['38.7065', '-9.3972'],
};
const seen: string[] = [];
let server: Server;
let geocode: typeof import('../server/geocode.ts').geocode;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    const q = url.searchParams.get('q')!.toLowerCase();
    seen.push(`${q}|${url.searchParams.get('countrycodes') ?? ''}|${req.headers['user-agent']}`);
    const hit = KNOWN[q];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(hit ? [{ lat: hit[0], lon: hit[1] }] : []));
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.GEOCODER_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ geocode } = await import('../server/geocode.ts'));
});
afterAll(() => server.close());

describe('geocode', () => {
  it('finds an exact address', async () => {
    expect(await geocode('Avenida Faial, Estoril', 'pt')).toEqual({ lat: 38.7065, lng: -9.3972, approx: false });
    expect(seen[0]).toMatch(/^avenida faial, estoril\|pt\|HomeHunt\//);
  });

  it('falls back to the area and marks it approximate', async () => {
    expect(await geocode('Rua dos Hibíscos, 1, Cascais e Estoril', 'pt')).toEqual({ lat: 38.7, lng: -9.42, approx: true });
  }, 10_000);

  it('returns null when nothing matches, and remembers answers', async () => {
    const before = seen.length;
    expect(await geocode('Nowhere street', 'pt')).toBeNull();
    expect(await geocode('Avenida Faial, Estoril', 'pt')).toMatchObject({ approx: false });
    expect(seen.length - before).toBe(1); // the repeat came from the cache
  }, 10_000);
});
