import { useEffect, useRef, useState } from 'react';
import { db } from '../db.ts';
import { toCsv } from '../lib/csv.ts';
import { exportBackup, importBackup } from '../lib/backup.ts';
import { downloadFile } from '../lib/download.ts';
import { bookmarkletCode, shortcutScript } from '../lib/bookmarklet.ts';
import { useSettings } from '../lib/settings.ts';
import { speechSupported } from '../lib/speech.ts';
import { SyncPanel } from '../components/SyncPanel.tsx';

export function MorePage() {
  const [settings, update] = useSettings();
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);
  const today = new Date().toISOString().slice(0, 10);
  const origin = location.origin;

  return (
    <>
      <header className="page-head">
        <h1>More</h1>
      </header>

      <SyncPanel />

      <section className="panel" id="add-faster">
        <h2>Add homes faster</h2>
        <h3>📱 Android: the "Add to HomeHunt" app (easiest)</h3>
        <p>
          A small helper app that puts <b>Add to HomeHunt</b> in Android's Share menu. Share any ad, idealista included, and
          HomeHunt opens with the details filled in.
        </p>
        <ol>
          <li>
            <a className="btn small" href="/homehunt.apk" download>
              ⬇️ Download the app
            </a>
          </li>
          <li>
            Open the downloaded file. If Android asks, allow Chrome to <b>install unknown apps</b>, then tap <b>Install</b>.
          </li>
          <li>
            In the idealista app (or anywhere else), tap <b>Share → Add to HomeHunt</b>.
          </li>
        </ol>
        <p className="muted small">If a "check you're not a robot" box appears while it reads the ad, complete it and it carries on.</p>
        <h3>📱 Android: the HomeHunt bookmark (works with idealista)</h3>
        <p>
          Some sites, idealista included, refuse to let HomeHunt read their ads from the Share menu. This bookmark reads the ad
          straight from your own Chrome instead. You set it up once:
        </p>
        <ol>
          <li>
            Tap{' '}
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(bookmarkletCode(origin));
                  setMessage('Bookmark code copied. Now follow step 2.');
                } catch {
                  setMessage('Could not copy automatically. Long-press the button on a computer instead.');
                }
              }}
            >
              📋 Copy bookmark code
            </button>
          </li>
          <li>
            In Chrome, tap <b>⋮ → ☆</b> to bookmark this page, then tap <b>Edit</b>. Change the name to <b>hh</b>, and replace
            the URL with the code you copied (long-press → <b>Paste</b>). Save.
          </li>
          <li>
            On any ad in Chrome, tap the address bar, type <b>hh</b>, and tap the <b>hh</b> bookmark in the suggestions (the one
            with the ☆). HomeHunt opens with the details filled in.
          </li>
        </ol>
        <p className="muted small">
          In the idealista app, tap <b>Share → Chrome</b> (or ⋮ → <i>Open in browser</i>) to get the ad into Chrome first.
        </p>
        <h3>📱 Android: Share → HomeHunt</h3>
        <p>
          Install HomeHunt from Chrome (<b>⋮ → Add to Home screen</b>). Then tap <b>Share → HomeHunt</b> on an ad in any app.
          This saves the link instantly, and fills in the details on sites that allow it.
        </p>
        <h3 id="iphone">🍏 iPhone: Share → Add to HomeHunt</h3>
        <p>
          A Shortcut that reads the ad you have open in Safari (idealista included) and opens HomeHunt with the details filled in.
          You set it up once, in about 3 minutes:
        </p>
        <ol>
          <li>
            Tap{' '}
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shortcutScript(origin));
                  setMessage('Shortcut script copied. Now open the Shortcuts app (step 2).');
                } catch {
                  setMessage('Could not copy automatically. Please try again.');
                }
              }}
            >
              📋 Copy Shortcut script
            </button>
          </li>
          <li>
            Open the <b>Shortcuts</b> app and tap <b>+</b>. Tap the name at the top, choose <b>Rename</b> and call it{' '}
            <b>Add to HomeHunt</b>.
          </li>
          <li>
            Tap <b>ⓘ</b> at the bottom and turn on <b>Show in Share Sheet</b>, then <b>Done</b>. At the top it now says{' '}
            <i>Receive … from Share Sheet</i>: tap the blue word after <i>Receive</i> and leave only <b>Safari web pages</b>{' '}
            ticked.
          </li>
          <li>
            Search the actions for <b>Run JavaScript on Web Page</b> and add it. Tap inside its code, select all, and{' '}
            <b>Paste</b> the script you copied.
          </li>
          <li>
            Search for <b>Open URLs</b> and add it below. It should say <i>Open JavaScript Result</i>. Tap <b>Done</b>.
          </li>
          <li>
            In iPhone <b>Settings → Apps → Shortcuts → Advanced</b>, turn on <b>Allow Running Scripts</b>.
          </li>
        </ol>
        <p>
          <b>To use it:</b> open the ad in Safari, tap <b>Share</b> and choose <b>Add to HomeHunt</b>. The first time, tap{' '}
          <b>Allow</b>. In the idealista app, tap <b>Share → Open in Safari</b> first.
        </p>
        <p className="muted small">
          The new home opens in Safari. If you also use HomeHunt from your home screen, sign in under Sync in both so new homes appear
          there too.
        </p>
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
          A backup file is a copy of everything, photos included, that you keep yourself.
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
