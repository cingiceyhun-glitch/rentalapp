import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db.ts';
import type { Listing } from '../types.ts';
import { formatPrice, mapsLink, relativeDay } from '../lib/format.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';

export function ViewingsPage() {
  const withViewing = useLiveQuery(() => db.listings.where('viewingAt').above('').sortBy('viewingAt'));
  if (!withViewing) return null;

  const cutoff = Date.now() - 2 * 3_600_000; // keep a viewing "upcoming" until 2h after it starts
  const upcoming = withViewing.filter((l) => new Date(l.viewingAt!).getTime() >= cutoff);
  const past = withViewing.filter((l) => new Date(l.viewingAt!).getTime() < cutoff).reverse();

  return (
    <>
      <header className="page-head">
        <h1>Viewings</h1>
      </header>
      {upcoming.length === 0 && (
        <p className="empty">No viewings booked yet. Set a viewing date on any home and it shows up here.</p>
      )}
      <Days listings={upcoming} />
      {past.length > 0 && (
        <details className="past">
          <summary>Past viewings ({past.length})</summary>
          <Days listings={past} />
        </details>
      )}
    </>
  );
}

function Days({ listings }: { listings: Listing[] }) {
  const groups = new Map<string, Listing[]>();
  for (const l of listings) {
    const day = l.viewingAt!.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), l]);
  }
  return (
    <>
      {[...groups].map(([day, items]) => (
        <section key={day} className="day">
          <h2>
            {relativeDay(items[0].viewingAt!)}{' '}
            <span className="muted small">
              {new Date(items[0].viewingAt!).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </h2>
          {items.map((l) => (
            <a key={l.id} href={`#/l/${l.id}`} className="viewing-row">
              <time>{l.viewingAt!.slice(11, 16)}</time>
              <div>
                <strong>{l.title || l.address || 'Untitled home'}</strong>
                <div className="muted small">
                  {formatPrice(l)} {l.agentName && `· ${l.agentName}`}
                </div>
                {l.address && (
                  <span
                    className="small link"
                    onClick={(e) => {
                      e.preventDefault();
                      window.open(mapsLink(l.address), '_blank', 'noreferrer');
                    }}
                  >
                    📍 {l.address}
                  </span>
                )}
              </div>
              <StatusBadge status={l.status} />
            </a>
          ))}
        </section>
      ))}
    </>
  );
}
