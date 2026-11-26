import { updateListing } from '../db.ts';
import type { Listing } from '../types.ts';

export interface Place {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** A home needs a (new) lookup when it has an address that hasn't been looked up yet. */
export function needsLocation(l: Listing): boolean {
  return !!l.address.trim() && l.geoFor !== l.address;
}

function countryFor(source: string): string | undefined {
  const tld = source.split('.').pop()?.toLowerCase();
  return tld && /^(pt|es|it|fr|de|nl|be|ie)$/.test(tld) ? tld : undefined;
}

export async function lookupAddress(address: string, country?: string): Promise<{ lat: number; lng: number; approx: boolean } | null | 'failed'> {
  try {
    const qs = new URLSearchParams({ q: address });
    if (country) qs.set('cc', country);
    const res = await fetch(`/api/geocode?${qs}`);
    if (res.status === 404) return null;
    if (!res.ok) return 'failed';
    return await res.json();
  } catch {
    return 'failed';
  }
}

let running = false;

/** Looks up homes without a location, one at a time; results are saved (and synced). */
export async function locateHomes(listings: Listing[], onProgress?: (left: number) => void): Promise<void> {
  if (running) return;
  running = true;
  try {
    const todo = listings.filter(needsLocation);
    for (let i = 0; i < todo.length; i++) {
      onProgress?.(todo.length - i);
      const l = todo[i];
      const hit = await lookupAddress(l.address, countryFor(l.source));
      if (hit === 'failed') break; // offline or server trouble: try again next time
      await updateListing(l.id, hit ? { lat: hit.lat, lng: hit.lng, geoApprox: hit.approx, geoFor: l.address } : { lat: null, lng: null, geoFor: l.address });
    }
  } finally {
    running = false;
    onProgress?.(0);
  }
}

/** Straight-line distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

// Your places (work, school…) are kept on this device.
const PLACES_KEY = 'homehunt-places';

export function loadPlaces(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(PLACES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function savePlaces(places: Place[]): void {
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(places));
  } catch {
    /* storage unavailable */
  }
}
