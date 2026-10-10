import type { IncomingMessage, ServerResponse } from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parseListingHtml } from '../src/shared/parse.ts';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 5_000_000;

/** Handles /api/* requests. Resolves false when the request isn't ours. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
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

  const response = await fetch(parsed, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8',
    },
  });

  // Big portals (idealista in particular) put bot protection in front of
  // their pages. Report that clearly so the app can suggest the bookmarklet.
  if (response.status === 403 || response.status === 429 || response.status === 401) {
    throw new ExtractError('blocked', `${parsed.hostname} refused the request (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new ExtractError('fetch_failed', `${parsed.hostname} answered HTTP ${response.status}.`);

  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  if (/captcha-delivery\.com|geo\.captcha|cf-chl-|Just a moment\.\.\./i.test(html) && html.length < 50_000) {
    throw new ExtractError('blocked', `${parsed.hostname} showed a bot check instead of the ad.`);
  }
  return parseListingHtml(html, response.url || parsed.href);
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
