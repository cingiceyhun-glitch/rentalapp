import { db } from '../db.ts';
import type { Listing, OwnPhoto } from '../types.ts';

interface BackupFile {
  app: 'homehunt';
  version: 1;
  exportedAt: string;
  listings: Listing[];
  photos: { id: string; listingId: string; createdAt: number; dataUrl: string }[];
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export async function exportBackup(): Promise<string> {
  const [listings, photos] = await Promise.all([db.listings.toArray(), db.photos.toArray()]);
  const file: BackupFile = {
    app: 'homehunt',
    version: 1,
    exportedAt: new Date().toISOString(),
    listings,
    photos: await Promise.all(
      photos.map(async (p) => ({ id: p.id, listingId: p.listingId, createdAt: p.createdAt, dataUrl: await blobToDataUrl(p.blob) })),
    ),
  };
  return JSON.stringify(file);
}

/** Merges a backup into the current data; newer edits win. Returns how many homes were imported. */
export async function importBackup(json: string): Promise<number> {
  const file = JSON.parse(json) as BackupFile;
  if (file.app !== 'homehunt' || !Array.isArray(file.listings)) throw new Error('This is not a HomeHunt backup file.');
  const photos: OwnPhoto[] = await Promise.all(
    (file.photos ?? []).map(async (p) => ({
      id: p.id,
      listingId: p.listingId,
      createdAt: p.createdAt,
      blob: await (await fetch(p.dataUrl)).blob(),
    })),
  );
  let count = 0;
  await db.transaction('rw', db.listings, db.photos, async () => {
    for (const l of file.listings) {
      const existing = await db.listings.get(l.id);
      if (!existing || existing.updatedAt < l.updatedAt) {
        await db.listings.put(l);
        count++;
      }
    }
    await db.photos.bulkPut(photos);
  });
  return count;
}
