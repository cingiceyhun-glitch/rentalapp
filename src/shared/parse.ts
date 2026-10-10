// Pulls listing details out of a property ad's HTML.
//
// This module has no DOM or Node dependencies so it runs both on the server
// (/api/extract fetches the page) and in the browser (the bookmarklet hands
// over the HTML of a page the user already has open).

export type DealType = 'rent' | 'buy';

export interface ExtractedListing {
  url: string;
  source: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  dealType?: DealType;
  bedrooms?: number;
  bathrooms?: number;
  areaM2?: number;
  address?: string;
  agentName?: string;
  agency?: string;
  phone?: string;
  email?: string;
  photoUrls: string[];
}

interface SiteRule {
  host: RegExp;
  /** Matches photo URLs worth keeping when scanning the raw HTML. */
  photo?: RegExp;
  /** Rewrites a matched photo URL to its largest variant. */
  upscalePhoto?: (url: string) => string;
}

// Site-specific knowledge. Everything else falls back to Open Graph, JSON-LD
// and text heuristics, which already cover most portals.
const SITE_RULES: SiteRule[] = [
  {
    host: /(^|\.)idealista\.(pt|com|it)$/,
    photo: /https?:\/\/img\d*\.idealista\.(?:pt|com|it)\/blur\/[^"'\s)\\]+?\.(?:jpe?g|webp)/gi,
    upscalePhoto: (u) => u.replace(/\/blur\/[^/]+\//, '/blur/WEB_DETAIL-XL-L/'),
  },
  {
    host: /(^|\.)imovirtual\.com$/,
    photo: /https?:\/\/ireland\.apollo\.olxcdn\.com\/v1\/files\/[^"'\s)\\]+/gi,
    upscalePhoto: (u) => u.replace(/;s=\d+x\d+.*$/, ''),
  },
  {
    host: /(^|\.)casa\.sapo\.pt$/,
    photo: /https?:\/\/media\.casasapo\.pt\/[^"'\s)\\]+?\.(?:jpe?g|webp)/gi,
  },
  {
    host: /(^|\.)supercasa\.pt$/,
    photo: /https?:\/\/media\.supercasa\.pt\/[^"'\s)\\]+?\.(?:jpe?g|webp)/gi,
  },
];

const MAX_PHOTOS = 40;

export function sourceOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function parseListingHtml(html: string, pageUrl: string): ExtractedListing {
  const source = sourceOf(pageUrl);
  const meta = readMetaTags(html);
  const ld = readJsonLd(html);
  const result: ExtractedListing = { url: pageUrl, source, photoUrls: [] };

  result.title = clean(ld.name ?? meta['og:title'] ?? meta['twitter:title'] ?? readTitleTag(html));
  result.description = clean(ld.description ?? meta['og:description'] ?? meta['description']);

  // Price: structured data first, then meta, then whatever the text says.
  const ldPrice = toNumber(ld.price);
  if (ldPrice) {
    result.price = ldPrice;
    result.currency = ld.priceCurrency ?? 'EUR';
  } else if (meta['product:price:amount'] || meta['og:price:amount']) {
    result.price = parsePrice(meta['product:price:amount'] ?? meta['og:price:amount']);
    result.currency = meta['product:price:currency'] ?? meta['og:price:currency'] ?? 'EUR';
  } else {
    const fromText = findPriceInText(`${result.title ?? ''} ${result.description ?? ''}`);
    if (fromText) {
      result.price = fromText;
      result.currency = 'EUR';
    }
  }

  const text = `${pageUrl} ${result.title ?? ''} ${result.description ?? ''}`;
  result.dealType = detectDealType(text);
  result.bedrooms = toNumber(ld.bedrooms) ?? findBedrooms(text);
  result.bathrooms = toNumber(ld.bathrooms);
  result.areaM2 = toNumber(ld.area) ?? findArea(text);
  result.address = clean(ld.address ?? findAddressInTitle(result.title));
  result.agentName = clean(ld.agentName);
  result.agency = clean(ld.agency);
  result.phone = clean(ld.telephone ?? findTelLink(html));
  result.email = clean(ld.email ?? findMailtoLink(html));

  result.photoUrls = collectPhotos(html, pageUrl, source, [...ld.images, ...meta.images]);

  for (const key of Object.keys(result) as (keyof ExtractedListing)[]) {
    if (result[key] === undefined || result[key] === '') delete result[key];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Meta tags

type MetaMap = Record<string, string> & { images: string[] };

function readMetaTags(html: string): MetaMap {
  const out = { images: [] as string[] } as MetaMap;
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = readAttributes(tag);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? '').toLowerCase();
    const content = attrs.content;
    if (!key || content === undefined) continue;
    if (key === 'og:image' || key === 'og:image:url' || key === 'twitter:image') {
      out.images.push(decodeEntities(content));
    } else if (!(key in out)) {
      out[key] = decodeEntities(content);
    }
  }
  return out;
}

function readAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return attrs;
}

function readTitleTag(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]) : undefined;
}

// ---------------------------------------------------------------------------
// JSON-LD (schema.org)

interface LdFacts {
  name?: string;
  description?: string;
  price?: unknown;
  priceCurrency?: string;
  bedrooms?: unknown;
  bathrooms?: unknown;
  area?: unknown;
  address?: string;
  telephone?: string;
  email?: string;
  agentName?: string;
  agency?: string;
  images: string[];
}

const LISTING_TYPES = /(Residence|Apartment|House|SingleFamilyResidence|Accommodation|RealEstateListing|Product|Offer|Place|Room)/;
const AGENT_TYPES = /(RealEstateAgent|Organization|Person|LocalBusiness)/;

function readJsonLd(html: string): LdFacts {
  const facts: LdFacts = { images: [] };
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    walkLd(data, facts, 0);
  }
  return facts;
}

function walkLd(node: unknown, facts: LdFacts, depth: number): void {
  if (depth > 8 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkLd(item, facts, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = String(obj['@type'] ?? '');

  if (AGENT_TYPES.test(type) && !LISTING_TYPES.test(type)) {
    if (type.includes('Person')) facts.agentName ??= str(obj.name);
    else facts.agency ??= str(obj.name);
    facts.telephone ??= str(obj.telephone);
    facts.email ??= str(obj.email)?.replace(/^mailto:/, '');
  } else {
    if (LISTING_TYPES.test(type)) {
      facts.name ??= str(obj.name);
      facts.description ??= str(obj.description);
    }
    if (obj.price !== undefined) {
      facts.price ??= obj.price;
      facts.priceCurrency ??= str(obj.priceCurrency);
    }
    facts.bedrooms ??= obj.numberOfBedrooms ?? obj.numberOfRooms;
    facts.bathrooms ??= obj.numberOfBathroomsTotal ?? obj.numberOfBathrooms;
    if (obj.floorSize && typeof obj.floorSize === 'object') {
      facts.area ??= (obj.floorSize as Record<string, unknown>).value;
    }
    if (obj.address) facts.address ??= formatAddress(obj.address);
    facts.images.push(...ldImages(obj.image ?? obj.photo));
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'image' || key === 'photo' || key === 'address') continue;
    if (value && typeof value === 'object') walkLd(value, facts, depth + 1);
  }
}

function formatAddress(addr: unknown): string | undefined {
  if (typeof addr === 'string') return addr;
  if (!addr || typeof addr !== 'object') return undefined;
  const a = addr as Record<string, unknown>;
  const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode]
    .map(str)
    .filter((p): p is string => !!p);
  return parts.length ? [...new Set(parts)].join(', ') : undefined;
}

function ldImages(image: unknown): string[] {
  if (!image) return [];
  if (typeof image === 'string') return [image];
  if (Array.isArray(image)) return image.flatMap(ldImages);
  if (typeof image === 'object') {
    const o = image as Record<string, unknown>;
    return ldImages(o.contentUrl ?? o.url);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Text heuristics (tuned for Portuguese / Spanish / English portals)

export function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d.,]/g, '');
  if (!digits) return undefined;
  let normalised: string;
  if (/^\d{1,3}([.,\s]\d{3})+$/.test(digits)) {
    normalised = digits.replace(/[.,\s]/g, ''); // 1.500 / 1,500 / 1 500
  } else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(digits)) {
    normalised = digits.replace(/\./g, '').replace(',', '.'); // 1.500,50
  } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(digits)) {
    normalised = digits.replace(/,/g, ''); // 1,500.50
  } else {
    normalised = digits.replace(',', '.');
  }
  const n = Number(normalised);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function findPriceInText(text: string): number | undefined {
  const m =
    text.match(/(\d{1,3}(?:[.,\s]\d{3})+|\d+)(?:[.,]\d{1,2})?\s?(?:€|eur\b|euros?\b)/i) ??
    text.match(/€\s?(\d{1,3}(?:[.,\s]\d{3})+|\d+)/i);
  return m ? parsePrice(m[1]) : undefined;
}

function detectDealType(text: string): DealType | undefined {
  const t = text.toLowerCase();
  if (/arrendar|arrendamento|alugar|aluguer|alquiler|\bfor rent\b|\bto rent\b|\/rent\b|\/mes\b|\/month|por m[eê]s/.test(t)) return 'rent';
  if (/comprar|\bvenda\b|\bà venda\b|\bvende-se\b|\bfor sale\b|\/buy\b|\/venda\b/.test(t)) return 'buy';
  return undefined;
}

function findBedrooms(text: string): number | undefined {
  // Portuguese typology: T0, T1, T2+1 ...
  const t = text.match(/\bT(\d{1,2})(?:\s?\+\s?\d)?\b/);
  if (t) return Number(t[1]);
  const words = text.match(/(\d{1,2})\s?(?:quartos?|bedrooms?|beds?|habitaciones|dormit[óo]rios?)\b/i);
  return words ? Number(words[1]) : undefined;
}

function findArea(text: string): number | undefined {
  const m = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s?(?:m²|m2|sqm|metros quadrados)/i);
  return m ? Number(m[1].replace(',', '.')) : undefined;
}

function findAddressInTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  // "Apartamento T2 em Rua X, Cascais" / "Flat for rent in Rua X, Cascais"
  const m = title.match(/\b(?:em|in|en)\s+(.+?)(?:\s+[-|—–]\s+.*)?$/i);
  return m ? m[1].trim() : undefined;
}

function findTelLink(html: string): string | undefined {
  const m = html.match(/href\s*=\s*["']tel:([+\d\s().-]{6,})["']/i);
  return m ? m[1].trim() : undefined;
}

function findMailtoLink(html: string): string | undefined {
  const m = html.match(/href\s*=\s*["']mailto:([^"'?]+)/i);
  return m ? decodeEntities(m[1]).trim() : undefined;
}

// ---------------------------------------------------------------------------
// Photos

function collectPhotos(html: string, pageUrl: string, source: string, structured: string[]): string[] {
  const rule = SITE_RULES.find((r) => r.host.test(source));
  const found: string[] = [...structured];
  if (rule?.photo) {
    const unescaped = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
    for (const [url] of unescaped.matchAll(rule.photo)) found.push(url);
  }

  const seen = new Set<string>();
  const photos: string[] = [];
  for (const raw of found) {
    let url: string;
    try {
      url = new URL(decodeEntities(raw), pageUrl).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(url)) continue;
    if (rule?.upscalePhoto) url = rule.upscalePhoto(url);
    const key = url.replace(/[?#].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    photos.push(url);
    if (photos.length >= MAX_PHOTOS) break;
  }
  return photos;
}

// ---------------------------------------------------------------------------
// Small helpers

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v === 'string') return parsePrice(v);
  if (v && typeof v === 'object' && 'value' in v) return toNumber((v as { value: unknown }).value);
  return undefined;
}

function clean(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = decodeEntities(v).replace(/\s+/g, ' ').trim();
  return s || undefined;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', sup2: '²',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ',
  ccedil: 'ç', agrave: 'à', acirc: 'â', ecirc: 'ê', ocirc: 'ô', ordm: 'º', ordf: 'ª',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Pulls the first http(s) URL out of free text (share sheets often send "Look at this! https://…"). */
export function findUrl(text: string | null | undefined): string | undefined {
  const m = text?.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,;!?]+$/, '') : undefined;
}
