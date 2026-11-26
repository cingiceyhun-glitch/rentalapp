import { useEffect, useRef, useState } from 'react';
import { findByUrl, saveListing } from '../db.ts';
import { emptyListing, type Listing } from '../types.ts';
import { findUrl, parseListingHtml, parseSharedText, sourceOf, uniquePhotos, type ExtractedListing } from '../shared/parse.ts';
import { extractFromUrl } from '../lib/extract.ts';
import { ListingForm } from '../components/ListingForm.tsx';
import { RemotePhoto } from '../components/Photo.tsx';
import { Icon } from '../components/Icon.tsx';
import { navigate } from '../router.ts';

type State =
  | { step: 'link'; notice?: string }
  | { step: 'loading'; url: string }
  | { step: 'form'; listing: Listing; notice?: string; duplicate?: Listing };

export function AddPage({ params }: { params: URLSearchParams }) {
  const [state, setState] = useState<State>({ step: 'link' });
  const [link, setLink] = useState('');
  const started = useRef(false);

  const fill = async (url: string, extracted: ExtractedListing | null, notice?: string) => {
    const listing = { ...emptyListing(), url, source: sourceOf(url) };
    if (extracted) {
      const { photoUrls, ...rest } = extracted;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) (listing as unknown as Record<string, unknown>)[k] = v;
      listing.photoUrls = uniquePhotos(photoUrls);
      if (listing.lat != null) listing.geoFor = listing.address;
    }
    setState({ step: 'form', listing, notice, duplicate: await findByUrl(url) });
  };

  const readLink = async (raw: string, sharedText = '') => {
    const url = findUrl(raw) ?? (raw.trim() ? `https://${raw.trim().replace(/^\/+/, '')}` : '');
    if (!url) return;
    setState({ step: 'loading', url });
    const result = await extractFromUrl(url);
    if (result.ok) {
      await fill(url, result.data);
    } else {
      const fromText = sharedText ? parseSharedText(sharedText, url) : null;
      const gotSome = !!fromText && Object.keys(fromText).length > 3;
      const hint =
        result.code === 'blocked'
          ? `${sourceOf(url)} doesn't let HomeHunt read its ads from the share menu${gotSome ? ', so only the details from the shared text were filled in' : ''}. Open the ad in Chrome and use the HomeHunt bookmark instead (More → Add homes faster), or fill it in below.`
          : `${result.message} You can still fill it in yourself.`;
      await fill(url, gotSome ? fromText : null, hint);
    }
  };

  // Arrived from the share sheet or the bookmarklet.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = params.get('url') ?? '';
    const via = params.get('via');

    const page = params.get('page');
    if (via === 'bookmarklet' && page && url) {
      // Drop the (large) page snapshot from the address bar and history.
      history.replaceState(null, '', '#/add');
      void fill(url, parseListingHtml(page, url));
    } else if (url) {
      setLink(url);
      void readLink(url, params.get('text') ?? '');
    }
  }, []);

  if (state.step === 'loading') {
    return (
      <div className="center-box">
        <div className="spinner" aria-hidden />
        <p>Reading the ad…</p>
        <p className="muted small break">{state.url}</p>
      </div>
    );
  }

  if (state.step === 'form') {
    const { listing, notice, duplicate } = state;
    return (
      <>
        <header className="page-head">
          <div>
            <div className="eyebrow">Check the details</div>
            <h1>New home</h1>
          </div>
        </header>
        {duplicate && (
          <p className="notice">
            You already saved this ad: <a href={`#/l/${duplicate.id}`}>{duplicate.title || 'open it'}</a>.
          </p>
        )}
        {notice && <p className="notice warn">{notice}</p>}
        {listing.photoUrls.length > 0 && (
          <div className="strip">
            {listing.photoUrls.slice(0, 12).map((src) => (
              <RemotePhoto key={src} src={src} />
            ))}
            <span className="muted small">{listing.photoUrls.length} photos from the ad</span>
          </div>
        )}
        <ListingForm
          initial={listing}
          submitLabel="Save home"
          onCancel={() => setState({ step: 'link' })}
          onSubmit={async (l) => {
            await saveListing(l);
            navigate(`/l/${l.id}`, { replace: true });
          }}
        />
      </>
    );
  }

  const canPaste = 'clipboard' in navigator && 'readText' in navigator.clipboard;
  const ua = navigator.userAgent;
  const ways = [
    { id: 'android-app', icon: 'share' as const, title: 'Share from idealista', text: 'Share → Add to HomeHunt on Android', first: /Android/i.test(ua) },
    { id: 'iphone', icon: 'sparkle' as const, title: 'iPhone Shortcut', text: 'Share → Add to HomeHunt in Safari', first: /iPhone|iPad/i.test(ua) },
    { id: 'bookmark', icon: 'link' as const, title: 'Bookmark button', text: 'One tap in Chrome or Safari', first: false },
  ].sort((a, b) => Number(b.first) - Number(a.first));

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">New home</div>
          <h1>Add a home</h1>
        </div>
      </header>
      <form
        className="paste-card"
        onSubmit={(e) => {
          e.preventDefault();
          void readLink(link);
        }}
      >
        <label htmlFor="ad-link">Link to the ad</label>
        <div className="field-icon">
          <Icon name="link" size={18} />
          <input
            id="ad-link"
            type="url"
            inputMode="url"
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.idealista.pt/imovel/…"
          />
        </div>
        <div className="btn-row">
          {canPaste && (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  const url = findUrl(text);
                  if (url) {
                    setLink(url);
                    void readLink(url);
                  }
                } catch {
                  /* permission denied: user can paste manually */
                }
              }}
            >
              <Icon name="clipboard" size={17} /> Paste
            </button>
          )}
          <button type="submit" className="btn primary grow" disabled={!link.trim()}>
            <Icon name="sparkle" size={17} /> Get details
          </button>
        </div>
      </form>

      <div className="or">or</div>
      <button type="button" className="btn wide" onClick={() => setState({ step: 'form', listing: emptyListing() })}>
        <Icon name="edit" size={17} /> Enter a home by hand
      </button>

      <div className="section-label">Faster ways to add</div>
      {ways.map((w) => (
        <a key={w.id} className="way" href={`#/more?section=${w.id}`}>
          <span className="way-icon">
            <Icon name={w.icon} size={20} />
          </span>
          <div>
            <b>{w.title}</b>
            <span>{w.text}</span>
          </div>
          <Icon name="chevron" size={18} />
        </a>
      ))}
    </>
  );
}
