import { STATUSES, type Listing } from '../types.ts';

const COLUMNS: [string, (l: Listing) => string | number | null][] = [
  ['Title', (l) => l.title],
  ['Link', (l) => l.url],
  ['Type', (l) => l.dealType],
  ['Price', (l) => l.price],
  ['Currency', (l) => l.currency],
  ['Bedrooms', (l) => l.bedrooms],
  ['Bathrooms', (l) => l.bathrooms],
  ['Area m2', (l) => l.areaM2],
  ['Address', (l) => l.address],
  ['Status', (l) => STATUSES.find((s) => s.id === l.status)?.label ?? l.status],
  ['Rating', (l) => l.rating || ''],
  ['Favourite', (l) => (l.favorite ? 'yes' : '')],
  ['Viewing', (l) => l.viewingAt?.replace('T', ' ') ?? ''],
  ['Agent', (l) => l.agentName],
  ['Agency', (l) => l.agency],
  ['Phone', (l) => l.phone],
  ['Email', (l) => l.email],
  ['Notes', (l) => l.notes],
  ['Added', (l) => new Date(l.createdAt).toISOString().slice(0, 10)],
];

export function toCsv(listings: Listing[]): string {
  const escape = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [COLUMNS.map(([h]) => h), ...listings.map((l) => COLUMNS.map(([, get]) => get(l)))];
  // BOM so Excel opens accented characters (ç, ã…) correctly.
  return '\uFEFF' + rows.map((r) => r.map(escape).join(',')).join('\r\n');
}
