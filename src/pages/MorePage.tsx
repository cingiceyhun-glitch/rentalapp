import { useRef, useState } from 'react';
import { db } from '../db.ts';
import { toCsv } from '../lib/csv.ts';
import { exportBackup, importBackup } from '../lib/backup.ts';
import { downloadFile } from '../lib/download.ts';
import { bookmarkletCode } from '../lib/bookmarklet.ts';
import { useSettings } from '../lib/settings.ts';
import { speechSupported } from '../lib/speech.ts';

export function MorePage() {
  const [settings, update] = useSettings();
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const origin = location.origin;

  return (
    <>
      <header className="page-head">
        <h1>More</h1>
      </header>

      <section className="panel" id="add-faster">
        <h2>Add homes faster</h2>
        <h3>📱 Android: Share → HomeHunt</h3>
        <p>
          Open HomeHunt in Chrome and choose <b>Install app</b> (or <b>Add to Home screen</b>). From then on, in the idealista,
          Imovirtual or any other app or browser, tap <b>Share</b> on an ad and pick <b>HomeHunt</b>.
        </p>
        <h3>🍏 iPhone: a Shortcut in the Share sheet</h3>
        <ol>
          <li>
            In Safari, tap Share → <b>Add to Home Screen</b> to install HomeHunt.
          </li>
          <li>
            Open the <b>Shortcuts</b> app → <b>+</b> → name it “Save to HomeHunt”. In its settings turn on <b>Show in Share Sheet</b>{' '}
            (accepts URLs and Safari web pages).
          </li>
          <li>
            Add the action <b>URL Encode</b> on the <b>Shortcut Input</b>, then <b>Open URLs</b> with{' '}
            <code className="break">{origin}/share?url=</code> followed by the <b>URL Encoded Text</b> variable.
          </li>
          <li>Now tap Share on any ad → “Save to HomeHunt”.</li>
        </ol>
        <h3>💻 Computer: one-click bookmark</h3>
        <p>
          Drag this button to your bookmarks bar. On any property ad, click it — HomeHunt opens with the details, read straight from
          the page you're looking at (this also works on sites that block automatic reading).
        </p>
        <p>
          {/* React blocks javascript: URLs in href, so set it after mount. */}
          <a
            className="btn bookmarklet"
            ref={(a) => a?.setAttribute('href', bookmarkletCode(origin))}
            onClick={(e) => {
              e.preventDefault();
              setMessage('Drag the button to your bookmarks bar instead of clicking it here.');
            }}
          >
            ＋ Save to HomeHunt
          </a>
        </p>
      </section>

      <section className="panel">
        <h2>Settings</h2>
        <label>
          Voice notes language {!speechSupported && <span className="muted small">(not supported in this browser)</span>}
          <select value={settings.voiceLang} onChange={(e) => update({ voiceLang: e.target.value })}>
            {[...new Set([settings.voiceLang, 'pt-PT', 'pt-BR', 'en-GB', 'en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'nl-NL', 'tr-TR'])].map(
              (l) => (
                <option key={l} value={l}>
                  {languageName(l)} ({l})
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Country code for local phone numbers
          <input
            inputMode="numeric"
            value={settings.countryCode}
            onChange={(e) => update({ countryCode: e.target.value.replace(/\D/g, '') })}
            placeholder="351"
          />
        </label>
      </section>

      <section className="panel">
        <h2>Your data</h2>
        <p className="muted small">
          Everything is stored on this device only. Make a backup now and then, or to move to another phone or computer.
        </p>
        <div className="button-list">
          <button
            type="button"
            className="btn"
            onClick={async () => downloadFile(`homehunt-${today}.csv`, toCsv(await db.listings.toArray()), 'text/csv')}
          >
            📊 Export to Excel (CSV)
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => downloadFile(`homehunt-backup-${today}.json`, await exportBackup(), 'application/json')}
          >
            💾 Download backup (with photos)
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            📂 Restore from backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const n = await importBackup(await file.text());
                setMessage(`Restored ${n} home${n === 1 ? '' : 's'}.`);
              } catch (err) {
                setMessage((err as Error).message);
              }
            }}
          />
        </div>
      </section>

      {message && (
        <p className="toast" role="status" onClick={() => setMessage(null)}>
          {message}
        </p>
      )}

      <p className="muted small center">HomeHunt 0.1 · made in Cascais</p>
    </>
  );
}

function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
