import type { IncomingMessage, ServerResponse } from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parseListingHtml, type ExtractedListing } from '../src/shared/parse.ts';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 5_000_000;

/** Handles /api/* requests. Resolves false when the request isn't ours. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });
  if (url.pathname !== '/api/extract') return false;

  const target = url.searchParams.get('url');
  if (!target) return sendJson(res, 400, { error: 'missing_url', message: 'Pass ?url=<listing link>.' });

  try {
    const listing = await fetchAndExtract(target);
    return sendJson(res, 200, listing);
  } catch (err) {
    const e = err instanceof ExtractError ? err : new ExtractError('fetch_failed', String((err as Error)?.message ?? err));
    return sendJson(res, e.status, { error: e.code, message: e.message });
  }
}

export class ExtractError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function fetchAndExtract(target: string) {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new ExtractError('bad_url', 'That does not look like a link.', 400);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new ExtractError('bad_url', 'Only http(s) links are supported.', 400);
  await assertPublicHost(parsed.hostname);

  // Portals with bot protection (idealista in particular) refuse requests from
  // cloud servers, but usually still answer the crawlers that build link
  // previews for WhatsApp and Facebook. Try as a browser first, then as those.
  const failures: string[] = [];
  let best: ExtractedListing | null = null;
  for (const [name, userAgent] of USER_AGENTS) {
    const outcome = await fetchPage(parsed, userAgent);
    if (typeof outcome === 'string') {
      failures.push(`${name}: ${outcome}`);
      continue;
    }
    const listing = parseListingHtml(outcome.html, outcome.url);
    if (listing.price || listing.photoUrls.length) return listing;
    failures.push(`${name}: page had no listing details`);
    if (!best || score(listing) > score(best)) best = listing;
  }
  if (best && score(best) > 0) return best;
  console.warn(`extract ${parsed.hostname} failed:`, failures.join('; '));
  throw new ExtractError('blocked', `${parsed.hostname} didn't share the ad's details (${failures.join('; ')}).`);
}

const USER_AGENTS: [string, string][] = [
  ['browser', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'],
  ['whatsapp', 'WhatsApp/2.24.21.83 A'],
  ['facebook', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
];

/** Returns the page, or a short reason why it couldn't be read. */
async function fetchPage(url: URL, userAgent: string): Promise<{ html: string; url: string } | string> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
    });
    if (!response.ok) return `HTTP ${response.status}`;
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    if (/captcha-delivery\.com|geo\.captcha|cf-chl-|Just a moment\.\.\./i.test(html) && html.length < 50_000) {
      return 'bot check';
    }
    return { html, url: response.url || url.href };
  } catch (err) {
    return (err as Error).name === 'TimeoutError' ? 'timed out' : 'no answer';
  }
}

function score(l: ExtractedListing): number {
  return (l.title ? 1 : 0) + (l.address ? 1 : 0) + (l.bedrooms != null ? 1 : 0) + (l.description ? 1 : 0);
}

/** Refuses links that point at private/internal addresses (SSRF guard). */
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new ExtractError('bad_url', `Could not find ${hostname}.`, 400);
  if (addresses.some(isPrivateAddress)) throw new ExtractError('bad_url', 'That address is not reachable.', 400);
}

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

function sendJson(res: ServerResponse, status: number, body: unknown): true {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
  return true;
}
