import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, updateListing } from '../db.ts';
import { STATUSES, type Listing, type OwnPhoto, type Status } from '../types.ts';
import { ListingCard } from '../components/ListingCard.tsx';

type Sort = 'ranking' | 'newest' | 'rating' | 'priceAsc' | 'priceDesc' | 'viewing';
type Filter = 'active' | 'all' | 'favorites' | Status;

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
function loadPrefs(): { sort: Sort; filter: Filter } {
  try {
    return { sort: 'ranking', filter: 'active', ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { sort: 'ranking', filter: 'active' };
  }
}

export function ListPage() {
  const listings = useLiveQuery(() => db.listings.toArray());
  const [query, setQuery] = useState('');
  const [{ sort, filter }, setPrefs] = useState(loadPrefs);
  const setPref = (p: Partial<{ sort: Sort; filter: Filter }>) =>
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
    await db.transaction('rw', db.listings, async () => {
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
        <h1>Your home search, in one place</h1>
        <p>
          Stop juggling browser tabs, notes and spreadsheets. Paste the link of any property ad — HomeHunt pulls in the price,
          photos and details, and you add viewings, the agent's contact, your own photos and notes.
        </p>
        <a className="btn primary big" href="#/add">
          ＋ Add your first home
        </a>
        <p className="muted small">
          Tip: see <a href="#/more">More → Add homes faster</a> for the share-button and one-click bookmark.
        </p>
      </div>
    );
  }

  return (
    <>
      <header className="page-head">
        <h1>Homes <span className="muted">{visible.length}</span></h1>
        <input
          type="search"
          className="search"
          placeholder="Search address, agent, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search homes"
        />
        <div className="toolbar">
          <select value={filter} onChange={(e) => setPref({ filter: e.target.value as Filter })} aria-label="Filter">
            <option value="active">Still in the running</option>
            <option value="favorites">♥ Favourites</option>
            <option value="all">All homes</option>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setPref({ sort: e.target.value as Sort })} aria-label="Sort">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {visible.length === 0 && <p className="empty">Nothing matches. Try another search or filter.</p>}

      <div className="cards">
        {visible.map((l, i) => (
          <ListingCard key={l.id} listing={l} cover={covers?.get(l.id)?.blob}>
            {sort === 'ranking' && (
              <div className="rank-controls">
                <span className="rank-no">#{i + 1}</span>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  ▲
                </button>
                <button type="button" aria-label="Move down" disabled={i === visible.length - 1} onClick={() => move(i, 1)}>
                  ▼
                </button>
              </div>
            )}
          </ListingCard>
        ))}
      </div>
    </>
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
