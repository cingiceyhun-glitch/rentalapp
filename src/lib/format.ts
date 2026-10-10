import type { Listing } from '../types.ts';

export function formatPrice(l: Pick<Listing, 'price' | 'currency' | 'dealType'>): string {
  if (l.price == null) return 'Price ?';
  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: l.currency || 'EUR',
    maximumFractionDigits: 0,
  }).format(l.price);
  return l.dealType === 'rent' ? `${amount}/mo` : amount;
}

export function formatViewing(viewingAt: string): string {
  const d = new Date(viewingAt);
  if (Number.isNaN(d.getTime())) return viewingAt;
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relativeDay(viewingAt: string, now = new Date()): string {
  const d = new Date(viewingAt);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return `In ${days} days`;
  if (days < 0) return `${-days} days ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function facts(l: Listing): string {
  return [
    l.bedrooms != null ? (l.bedrooms === 0 ? 'Studio' : `${l.bedrooms} bed`) : '',
    l.bathrooms != null ? `${l.bathrooms} bath` : '',
    l.areaM2 != null ? `${l.areaM2} m²` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function pricePerM2(l: Listing): string | null {
  if (l.price == null || !l.areaM2) return null;
  return `${(l.price / l.areaM2).toFixed(l.dealType === 'rent' ? 1 : 0)} ${l.currency === 'EUR' ? '€' : l.currency}/m²`;
}

/** Digits-only phone, keeping a leading +, for tel: and WhatsApp links. */
export function dialable(phone: string, defaultCountry = '351'): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  // Portuguese numbers are 9 digits; assume the default country for bare numbers.
  if (digits.length === 9 && defaultCountry) return `+${defaultCountry}${digits}`;
  return digits;
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${dialable(phone).replace('+', '')}?text=${encodeURIComponent(text)}`;
}

export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
