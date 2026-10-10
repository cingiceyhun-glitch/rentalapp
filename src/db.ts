import { Dexie, type EntityTable } from 'dexie';
import type { Listing, OwnPhoto } from './types.ts';

// Everything lives on the device (IndexedDB). Nothing is sent anywhere except
// the ad link, when the app asks the server to read the ad for you.
export const db = new Dexie('homehunt') as Dexie & {
  listings: EntityTable<Listing, 'id'>;
  photos: EntityTable<OwnPhoto, 'id'>;
};

db.version(1).stores({
  listings: 'id, updatedAt, status, rank, viewingAt, url',
  photos: 'id, listingId, createdAt',
});

export async function saveListing(listing: Listing): Promise<void> {
  await db.listings.put({ ...listing, updatedAt: Date.now() });
}

export async function updateListing(id: string, changes: Partial<Listing>): Promise<void> {
  await db.listings.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteListing(id: string): Promise<void> {
  await db.transaction('rw', db.listings, db.photos, async () => {
    await db.photos.where('listingId').equals(id).delete();
    await db.listings.delete(id);
  });
}

export async function findByUrl(url: string): Promise<Listing | undefined> {
  if (!url) return undefined;
  const bare = url.replace(/[?#].*$/, '').replace(/\/$/, '');
  const all = await db.listings.toArray();
  return all.find((l) => l.url && l.url.replace(/[?#].*$/, '').replace(/\/$/, '') === bare);
}
