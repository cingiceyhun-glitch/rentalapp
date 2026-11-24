import { Dexie, type EntityTable } from 'dexie';
import type { Listing, OwnPhoto } from './types.ts';

// Everything lives on the device (IndexedDB) first, so the app works offline.
// When sync is on, every change is also queued in `outbox` and pushed to the
// cloud by src/sync/engine.ts.

/** A change waiting to be pushed: "listing:<id>" or "photo:<id>". */
export interface OutboxEntry {
  key: string;
  kind: 'listing' | 'photo';
  id: string;
  /** When the change was queued; an entry is only cleared if it wasn't re-queued meanwhile. */
  at: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type HomeHuntDb = Dexie & {
  listings: EntityTable<Listing, 'id'>;
  photos: EntityTable<OwnPhoto, 'id'>;
  outbox: EntityTable<OutboxEntry, 'key'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

export function openDb(name = 'homehunt'): HomeHuntDb {
  const d = new Dexie(name) as HomeHuntDb;
  d.version(1).stores({
    listings: 'id, updatedAt, status, rank, viewingAt, url',
    photos: 'id, listingId, createdAt',
  });
  d.version(2).stores({
    outbox: 'key, at',
    meta: 'key',
  });
  return d;
}

export const db = openDb();

let lastQueuedAt = 0;

export async function enqueue(d: HomeHuntDb, kind: OutboxEntry['kind'], ids: string[]): Promise<void> {
  if (!ids.length) return;
  // Strictly increasing, so a change re-queued within the same millisecond is never mistaken for one already pushed.
  const at = (lastQueuedAt = Math.max(Date.now(), lastQueuedAt + 1));
  await d.outbox.bulkPut(ids.map((id) => ({ key: `${kind}:${id}`, kind, id, at })));
  onLocalChange?.();
}

/** Set by the sync engine so local edits are pushed soon after they happen. */
let onLocalChange: (() => void) | undefined;
export function setLocalChangeListener(fn: (() => void) | undefined): void {
  onLocalChange = fn;
}

export async function saveListing(listing: Listing, d = db): Promise<void> {
  await d.transaction('rw', d.listings, d.outbox, async () => {
    await d.listings.put({ ...listing, updatedAt: Date.now() });
    await enqueue(d, 'listing', [listing.id]);
  });
}

export async function updateListing(id: string, changes: Partial<Listing>, d = db): Promise<void> {
  await d.transaction('rw', d.listings, d.outbox, async () => {
    await d.listings.update(id, { ...changes, updatedAt: Date.now() });
    await enqueue(d, 'listing', [id]);
  });
}

export async function deleteListing(id: string, d = db): Promise<void> {
  await d.transaction('rw', d.listings, d.photos, d.outbox, async () => {
    const photoIds = (await d.photos.where('listingId').equals(id).primaryKeys()) as string[];
    await d.photos.bulkDelete(photoIds);
    await d.listings.delete(id);
    await enqueue(d, 'photo', photoIds);
    await enqueue(d, 'listing', [id]);
  });
}

export async function addPhotos(photos: OwnPhoto[], d = db): Promise<void> {
  await d.transaction('rw', d.photos, d.outbox, async () => {
    await d.photos.bulkPut(photos);
    await enqueue(d, 'photo', photos.map((p) => p.id));
  });
}

export async function deletePhoto(id: string, d = db): Promise<void> {
  await d.transaction('rw', d.photos, d.outbox, async () => {
    await d.photos.delete(id);
    await enqueue(d, 'photo', [id]);
  });
}

export async function findByUrl(url: string): Promise<Listing | undefined> {
  if (!url) return undefined;
  const bare = url.replace(/[?#].*$/, '').replace(/\/$/, '');
  const all = await db.listings.toArray();
  return all.find((l) => l.url && l.url.replace(/[?#].*$/, '').replace(/\/$/, '') === bare);
}
