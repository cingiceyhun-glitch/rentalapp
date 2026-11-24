import type { Listing } from '../types.ts';
import { facts, formatPrice, pricePerM2, relativeDay } from '../lib/format.ts';
import { updateListing } from '../db.ts';
import { RemotePhoto, BlobPhoto } from './Photo.tsx';
import { Icon } from './Icon.tsx';
import { Stars } from './Stars.tsx';
import { StatusBadge } from './StatusBadge.tsx';

interface Props {
  listing: Listing;
  cover?: Blob;
  /** Position in "My ranking" (1-based); shown on the photo. */
  rank?: number;
  children?: React.ReactNode;
}

export function ListingCard({ listing: l, cover, rank, children }: Props) {
  const upcoming = l.viewingAt && new Date(l.viewingAt).getTime() > Date.now() - 3_600_000;
  const [amount, period] = formatPrice(l).split('/');
  const ppm = pricePerM2(l);
  return (
    <article className={`card ${l.status === 'rejected' || l.status === 'unavailable' ? 'dim' : ''}`}>
      <a href={`#/l/${l.id}`} className="card-link">
        <div className="card-media">
          {l.photoUrls[0] ? (
            <RemotePhoto src={l.photoUrls[0]} />
          ) : cover ? (
            <BlobPhoto blob={cover} />
          ) : (
            <div className="photo-missing">
              <Icon name="home" size={40} />
            </div>
          )}
          {rank !== undefined && <span className="tag rank">#{rank}</span>}
          {l.photoUrls.length > 1 && <span className="tag count">1/{l.photoUrls.length}</span>}
        </div>
        <div className="card-body">
          <div className="spread">
            <span className="price">
              {amount}
              {period && <small>/{period}</small>}
            </span>
            {l.rating > 0 && <Stars value={l.rating} size="sm" />}
          </div>
          <div className="facts">
            {facts(l) || 'Size not set'}
            {ppm && (
              <>
                <span className="sep">·</span>
                <span className="ppm">{ppm}</span>
              </>
            )}
          </div>
          {l.title && <p className="card-title">{l.title}</p>}
          {l.address && (
            <div className="addr">
              <Icon name="pin" size={15} />
              <span>{l.address}</span>
            </div>
          )}
        </div>
      </a>
      <div className="card-foot">
        <StatusBadge status={l.status} />
        {upcoming ? (
          <span className="when">
            <Icon name="calendar" size={14} />
            {relativeDay(l.viewingAt!)} {l.viewingAt!.slice(11, 16)}
          </span>
        ) : (
          l.source && <span className="source">{l.source}</span>
        )}
        {children}
      </div>
      <button
        type="button"
        className={`heart ${l.favorite ? 'on' : ''}`}
        aria-pressed={l.favorite}
        aria-label={l.favorite ? 'Remove from favourites' : 'Add to favourites'}
        onClick={() => updateListing(l.id, { favorite: !l.favorite })}
      >
        <Icon name="heart" size={19} filled={l.favorite} />
      </button>
    </article>
  );
}
