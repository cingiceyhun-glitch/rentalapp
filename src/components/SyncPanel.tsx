import { useState } from 'react';
import { requestSync, signIn, signOut, signUp, useSyncStatus } from '../sync/index.ts';

export function SyncPanel() {
  const status = useSyncStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  if (status.state === 'loading') return null;

  if (status.state === 'unavailable') {
    return (
      <section className="panel" id="sync">
        <h2>☁️ Sync across devices</h2>
        <p className="muted small">Sync isn't switched on for this HomeHunt yet. Your homes are saved on this device only.</p>
      </section>
    );
  }

  if (status.state === 'signed-out') {
    const submit = async (mode: 'in' | 'up') => {
      setBusy(true);
      setMessage(null);
      if (mode === 'in') {
        const error = await signIn(email.trim(), password);
        if (error) setMessage({ text: error, error: true });
      } else {
        const { error, note } = await signUp(email.trim(), password);
        if (error) setMessage({ text: error, error: true });
        else if (note) setMessage({ text: note });
      }
      setBusy(false);
    };
    return (
      <section className="panel" id="sync">
        <h2>☁️ Sync across devices</h2>
        <p className="muted small">
          Sign in with the same account on your phone, laptop and tablet to see the same homes, notes and photos everywhere.
          The homes already on this device are kept and uploaded.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit('in');
          }}
        >
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && <p className={message.error ? 'error small' : 'notice'}>{message.text}</p>}
          <div className="form-actions">
            <button type="button" className="btn" disabled={busy || !email || password.length < 6} onClick={() => submit('up')}>
              Create account
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              Sign in
            </button>
          </div>
        </form>
      </section>
    );
  }

  const last = status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
  const line = {
    syncing: '🔄 Syncing…',
    synced: `✅ Up to date · last synced ${last}`,
    offline: `📴 Offline · changes will sync when you're back online (last synced ${last})`,
    error: `⚠️ Couldn't sync: ${status.error ?? 'unknown error'}`,
  }[status.state as 'syncing' | 'synced' | 'offline' | 'error'];

  return (
    <section className="panel" id="sync">
      <h2>☁️ Sync across devices</h2>
      <p>
        Signed in as <b>{status.email}</b>
      </p>
      <p className={`small ${status.state === 'error' ? 'error' : 'muted'}`}>{line}</p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => signOut()}>
          Sign out
        </button>
        <button type="button" className="btn primary" disabled={status.state === 'syncing'} onClick={() => requestSync(0)}>
          Sync now
        </button>
      </div>
    </section>
  );
}
