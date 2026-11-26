import { lazy, Suspense, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, updateListing } from '../db.ts';
import type { Listing, OwnPhoto, Status } from '../types.ts';
import { ListingCard } from '../components/ListingCard.tsx';
import { Icon, type IconName } from '../components/Icon.tsx';
import { relativeDay } from '../lib/format.ts';
import { useSyncStatus } from '../sync/index.ts';

type Sort = 'ranking' | 'newest' | 'rating' | 'priceAsc' | 'priceDesc' | 'viewing';
type Filter = 'active' | 'all' | 'favorites' | Status;
export type View = 'cards' | 'tiles' | 'list' | 'map';
type Prefs = { sort: Sort; filter: Filter; view: View };

const VIEWS: { id: View; icon: IconName; label: string }[] = [
  { id: 'cards', icon: 'viewCards', label: 'Cards' },
  { id: 'tiles', icon: 'viewTiles', label: 'Tiles' },
  { id: 'list', icon: 'viewList', label: 'List' },
  { id: 'map', icon: 'map', label: 'Map' },
];

const HomesMap = lazy(() => import('../components/HomesMap.tsx'));

const SORTS: { id: Sort; label: string }[] = [
  { id: 'ranking', label: 'My ranking' },
  { id: 'newest', label: 'Newest first' },
  { id: 'rating', label: 'Highest rated' },
  { id: 'priceAsc', label: 'Price: low → high' },
  { id: 'priceDesc', label: 'Price: high → low' },
  { id: 'viewing', label: 'Next viewing' },
];

const CLOSED: Status[] = ['rejected', 'unavailable'];

const PREFS_KEY = 'homehunt-list';
function loadPrefs(): Prefs {
  try {
    return { sort: 'ranking', filter: 'active', view: 'cards', ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { sort: 'ranking', filter: 'active', view: 'cards' };
  }
}

export function ListPage() {
  const listings = useLiveQuery(() => db.listings.toArray());
  const [query, setQuery] = useState('');
  const [{ sort, filter, view }, setPrefs] = useState(loadPrefs);
  const setPref = (p: Partial<Prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const visible = useMemo(() => {
    if (!listings) return [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const result = listings.filter((l) => {
      if (filter === 'active' && CLOSED.includes(l.status)) return false;
      if (filter === 'favorites' && !l.favorite) return false;
      if (filter !== 'active' && filter !== 'all' && filter !== 'favorites' && l.status !== filter) return false;
      if (!words.length) return true;
      const haystack = searchText(l);
      return words.every((w) => haystack.includes(w));
    });
    return result.sort(comparator(sort));
  }, [listings, query, filter, sort]);

  // Own photos as covers for homes added without ad photos.
  const coverIds = visible.filter((l) => !l.photoUrls.length).map((l) => l.id);
  const covers = useLiveQuery(
    async () => {
      const photos = coverIds.length ? await db.photos.where('listingId').anyOf(coverIds).sortBy('createdAt') : [];
      const map = new Map<string, OwnPhoto>();
      for (const p of photos) if (!map.has(p.listingId)) map.set(p.listingId, p);
      return map;
    },
    [coverIds.join(',')],
  );

  const move = async (index: number, delta: -1 | 1) => {
    const a = visible[index];
    const b = visible[index + delta];
    if (!a || !b) return;
    await db.transaction('rw', db.listings, db.outbox, async () => {
      // Ranks start as creation timestamps; nudge apart in the rare case they tie.
      const rb = a.rank === b.rank ? a.rank - delta : a.rank;
      await updateListing(a.id, { rank: b.rank });
      await updateListing(b.id, { rank: rb });
    });
  };

  if (!listings) return null;

  if (listings.length === 0) {
    return (
      <div className="welcome">
        <div className="icon-tile">
          <Icon name="home" size={34} />
        </div>
        <h1>Your home search, in one place</h1>
        <p>
          Stop juggling browser tabs, notes and spreadsheets. Paste the link of any property ad and HomeHunt pulls in the price,
          photos and details. Then add viewings, the agent's contact, your own photos and notes.
        </p>
        <a className="btn primary big" href="#/add">
          <Icon name="plus" size={20} /> Add your first home
        </a>
        <p className="muted small" style={{ marginTop: 20 }}>
          Tip: <a href="#/more">More → Add homes faster</a> shows the one-tap ways to add ads.
        </p>
      </div>
    );
  }

  const now = Date.now() - 3_600_000;
  const next = listings
    .filter((l) => l.viewingAt && new Date(l.viewingAt).getTime() > now && !CLOSED.includes(l.status))
    .sort((a, b) => a.viewingAt!.localeCompare(b.viewingAt!))[0];
  const activeCount = listings.filter((l) => !CLOSED.includes(l.status)).length;
  const chips: { id: Filter; label: string }[] = [
    { id: 'active', label: `In the running · ${activeCount}` },
    { id: 'favorites', label: '♥ Favourites' },
    { id: 'viewing', label: 'Viewing booked' },
    { id: 'viewed', label: 'Viewed' },
    { id: 'applied', label: 'Applied / offer' },
    { id: 'all', label: `All · ${listings.length}` },
  ];

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Your home search</div>
          <h1>
            Homes <span className="count">{visible.length}</span>
          </h1>
        </div>
        <SyncDot />
      </header>

      <label className="search">
        <Icon name="search" size={19} />
        <input
          type="search"
          placeholder="Search address, agent, notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search homes"
        />
      </label>

      <div className="chips" role="tablist" aria-label="Filter">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            className={`chip ${filter === c.id ? 'on' : ''}`}
            onClick={() => setPref({ filter: c.id })}
          >
            {c.label}
          </button>
        ))}
      </div>

      {next && (
        <a className="next-viewing" href={`#/l/${next.id}`}>
          <Icon name="calendar" size={20} />
          <div>
            <b>
              Next viewing · {relativeDay(next.viewingAt!)} {next.viewingAt!.slice(11, 16)}
            </b>
            <span>
              {next.title || next.address || 'Untitled home'}
              {next.agentName && ` · ${next.agentName}`}
            </span>
          </div>
        </a>
      )}

      <div className="list-bar">
        <b>{SORTS.find((x) => x.id === sort)?.label}</b>
        <div className="view-switch" role="radiogroup" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              aria-label={v.label}
              title={v.label}
              className={view === v.id ? 'on' : ''}
              onClick={() => setPref({ view: v.id })}
            >
              <Icon name={v.icon} size={17} />
            </button>
          ))}
        </div>
        <span className="sort-btn">
          Sort <Icon name="down" size={15} />
          <select value={sort} onChange={(e) => setPref({ sort: e.target.value as Sort })} aria-label="Sort">
          {SORTS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
          </select>
        </span>
      </div>

      {visible.length === 0 && <p className="empty">Nothing matches. Try another search or filter.</p>}

      {view === 'map' ? (
        <Suspense fallback={<div className="map-box map-loading">Loading map…</div>}>
          <HomesMap listings={visible} />
        </Suspense>
      ) : (
        <div className={`cards view-${view}`}>
          {visible.map((l, i) => (
            <ListingCard key={l.id} listing={l} cover={covers?.get(l.id)?.blob} rank={sort === 'ranking' ? i + 1 : undefined}>
              {sort === 'ranking' && (
                <div className="rank-controls">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <Icon name="up" size={16} />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === visible.length - 1} onClick={() => move(i, 1)}>
                    <Icon name="down" size={16} />
                  </button>
                </div>
              )}
            </ListingCard>
          ))}
        </div>
      )}
    </>
  );
}

function SyncDot() {
  const sync = useSyncStatus();
  if (sync.state === 'loading' || sync.state === 'unavailable') return null;
  const state = sync.state === 'synced' ? 'ok' : sync.state === 'error' ? 'bad' : '';
  const label = {
    'signed-out': 'Sync is off: sign in under More',
    syncing: 'Syncing…',
    synced: 'Synced',
    offline: 'Offline',
    error: `Sync problem: ${sync.error ?? ''}`,
  }[sync.state];
  return (
    <a className={`round sync-dot ${state}`} href="#/more" title={label} aria-label={label}>
      <Icon name="cloud" size={19} />
      <i />
    </a>
  );
}

function searchText(l: Listing): string {
  return [l.title, l.address, l.notes, l.agentName, l.agency, l.phone, l.email, l.source, l.description, l.url]
    .join(' ')
    .toLowerCase();
}

function comparator(sort: Sort): (a: Listing, b: Listing) => number {
  const nullsLast = (x: number | null, y: number | null, dir: 1 | -1) =>
    x == null ? (y == null ? 0 : 1) : y == null ? -1 : (x - y) * dir;
  switch (sort) {
    case 'ranking':
      return (a, b) => a.rank - b.rank;
    case 'newest':
      return (a, b) => b.createdAt - a.createdAt;
    case 'rating':
      return (a, b) => b.rating - a.rating || Number(b.favorite) - Number(a.favorite) || a.rank - b.rank;
    case 'priceAsc':
      return (a, b) => nullsLast(a.price, b.price, 1);
    case 'priceDesc':
      return (a, b) => nullsLast(a.price, b.price, -1);
    case 'viewing': {
      const t = (l: Listing) => (l.viewingAt ? new Date(l.viewingAt).getTime() : null);
      return (a, b) => nullsLast(t(a), t(b), 1);
    }
  }
}
