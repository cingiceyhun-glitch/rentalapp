import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addPhotos, deleteListing, deletePhoto, openDb, saveListing, updateListing, type HomeHuntDb } from '../src/db.ts';
import { syncOnce, type Remote, type RemoteListing, type RemotePhoto } from '../src/sync/engine.ts';
import { emptyListing } from '../src/types.ts';

/** In-memory stand-in for Supabase, with the same rules as supabase/schema.sql. */
class FakeCloud {
  listings = new Map<string, RemoteListing & { server_updated_at: string }>();
  photos = new Map<string, RemotePhoto & { server_updated_at: string }>();
  files = new Map<string, Blob>();
  private clock = 0;
  private stamp = () => new Date(Date.UTC(2026, 0, 1) + ++this.clock).toISOString();

  as(userId: string): Remote {
    const since = <T extends { server_updated_at: string }>(rows: Iterable<T>, cursor: string | null, limit: number) =>
      [...rows].filter((r) => !cursor || r.server_updated_at > cursor).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)).slice(0, limit);
    return {
      userId,
      pullListings: async (c, l) => since(this.listings.values(), c, l),
      pullPhotos: async (c, l) => since(this.photos.values(), c, l),
      upsertListings: async (rows) => {
        for (const r of rows) {
          const old = this.listings.get(r.id);
          if (old && r.updated_at < old.updated_at) continue; // older edit never wins
          this.listings.set(r.id, structuredClone({ ...r, server_updated_at: this.stamp() }));
        }
      },
      upsertPhotos: async (rows) => {
        for (const r of rows) this.photos.set(r.id, { ...r, server_updated_at: this.stamp() });
      },
      upload: async (path, blob) => void this.files.set(path, blob),
      download: async (path) => {
        const f = this.files.get(path);
        if (!f) throw new Error('missing file');
        return f;
      },
      remove: async (paths) => paths.forEach((p) => this.files.delete(p)),
    };
  }
}

let cloud: FakeCloud;
let phone: HomeHuntDb;
let laptop: HomeHuntDb;
let n = 0;
const ME = 'user-1';
const sync = (d: HomeHuntDb) => syncOnce(d, cloud.as(ME));
const home = (title: string) => ({ ...emptyListing(), title });
const tick = () => new Promise((r) => setTimeout(r, 2));

beforeEach(() => {
  cloud = new FakeCloud();
  phone = openDb(`phone-${++n}`);
  laptop = openDb(`laptop-${n}`);
});

describe('sync between devices', () => {
  it('uploads homes that were on the phone before sync was turned on', async () => {
    await phone.listings.bulkPut([home('T1 Bairro do Rosário'), home('T2 Rua dos Hibíscos')]); // pre-sync data, not queued
    await sync(phone);
    await sync(laptop);
    expect((await laptop.listings.toArray()).map((l) => l.title).sort()).toEqual(['T1 Bairro do Rosário', 'T2 Rua dos Hibíscos']);
    expect(await phone.outbox.count()).toBe(0);
  });

  it('carries edits and deletions both ways, newest edit wins', async () => {
    const a = home('A');
    const b = home('B');
    await saveListing(a, phone);
    await saveListing(b, phone);
    await sync(phone);
    await sync(laptop);

    await updateListing(a.id, { notes: 'from laptop', rating: 4 }, laptop);
    await tick();
    await updateListing(a.id, { notes: 'from phone, later' }, phone); // newer edit
    await deleteListing(b.id, laptop);

    await sync(laptop);
    await sync(phone);
    await sync(laptop);

    for (const d of [phone, laptop]) {
      const all = await d.listings.toArray();
      expect(all.map((l) => l.id)).toEqual([a.id]);
      expect(all[0].notes).toBe('from phone, later');
    }
  });

  it('syncs own photos and their deletion', async () => {
    const a = home('A');
    await saveListing(a, phone);
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    const photo = { id: crypto.randomUUID(), listingId: a.id, createdAt: 1, blob };
    await addPhotos([photo], phone);
    await sync(phone);
    await sync(laptop);
    const got = await laptop.photos.get(photo.id);
    expect(got?.listingId).toBe(a.id);
    expect(await got!.blob.text()).toBe('jpeg-bytes');

    await deletePhoto(photo.id, laptop);
    await sync(laptop);
    await sync(phone);
    expect(await phone.photos.count()).toBe(0);
    expect(cloud.files.size).toBe(0);
  });

  it('deleting a home removes its photos everywhere', async () => {
    const a = home('A');
    await saveListing(a, phone);
    await addPhotos([{ id: crypto.randomUUID(), listingId: a.id, createdAt: 1, blob: new Blob(['x']) }], phone);
    await sync(phone);
    await sync(laptop);
    await deleteListing(a.id, phone);
    await sync(phone);
    await sync(laptop);
    expect(await laptop.listings.count()).toBe(0);
    expect(await laptop.photos.count()).toBe(0);
  });

  it('keeps a change made while a push was in flight', async () => {
    const a = home('A');
    await saveListing(a, phone);
    const remote = cloud.as(ME);
    const slow: Remote = {
      ...remote,
      upsertListings: async (rows) => {
        await updateListing(a.id, { notes: 'typed during upload' }, phone);
        await remote.upsertListings(rows);
      },
    };
    await syncOnce(phone, slow);
    expect(await phone.outbox.count()).toBe(1); // the new edit is still queued
    await sync(phone);
    await sync(laptop);
    expect((await laptop.listings.get(a.id))?.notes).toBe('typed during upload');
  });
});

describe('sync edge cases', () => {
  it('a deletion not yet pushed is not undone by pulling', async () => {
    const a = home('A');
    await saveListing(a, phone);
    const photo = { id: crypto.randomUUID(), listingId: a.id, createdAt: 1, blob: new Blob(['x']) };
    await addPhotos([photo], phone);
    await sync(phone);
    // Second device deleting a different photo makes the phone pull before pushing.
    await deletePhoto(photo.id, phone);
    await deleteListing(a.id, phone);
    await sync(phone);
    expect(await phone.listings.count()).toBe(0);
    expect(await phone.photos.count()).toBe(0);
    expect(cloud.listings.get(a.id)?.deleted).toBe(true);
  });
});

describe('duplicate photo clean-up', () => {
  it('removes copies from saved homes and queues them for sync', async () => {
    const { cleanDuplicatePhotos } = await import('../src/db.ts');
    const a = { ...home('A'), photoUrls: ['https://img3.idealista.pt/blur/X/0/p/1.jpg', 'https://img4.idealista.pt/blur/X/0/p/1.webp', 'https://img3.idealista.pt/blur/X/0/p/2.jpg'] };
    await phone.listings.put(a);
    expect(await cleanDuplicatePhotos(phone)).toBe(1);
    expect((await phone.listings.get(a.id))?.photoUrls).toHaveLength(2);
    expect(await phone.outbox.get(`listing:${a.id}`)).toBeTruthy();
    expect(await cleanDuplicatePhotos(phone)).toBe(0);
  });
});
