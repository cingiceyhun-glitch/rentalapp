import type { Listing } from '../types.ts';
import { facts, formatPrice, formatViewing } from '../lib/format.ts';
import { RemotePhoto, BlobPhoto } from './Photo.tsx';
import { Stars } from './Stars.tsx';
import { StatusBadge } from './StatusBadge.tsx';

export function ListingCard({ listing: l, cover, children }: { listing: Listing; cover?: Blob; children?: React.ReactNode }) {
  const upcoming = l.viewingAt && new Date(l.viewingAt).getTime() > Date.now() - 3_600_000;
  return (
    <article className={`card ${l.status === 'rejected' || l.status === 'unavailable' ? 'dim' : ''}`}>
      <a href={`#/l/${l.id}`} className="card-link">
        <div className="card-thumb">
          {l.photoUrls[0] ? <RemotePhoto src={l.photoUrls[0]} /> : cover ? <BlobPhoto blob={cover} /> : <div className="photo-missing">🏠</div>}
          {l.favorite && <span className="fav-flag" aria-label="Favourite">♥</span>}
        </div>
        <div className="card-body">
          <div className="card-price">
            {formatPrice(l)}
            <span className="muted">{facts(l)}</span>
          </div>
          <h3 className="card-title">{l.title || l.address || l.url || 'Untitled home'}</h3>
          {l.address && l.title && <p className="card-sub">{l.address}</p>}
          <div className="card-meta">
            <StatusBadge status={l.status} />
            {l.rating > 0 && <Stars value={l.rating} size="sm" />}
            {l.source && <span className="muted small">{l.source}</span>}
          </div>
          {upcoming && <p className="card-viewing">📅 {formatViewing(l.viewingAt!)}</p>}
        </div>
      </a>
      {children}
    </article>
  );
}
