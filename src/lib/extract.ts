import type { ExtractedListing } from '../shared/parse.ts';

export type ExtractResult =
  | { ok: true; data: ExtractedListing }
  | { ok: false; code: string; message: string };

export async function extractFromUrl(url: string): Promise<ExtractResult> {
  try {
    const res = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
    const body = await res.json();
    if (!res.ok) return { ok: false, code: body.error ?? 'fetch_failed', message: body.message ?? 'Could not read the ad.' };
    return { ok: true, data: body as ExtractedListing };
  } catch {
    return { ok: false, code: 'offline', message: 'Could not reach the server — are you offline?' };
  }
}
