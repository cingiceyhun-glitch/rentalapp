import { useEffect, useRef, useState } from 'react';
import type { OwnPhoto } from '../types.ts';
import { BlobPhoto, RemotePhoto } from './Photo.tsx';
import { Icon } from './Icon.tsx';

type Item = { kind: 'remote'; src: string } | { kind: 'own'; photo: OwnPhoto };

/** Full-width swipeable photos (your own first, then the ad's), with a full-screen viewer. */
export function Gallery({ urls, own, onDeleteOwn }: { urls: string[]; own: OwnPhoto[]; onDeleteOwn: (id: string) => void }) {
  const items: Item[] = [...own.map((photo) => ({ kind: 'own' as const, photo })), ...urls.map((src) => ({ kind: 'remote' as const, src }))];
  const [open, setOpen] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % items.length));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + items.length) % items.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items.length]);

  if (items.length === 0) return null;

  const render = (item: Item, className?: string) =>
    item.kind === 'remote' ? <RemotePhoto src={item.src} className={className} /> : <BlobPhoto blob={item.photo.blob} className={className} />;
  const shown = open !== null ? items[open] : null;

  return (
    <>
      <div
        className="gallery"
        ref={strip}
        onScroll={(e) => {
          const el = e.currentTarget;
          setCurrent(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {items.map((item, i) => (
          <button
            type="button"
            key={item.kind === 'remote' ? item.src : item.photo.id}
            className="gallery-item"
            aria-label={`Photo ${i + 1} of ${items.length}`}
            onClick={() => setOpen(i)}
          >
            {render(item)}
            {item.kind === 'own' && <span className="own-tag">Your photo</span>}
          </button>
        ))}
      </div>
      {items.length > 1 && (
        <span className="tag gallery-count">
          {Math.min(current + 1, items.length)} / {items.length}
        </span>
      )}
      {shown && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          {render(shown, 'lightbox-img')}
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen((open! - 1 + items.length) % items.length)} aria-label="Previous">
              <Icon name="back" size={20} />
            </button>
            <span>
              {open! + 1} / {items.length}
            </span>
            {shown.kind === 'own' && (
              <button
                type="button"
                aria-label="Delete photo"
                onClick={() => {
                  if (confirm('Delete this photo?')) {
                    onDeleteOwn(shown.photo.id);
                    setOpen(null);
                  }
                }}
              >
                <Icon name="trash" size={19} />
              </button>
            )}
            <button type="button" onClick={() => setOpen((open! + 1) % items.length)} aria-label="Next">
              <Icon name="chevron" size={20} />
            </button>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
