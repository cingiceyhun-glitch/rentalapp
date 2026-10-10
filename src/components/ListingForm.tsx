import { useState } from 'react';
import { STATUSES, type Listing, type Status } from '../types.ts';
import { sourceOf } from '../shared/parse.ts';
import { DictateButton } from './DictateButton.tsx';
import { Stars } from './Stars.tsx';

interface Props {
  initial: Listing;
  submitLabel: string;
  onSubmit: (listing: Listing) => void;
  onCancel: () => void;
}

export function ListingForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [l, setL] = useState(initial);
  const set = <K extends keyof Listing>(key: K, value: Listing[K]) => setL((prev) => ({ ...prev, [key]: value }));
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...l, source: l.url ? sourceOf(l.url) : l.source });
      }}
    >
      <section>
        <h2>The home</h2>
        <label>
          Link to the ad
          <input type="url" inputMode="url" value={l.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
        </label>
        <label>
          Title
          <input value={l.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Bright T2 near the beach" />
        </label>
        <label>
          Address / area
          <input value={l.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, neighbourhood, town" />
        </label>
        <div className="row">
          <label>
            Looking to
            <select value={l.dealType} onChange={(e) => set('dealType', e.target.value as Listing['dealType'])}>
              <option value="rent">Rent</option>
              <option value="buy">Buy</option>
            </select>
          </label>
          <label>
            Price {l.dealType === 'rent' ? '/ month' : ''}
            <input
              inputMode="decimal"
              value={l.price ?? ''}
              onChange={(e) => set('price', num(e.target.value))}
              placeholder="1500"
            />
          </label>
          <label className="narrow">
            Currency
            <input value={l.currency} onChange={(e) => set('currency', e.target.value.toUpperCase().slice(0, 3))} />
          </label>
        </div>
        <div className="row">
          <label>
            Bedrooms
            <input inputMode="numeric" value={l.bedrooms ?? ''} onChange={(e) => set('bedrooms', num(e.target.value))} />
          </label>
          <label>
            Bathrooms
            <input inputMode="numeric" value={l.bathrooms ?? ''} onChange={(e) => set('bathrooms', num(e.target.value))} />
          </label>
          <label>
            Area m²
            <input inputMode="decimal" value={l.areaM2 ?? ''} onChange={(e) => set('areaM2', num(e.target.value))} />
          </label>
        </div>
      </section>

      <section>
        <h2>Agent / landlord</h2>
        <div className="row">
          <label>
            Name
            <input value={l.agentName} onChange={(e) => set('agentName', e.target.value)} autoComplete="off" />
          </label>
          <label>
            Agency
            <input value={l.agency} onChange={(e) => set('agency', e.target.value)} autoComplete="off" />
          </label>
        </div>
        <div className="row">
          <label>
            Phone
            <input type="tel" value={l.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+351 912 345 678" />
          </label>
          <label>
            Email
            <input type="email" value={l.email} onChange={(e) => set('email', e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>Your take</h2>
        <div className="row">
          <label>
            Status
            <select value={l.status} onChange={(e) => set('status', e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Viewing
            <input
              type="datetime-local"
              value={l.viewingAt ?? ''}
              onChange={(e) => {
                set('viewingAt', e.target.value || null);
                if (e.target.value && (l.status === 'interested' || l.status === 'contacted')) set('status', 'viewing');
              }}
            />
          </label>
        </div>
        <div className="inline-field">
          <span>Rating</span>
          <Stars value={l.rating} onChange={(v) => set('rating', v)} />
          <label className="check">
            <input type="checkbox" checked={l.favorite} onChange={(e) => set('favorite', e.target.checked)} /> ♥ Favourite
          </label>
        </div>
        <label>
          <span className="label-row">
            Notes
            <DictateButton onText={(t) => setL((prev) => ({ ...prev, notes: appendLine(prev.notes, t) }))} />
          </span>
          <textarea rows={5} value={l.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Pros, cons, questions to ask…" />
        </label>
      </section>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function appendLine(existing: string, text: string): string {
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return existing.trim() ? `${existing.trimEnd()}\n${sentence}` : sentence;
}
