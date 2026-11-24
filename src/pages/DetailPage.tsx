import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addPhotos as savePhotos, db, deleteListing, deletePhoto, updateListing } from '../db.ts';
import { STATUSES, type Listing, type Status } from '../types.ts';
import { dialable, formatPrice, formatViewing, mapsLink, pricePerM2, relativeDay, whatsappLink } from '../lib/format.ts';
import { viewingIcs } from '../lib/ics.ts';
import { downloadFile } from '../lib/download.ts';
import { downscale } from '../lib/images.ts';
import { loadSettings } from '../lib/settings.ts';
import { Gallery } from '../components/Gallery.tsx';
import { Icon, type IconName } from '../components/Icon.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
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
    await savePhotos(rows);
  };

  const hasPhotos = l.photoUrls.length > 0 || (photos?.length ?? 0) > 0;
  const [amount, period] = formatPrice(l).split('/');
  const specs = [
    l.bedrooms != null && { value: l.bedrooms === 0 ? 'T0' : l.bedrooms, label: l.bedrooms === 1 ? 'bed' : 'beds' },
    l.bathrooms != null && { value: l.bathrooms, label: l.bathrooms === 1 ? 'bath' : 'baths' },
    l.areaM2 != null && { value: l.areaM2, label: 'm²' },
    ppm && { value: ppm.split(' ')[0], label: ppm.split(' ').slice(1).join(' ') },
  ].filter(Boolean) as { value: string | number; label: string }[];
  const actions: { key: string; icon: IconName; label: string; href?: string; external?: boolean; onClick?: () => void }[] = [
    ...(phone ? [{ key: 'call', icon: 'phone' as const, label: 'Call', href: `tel:${phone}` }] : []),
    ...(phone ? [{ key: 'wa', icon: 'chat' as const, label: 'WhatsApp', href: whatsappLink(phone, greeting), external: true }] : []),
    ...(l.url ? [{ key: 'ad', icon: 'link' as const, label: 'Open ad', href: l.url, external: true }] : []),
    { key: 'photo', icon: 'camera', label: 'Photo', onClick: () => camera.current?.click() },
    ...(phone ? [{ key: 'sms', icon: 'message' as const, label: 'SMS', href: `sms:${phone}?&body=${encodeURIComponent(greeting)}` }] : []),
    ...(l.email
      ? [{ key: 'mail', icon: 'mail' as const, label: 'Email', href: `mailto:${l.email}?subject=${encodeURIComponent(l.title || 'Property enquiry')}&body=${encodeURIComponent(greeting)}` }]
      : []),
    ...(l.address ? [{ key: 'map', icon: 'map' as const, label: 'Map', href: mapsLink(l.address), external: true }] : []),
  ];

  return (
    <article className="detail">
      <button type="button" className="hero-btn left" aria-label="Back" onClick={() => back()}>
        <Icon name="back" size={22} />
      </button>
      <button
        type="button"
        className={`hero-btn right ${l.favorite ? 'on' : ''}`}
        aria-pressed={l.favorite}
        aria-label={l.favorite ? 'Remove from favourites' : 'Add to favourites'}
        onClick={() => update({ favorite: !l.favorite })}
      >
        <Icon name="heart" size={20} filled={l.favorite} />
      </button>

      {hasPhotos && (
        <div className="hero">
          <Gallery urls={l.photoUrls} own={photos ?? []} onDeleteOwn={(pid) => deletePhoto(pid)} />
        </div>
      )}

      <div className={`sheet ${hasPhotos ? '' : 'no-hero'}`}>
        <div className="spread">
          <span className="price big">
            {amount}
            {period && <small>/{period === 'mo' ? 'month' : period}</small>}
          </span>
          <StatusBadge status={l.status} />
        </div>
        <h1>{l.title || l.address || 'Untitled home'}</h1>
        {l.address && (
          <a href={mapsLink(l.address)} target="_blank" rel="noreferrer" className="addr">
            <Icon name="pin" size={15} />
            <span>{l.address}</span>
          </a>
        )}

        {specs.length > 0 && (
          <div className="specs">
            {specs.map((x) => (
              <div key={x.label}>
                <b>{x.value}</b>
                <span>{x.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="actions" style={specs.length ? undefined : { marginTop: 16 }}>
          {actions.map((a) =>
            a.href ? (
              <a key={a.key} className="action" href={a.href} {...(a.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                <Icon name={a.icon} size={21} />
                <span>{a.label}</span>
              </a>
            ) : (
              <button key={a.key} type="button" className="action" onClick={a.onClick}>
                <Icon name={a.icon} size={21} />
                <span>{a.label}</span>
              </button>
            ),
          )}
        </div>
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

        <ViewingCard listing={l} onChange={update} />

        <section className="box">
          <div className="spread">
            <b>Your rating</b>
            <Stars value={l.rating} onChange={(rating) => update({ rating })} />
          </div>
          <select value={l.status} onChange={(e) => update({ status: e.target.value as Status })} aria-label="Status">
            {STATUSES.map((x) => (
              <option key={x.id} value={x.id}>
                Status: {x.label}
              </option>
            ))}
          </select>
        </section>

        <NotesPanel listing={l} onSave={(notes) => update({ notes })} />

        {(l.agentName || l.agency || l.phone || l.email) && (
          <section className="box">
            <b>Contact</b>
            {(l.agentName || l.agency) && (
              <div className="contact-line">
                <span>{[l.agentName, l.agency].filter(Boolean).join(' · ')}</span>
              </div>
            )}
            {l.phone && <div className="contact-line muted">{l.phone}</div>}
            {l.email && <div className="contact-line muted">{l.email}</div>}
          </section>
        )}

        {l.description && (
          <section className="box">
            <b>From the ad</b>
            <p className="prewrap small" style={{ color: 'var(--ink-2)', marginBottom: 0 }}>
              {l.description}
            </p>
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
            <Icon name="trash" size={18} /> Delete
          </button>
          <a className="btn primary" href={`#/l/${l.id}/edit`}>
            <Icon name="edit" size={18} /> Edit details
          </a>
        </div>
        <p className="muted small center">
          Added {new Date(l.createdAt).toLocaleDateString()} {l.source && `from ${l.source}`}
        </p>
      </div>
    </article>
  );
}

function ViewingCard({ listing: l, onChange }: { listing: Listing; onChange: (c: Partial<Listing>) => void }) {
  const d = l.viewingAt ? new Date(l.viewingAt) : null;
  return (
    <section className="box">
      <div className="viewing-card">
        <div className={`date-tile ${d ? '' : 'empty'}`}>
          {d ? (
            <>
              <b>{d.getDate()}</b>
              <span>{d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</span>
            </>
          ) : (
            <Icon name="calendar" size={22} />
          )}
        </div>
        <div className="grow">
          <b style={{ fontSize: 15 }}>{d ? `${relativeDay(l.viewingAt!)} · ${l.viewingAt!.slice(11, 16)}` : 'No viewing booked'}</b>
          <div className="muted small">{d ? formatViewing(l.viewingAt!) : 'Pick a date and time below'}</div>
        </div>
        {d && (
          <button
            type="button"
            className="btn small soft"
            onClick={() => downloadFile(`viewing-${l.viewingAt!.slice(0, 10)}.ics`, viewingIcs(l), 'text/calendar')}
          >
            + Calendar
          </button>
        )}
      </div>
      <input
        type="datetime-local"
        value={l.viewingAt ?? ''}
        aria-label="Viewing date and time"
        style={{ marginTop: 12 }}
        onChange={(e) => {
          const viewingAt = e.target.value || null;
          const promote = viewingAt && (l.status === 'interested' || l.status === 'contacted');
          onChange(promote ? { viewingAt, status: 'viewing' } : { viewingAt });
        }}
      />
    </section>
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
    <section className="box notes">
      <div className="spread">
        <b>Notes</b>
        <DictateButton
          onText={(t) =>
            setNotes((prev) => {
              const next = appendLine(prev, t);
              commit(next);
              return next;
            })
          }
        />
      </div>
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
