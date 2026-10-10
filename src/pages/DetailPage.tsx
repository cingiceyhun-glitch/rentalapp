import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteListing, updateListing } from '../db.ts';
import { STATUSES, type Listing, type Status } from '../types.ts';
import { dialable, facts, formatPrice, formatViewing, mapsLink, pricePerM2, relativeDay, whatsappLink } from '../lib/format.ts';
import { viewingIcs } from '../lib/ics.ts';
import { downloadFile } from '../lib/download.ts';
import { downscale } from '../lib/images.ts';
import { loadSettings } from '../lib/settings.ts';
import { Gallery } from '../components/Gallery.tsx';
import { Stars } from '../components/Stars.tsx';
import { DictateButton } from '../components/DictateButton.tsx';
import { appendLine } from '../components/ListingForm.tsx';
import { back, navigate } from '../router.ts';

export function DetailPage({ id }: { id: string }) {
  const listing = useLiveQuery(() => db.listings.get(id), [id], null);
  const photos = useLiveQuery(() => db.photos.where('listingId').equals(id).sortBy('createdAt'), [id]);
  const camera = useRef<HTMLInputElement>(null);

  if (listing === null) return null; // loading
  if (!listing) return <p className="empty">This home was deleted. <a href="#/">Back to your homes</a></p>;

  const l = listing;
  const update = (changes: Partial<Listing>) => updateListing(l.id, changes);
  const { countryCode } = loadSettings();
  const phone = l.phone ? dialable(l.phone, countryCode) : '';
  const greeting = `Olá${l.agentName ? ` ${l.agentName.split(' ')[0]}` : ''}! I'm interested in this property${l.url ? `: ${l.url}` : ''}. Is it still available?`;
  const ppm = pricePerM2(l);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const now = Date.now();
    const rows = await Promise.all(
      [...files].map(async (f, i) => ({ id: crypto.randomUUID(), listingId: l.id, createdAt: now + i, blob: await downscale(f) })),
    );
    await db.photos.bulkAdd(rows);
  };

  return (
    <article className="detail">
      <div className="detail-top">
        <button type="button" className="link" onClick={() => back()}>
          ‹ Homes
        </button>
        <button
          type="button"
          className={`fav ${l.favorite ? 'on' : ''}`}
          aria-pressed={l.favorite}
          aria-label="Favourite"
          onClick={() => update({ favorite: !l.favorite })}
        >
          {l.favorite ? '♥' : '♡'}
        </button>
      </div>

      <Gallery urls={l.photoUrls} own={photos ?? []} onDeleteOwn={(pid) => db.photos.delete(pid)} />

      <header className="detail-head">
        <div className="detail-price">
          {formatPrice(l)} {ppm && <span className="muted small">({ppm})</span>}
        </div>
        <h1>{l.title || l.address || 'Untitled home'}</h1>
        {facts(l) && <p className="muted">{facts(l)}</p>}
        {l.address && (
          <a href={mapsLink(l.address)} target="_blank" rel="noreferrer" className="address">
            📍 {l.address}
          </a>
        )}
      </header>

      <div className="actions">
        {l.url && (
          <a className="action" href={l.url} target="_blank" rel="noreferrer">
            🔗<span>Open ad</span>
          </a>
        )}
        {phone && (
          <a className="action" href={`tel:${phone}`}>
            📞<span>Call</span>
          </a>
        )}
        {phone && (
          <a className="action" href={whatsappLink(phone, greeting)} target="_blank" rel="noreferrer">
            💬<span>WhatsApp</span>
          </a>
        )}
        {phone && (
          <a className="action" href={`sms:${phone}?&body=${encodeURIComponent(greeting)}`}>
            ✉️<span>SMS</span>
          </a>
        )}
        {l.email && (
          <a
            className="action"
            href={`mailto:${l.email}?subject=${encodeURIComponent(l.title || 'Property enquiry')}&body=${encodeURIComponent(greeting)}`}
          >
            📧<span>Email</span>
          </a>
        )}
        <button type="button" className="action" onClick={() => camera.current?.click()}>
          📷<span>Add photo</span>
        </button>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            void addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <section className="panel">
        <div className="panel-row">
          <label className="grow">
            <span className="muted small">Status</span>
            <select value={l.status} onChange={(e) => update({ status: e.target.value as Status })}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="muted small">Your rating</span>
            <Stars value={l.rating} onChange={(rating) => update({ rating })} />
          </div>
        </div>
        <ViewingEditor listing={l} onChange={update} />
      </section>

      <NotesPanel listing={l} onSave={(notes) => update({ notes })} />

      {(l.agentName || l.agency || l.phone || l.email) && (
        <section className="panel">
          <h2>Contact</h2>
          <p>
            {l.agentName}
            {l.agentName && l.agency && ' · '}
            {l.agency}
          </p>
          {l.phone && <p className="muted">{l.phone}</p>}
          {l.email && <p className="muted">{l.email}</p>}
        </section>
      )}

      {l.description && (
        <section className="panel">
          <h2>From the ad</h2>
          <p className="prewrap">{l.description}</p>
        </section>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="btn danger"
          onClick={async () => {
            if (confirm('Delete this home and your photos of it?')) {
              await deleteListing(l.id);
              navigate('/', { replace: true });
            }
          }}
        >
          Delete
        </button>
        <a className="btn primary" href={`#/l/${l.id}/edit`}>
          Edit details
        </a>
      </div>
      <p className="muted small center">
        Added {new Date(l.createdAt).toLocaleDateString()} {l.source && `from ${l.source}`}
      </p>
    </article>
  );
}

function ViewingEditor({ listing: l, onChange }: { listing: Listing; onChange: (c: Partial<Listing>) => void }) {
  return (
    <div className="viewing">
      <label className="grow">
        <span className="muted small">Viewing {l.viewingAt && `· ${relativeDay(l.viewingAt)}`}</span>
        <input
          type="datetime-local"
          value={l.viewingAt ?? ''}
          onChange={(e) => {
            const viewingAt = e.target.value || null;
            const promote = viewingAt && (l.status === 'interested' || l.status === 'contacted');
            onChange(promote ? { viewingAt, status: 'viewing' } : { viewingAt });
          }}
        />
      </label>
      {l.viewingAt && (
        <button
          type="button"
          className="btn small"
          title={formatViewing(l.viewingAt)}
          onClick={() => downloadFile(`viewing-${l.viewingAt!.slice(0, 10)}.ics`, viewingIcs(l), 'text/calendar')}
        >
          📅 Add to calendar
        </button>
      )}
    </div>
  );
}

function NotesPanel({ listing, onSave }: { listing: Listing; onSave: (notes: string) => void }) {
  const [notes, setNotes] = useState(listing.notes);
  const saved = useRef(listing.notes);

  // Pick up changes from elsewhere (e.g. the edit form) when not mid-typing.
  useEffect(() => {
    if (listing.notes !== saved.current) {
      saved.current = listing.notes;
      setNotes(listing.notes);
    }
  }, [listing.notes]);

  const commit = (value: string) => {
    if (value === saved.current) return;
    saved.current = value;
    onSave(value);
  };

  return (
    <section className="panel">
      <h2 className="label-row">
        Notes
        <DictateButton
          onText={(t) =>
            setNotes((prev) => {
              const next = appendLine(prev, t);
              commit(next);
              return next;
            })
          }
        />
      </h2>
      <textarea
        rows={Math.max(4, notes.split('\n').length + 1)}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => commit(notes)}
        placeholder="Pros, cons, questions for the agent… Tap Speak to dictate while you walk around."
      />
    </section>
  );
}
