import { enqueue, type HomeHuntDb, type OutboxEntry } from '../db.ts';
import type { Listing, OwnPhoto } from '../types.ts';

// Local-first sync. The device's IndexedDB stays the source of truth for the
// UI; a sync round pulls what other devices changed since last time, then
// pushes this device's queued changes. For homes the newest edit wins (by edit
// time); own photos never change, they are only added or deleted.

export interface RemoteListing {
  id: string;
  data: Listing | Record<string, never>;
  updated_at: number;
  deleted: boolean;
}

export interface RemotePhoto {
  id: string;
  listing_id: string;
  created_at: number;
  path: string;
  deleted: boolean;
}

type Pulled<T> = T & { server_updated_at: string };

/** What a sync round needs from the cloud. Implemented for Supabase in ./supabase.ts. */
export interface Remote {
  readonly userId: string;
  /** Rows changed after `since` (exclusive), oldest first. */
  pullListings(since: string | null, limit: number): Promise<Pulled<RemoteListing>[]>;
  pullPhotos(since: string | null, limit: number): Promise<Pulled<RemotePhoto>[]>;
  upsertListings(rows: RemoteListing[]): Promise<void>;
  upsertPhotos(rows: RemotePhoto[]): Promise<void>;
  upload(path: string, blob: Blob): Promise<void>;
  download(path: string): Promise<Blob>;
  remove(paths: string[]): Promise<void>;
}

const PAGE = 500;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export interface SyncResult {
  pulled: number;
  pushed: number;
}

export async function syncOnce(d: HomeHuntDb, remote: Remote): Promise<SyncResult> {
  await adoptAccount(d, remote.userId);
  const pulled = (await pullListings(d, remote)) + (await pullPhotos(d, remote));
  const pushed = await push(d, remote);
  return { pulled, pushed };
}

/**
 * First sync for this account on this device (or a different account than
 * before): queue everything already on the device so it gets uploaded, and
 * pull the account's full history.
 */
async function adoptAccount(d: HomeHuntDb, userId: string): Promise<void> {
  const owner = (await d.meta.get('syncUser'))?.value;
  if (owner === userId) return;
  await d.transaction('rw', [d.meta, d.outbox, d.listings, d.photos], async () => {
    await enqueue(d, 'listing', (await d.listings.toCollection().primaryKeys()) as string[]);
    await enqueue(d, 'photo', (await d.photos.toCollection().primaryKeys()) as string[]);
    await d.meta.bulkDelete(['listingsCursor', 'photosCursor']);
    await d.meta.put({ key: 'syncUser', value: userId });
  });
}

async function pullListings(d: HomeHuntDb, remote: Remote): Promise<number> {
  let cursor = ((await d.meta.get('listingsCursor'))?.value as string | undefined) ?? null;
  let applied = 0;
  for (;;) {
    const rows = await remote.pullListings(cursor, PAGE);
    if (!rows.length) break;
    await d.transaction('rw', [d.listings, d.photos, d.outbox, d.meta], async () => {
      for (const row of rows) if (await applyListing(d, row)) applied++;
      cursor = rows[rows.length - 1].server_updated_at;
      await d.meta.put({ key: 'listingsCursor', value: cursor });
    });
    if (rows.length < PAGE) break;
  }
  return applied;
}

async function applyListing(d: HomeHuntDb, row: RemoteListing): Promise<boolean> {
  const local = await d.listings.get(row.id);
  // A local edit or deletion that is newer than the remote change wins; it is already queued.
  const localTime = local?.updatedAt ?? (await d.outbox.get(`listing:${row.id}`))?.at;
  if (localTime !== undefined && localTime >= row.updated_at) return false;
  if (row.deleted) {
    if (!local) return false;
    await d.photos.where('listingId').equals(row.id).delete();
    await d.listings.delete(row.id);
  } else {
    await d.listings.put({ ...(row.data as Listing), id: row.id, updatedAt: row.updated_at });
  }
  // The remote version replaced ours, so there's nothing left to push for it.
  await d.outbox.delete(`listing:${row.id}`);
  return true;
}

async function pullPhotos(d: HomeHuntDb, remote: Remote): Promise<number> {
  let cursor = ((await d.meta.get('photosCursor'))?.value as string | undefined) ?? null;
  let applied = 0;
  for (;;) {
    const rows = await remote.pullPhotos(cursor, PAGE);
    if (!rows.length) break;
    for (const row of rows) {
      if (row.deleted) {
        if (await d.photos.get(row.id)) {
          await d.photos.delete(row.id);
          applied++;
        }
        continue;
      }
      if (await d.photos.get(row.id)) continue;
      if (await d.outbox.get(`photo:${row.id}`)) continue; // deleted here, deletion not pushed yet
      let blob: Blob;
      try {
        blob = await remote.download(row.path);
      } catch (err) {
        console.warn(`HomeHunt sync: could not download photo ${row.id}`, err);
        continue;
      }
      const photo: OwnPhoto = { id: row.id, listingId: row.listing_id, createdAt: row.created_at, blob };
      await d.photos.put(photo);
      applied++;
    }
    cursor = rows[rows.length - 1].server_updated_at;
    await d.meta.put({ key: 'photosCursor', value: cursor });
    if (rows.length < PAGE) break;
  }
  return applied;
}

async function push(d: HomeHuntDb, remote: Remote): Promise<number> {
  const entries = await d.outbox.toArray();
  if (!entries.length) return 0;
  const listingEntries = entries.filter((e) => e.kind === 'listing');
  const photoEntries = entries.filter((e) => e.kind === 'photo');

  const listingRows: RemoteListing[] = [];
  for (const e of listingEntries) {
    const local = await d.listings.get(e.id);
    listingRows.push(
      local
        ? { id: e.id, data: local, updated_at: local.updatedAt, deleted: false }
        : { id: e.id, data: {}, updated_at: e.at, deleted: true },
    );
  }
  for (let i = 0; i < listingRows.length; i += PAGE) await remote.upsertListings(listingRows.slice(i, i + PAGE));

  for (const e of photoEntries) {
    const path = `${remote.userId}/${e.id}.jpg`;
    const local = await d.photos.get(e.id);
    if (local) {
      // Upload the file before the row, so other devices never see a row without its file.
      await remote.upload(path, local.blob);
      await remote.upsertPhotos([{ id: e.id, listing_id: local.listingId, created_at: local.createdAt, path, deleted: false }]);
    } else {
      await remote.upsertPhotos([{ id: e.id, listing_id: NIL_UUID, created_at: e.at, path, deleted: true }]);
      await remote.remove([path]);
    }
  }

  await clearPushed(d, entries);
  return entries.length;
}

/** Removes pushed entries, unless the same item was changed again while we were pushing. */
async function clearPushed(d: HomeHuntDb, pushed: OutboxEntry[]): Promise<void> {
  await d.transaction('rw', d.outbox, async () => {
    for (const e of pushed) {
      const current = await d.outbox.get(e.key);
      if (current && current.at === e.at) await d.outbox.delete(e.key);
    }
  });
}
