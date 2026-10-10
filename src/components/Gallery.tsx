import { useEffect, useState } from 'react';
import type { OwnPhoto } from '../types.ts';
import { BlobPhoto, RemotePhoto } from './Photo.tsx';

type Item = { kind: 'remote'; src: string } | { kind: 'own'; photo: OwnPhoto };

export function Gallery({ urls, own, onDeleteOwn }: { urls: string[]; own: OwnPhoto[]; onDeleteOwn: (id: string) => void }) {
  const items: Item[] = [...own.map((photo) => ({ kind: 'own' as const, photo })), ...urls.map((src) => ({ kind: 'remote' as const, src }))];
  const [open, setOpen] = useState<number | null>(null);

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

  const current = open !== null ? items[open] : null;

  return (
    <>
      <div className="gallery" role="list">
        {items.map((item, i) => (
          <button
            type="button"
            role="listitem"
            key={item.kind === 'remote' ? item.src : item.photo.id}
            className="gallery-item"
            onClick={() => setOpen(i)}
          >
            {render(item)}
            {item.kind === 'own' && <span className="own-tag">Your photo</span>}
          </button>
        ))}
      </div>
      {current && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          {render(current, 'lightbox-img')}
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen((open! - 1 + items.length) % items.length)} aria-label="Previous">
              ‹
            </button>
            <span>
              {open! + 1} / {items.length}
            </span>
            {current.kind === 'own' && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Delete this photo?')) {
                    onDeleteOwn(current.photo.id);
                    setOpen(null);
                  }
                }}
              >
                🗑
              </button>
            )}
            <button type="button" onClick={() => setOpen((open! + 1) % items.length)} aria-label="Next">
              ›
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
