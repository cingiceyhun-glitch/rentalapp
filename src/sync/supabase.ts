import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Remote } from './engine.ts';

interface SyncConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const CONFIG_KEY = 'homehunt-sync-config';
let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * The Supabase project is configured on the server (SUPABASE_URL and
 * SUPABASE_ANON_KEY on Render) and fetched at runtime; a copy is kept so the
 * app can start offline. Resolves null when sync isn't set up.
 */
export function getClient(): Promise<SupabaseClient | null> {
  clientPromise ??= loadConfig().then((c) =>
    c ? createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null,
  );
  return clientPromise;
}

async function loadConfig(): Promise<SyncConfig | null> {
  try {
    const res = await fetch('/api/config');
    const body = (await res.json()) as Partial<SyncConfig>;
    const config = body.supabaseUrl && body.supabaseAnonKey ? (body as SyncConfig) : null;
    try {
      if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      else localStorage.removeItem(CONFIG_KEY);
    } catch {
      /* storage unavailable */
    }
    return config;
  } catch {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
    } catch {
      return null;
    }
  }
}

const BUCKET = 'photos';

export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  const check = <T>({ data, error }: { data: T; error: unknown }): T => {
    if (error) throw error;
    return data;
  };
  return {
    userId,
    async pullListings(since, limit) {
      let q = client.from('listings').select('id, data, updated_at, deleted, server_updated_at').order('server_updated_at').limit(limit);
      if (since) q = q.gt('server_updated_at', since);
      return check(await q) ?? [];
    },
    async pullPhotos(since, limit) {
      let q = client
        .from('photos')
        .select('id, listing_id, created_at, path, deleted, server_updated_at')
        .order('server_updated_at')
        .limit(limit);
      if (since) q = q.gt('server_updated_at', since);
      return check(await q) ?? [];
    },
    async upsertListings(rows) {
      check(await client.from('listings').upsert(rows));
    },
    async upsertPhotos(rows) {
      check(await client.from('photos').upsert(rows));
    },
    async upload(path, blob) {
      check(await client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' }));
    },
    async download(path) {
      const blob = check(await client.storage.from(BUCKET).download(path));
      if (!blob) throw new Error(`Photo file missing: ${path}`);
      return blob;
    },
    async remove(paths) {
      check(await client.storage.from(BUCKET).remove(paths));
    },
  };
}
