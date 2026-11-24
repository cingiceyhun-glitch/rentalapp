import { useSyncExternalStore } from 'react';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { db, setLocalChangeListener } from '../db.ts';
import { syncOnce } from './engine.ts';
import { getClient, supabaseRemote } from './supabase.ts';

// Runs sync in the background: when the app opens or comes back to the
// foreground, when the connection returns, shortly after every local change,
// and once a minute while the app is open.

export interface SyncStatus {
  /** 'unavailable': sync isn't set up on the server. */
  state: 'loading' | 'unavailable' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';
  email?: string;
  lastSyncedAt?: number;
  error?: string;
}

let status: SyncStatus = { state: 'loading', lastSyncedAt: readLastSynced() };
const listeners = new Set<() => void>();

function setStatus(next: Partial<SyncStatus>): void {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

let client: SupabaseClient | null = null;
let session: Session | null = null;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export async function startSync(): Promise<void> {
  client = await getClient();
  if (!client) {
    setStatus({ state: 'unavailable' });
    return;
  }
  const { data } = await client.auth.getSession();
  onSession(data.session);
  // Don't call Supabase from inside this callback (it holds an auth lock); schedule instead.
  client.auth.onAuthStateChange((_event, s) => setTimeout(() => onSession(s), 0));

  setLocalChangeListener(() => requestSync(1500));
  window.addEventListener('online', () => requestSync(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSync(0);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') requestSync(0);
  }, 60_000);
}

function onSession(s: Session | null): void {
  const changedUser = s?.user.id !== session?.user.id;
  session = s;
  if (!s) {
    setStatus({ state: 'signed-out', email: undefined, error: undefined });
    return;
  }
  setStatus({ email: s.user.email });
  if (changedUser) requestSync(0);
}

export function requestSync(delayMs = 0): void {
  if (!client || !session) return;
  clearTimeout(timer);
  timer = setTimeout(run, delayMs);
}

async function run(): Promise<void> {
  if (!client || !session) return;
  if (running) {
    again = true;
    return;
  }
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  running = true;
  setStatus({ state: 'syncing', error: undefined });
  try {
    await syncOnce(db, supabaseRemote(client, session.user.id));
    const now = Date.now();
    writeLastSynced(now);
    setStatus({ state: 'synced', lastSyncedAt: now });
  } catch (err) {
    console.error('HomeHunt sync failed', err);
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: errorMessage(err) });
  } finally {
    running = false;
    if (again) {
      again = false;
      requestSync(0);
    }
  }
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!client) return 'Sync is not set up.';
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? friendlyAuthError(error.message) : null;
}

/** Returns an error, or a note when the account must be confirmed by email first. */
export async function signUp(email: string, password: string): Promise<{ error?: string; note?: string }> {
  if (!client) return { error: 'Sync is not set up.' };
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { error: friendlyAuthError(error.message) };
  if (!data.session) return { note: `Check ${email} for a confirmation link, then come back and sign in.` };
  return {};
}

export async function signOut(): Promise<void> {
  // Homes stay on this device; they just stop syncing.
  await client?.auth.signOut();
}

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first (check your inbox), then sign in.';
  if (/already registered/i.test(message)) return 'There is already an account with this email. Sign in instead.';
  if (/password should be at least/i.test(message)) return 'Please use a password of at least 6 characters.';
  if (/signups not allowed/i.test(message)) return 'New accounts are turned off for this HomeHunt.';
  return message;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}

function readLastSynced(): number | undefined {
  try {
    return Number(localStorage.getItem('homehunt-last-synced')) || undefined;
  } catch {
    return undefined;
  }
}

function writeLastSynced(t: number): void {
  try {
    localStorage.setItem('homehunt-last-synced', String(t));
  } catch {
    /* ignore */
  }
}
