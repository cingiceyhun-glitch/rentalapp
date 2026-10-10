import type { DealType } from './shared/parse.ts';

export type { DealType };

export const STATUSES = [
  { id: 'interested', label: 'Interested', color: '#64748b' },
  { id: 'contacted', label: 'Contacted', color: '#0ea5e9' },
  { id: 'viewing', label: 'Viewing booked', color: '#8b5cf6' },
  { id: 'viewed', label: 'Viewed', color: '#f59e0b' },
  { id: 'applied', label: 'Applied / offer', color: '#10b981' },
  { id: 'rejected', label: 'Not for me', color: '#ef4444' },
  { id: 'unavailable', label: 'No longer available', color: '#9ca3af' },
] as const;

export type Status = (typeof STATUSES)[number]['id'];

export interface Listing {
  id: string;
  createdAt: number;
  updatedAt: number;

  url: string;
  source: string;
  title: string;
  description: string;
  dealType: DealType;
  price: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  address: string;

  agentName: string;
  agency: string;
  phone: string;
  email: string;

  /** Local date-time, "YYYY-MM-DDTHH:mm", as entered in a datetime-local input. */
  viewingAt: string | null;
  notes: string;
  status: Status;
  /** 0 = not rated, 1–5 stars. */
  rating: number;
  favorite: boolean;
  /** Manual ordering for "My ranking"; lower comes first. */
  rank: number;

  /** Photos taken from the ad (remote URLs). */
  photoUrls: string[];
}

/** A photo the user took or uploaded themselves, stored on the device. */
export interface OwnPhoto {
  id: string;
  listingId: string;
  blob: Blob;
  createdAt: number;
}

export function emptyListing(): Listing {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    url: '',
    source: '',
    title: '',
    description: '',
    dealType: 'rent',
    price: null,
    currency: 'EUR',
    bedrooms: null,
    bathrooms: null,
    areaM2: null,
    address: '',
    agentName: '',
    agency: '',
    phone: '',
    email: '',
    viewingAt: null,
    notes: '',
    status: 'interested',
    rating: 0,
    favorite: false,
    rank: now,
    photoUrls: [],
  };
}
