import { useEffect, useRef, useState } from 'react';
import { findByUrl, saveListing } from '../db.ts';
import { emptyListing, type Listing } from '../types.ts';
import { findUrl, parseListingHtml, parseSharedText, sourceOf, type ExtractedListing } from '../shared/parse.ts';
import { extractFromUrl } from '../lib/extract.ts';
import { PAGE_MESSAGE, READY_MESSAGE } from '../lib/bookmarklet.ts';
import { ListingForm } from '../components/ListingForm.tsx';
import { RemotePhoto } from '../components/Photo.tsx';
import { back, navigate } from '../router.ts';

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
      listing.photoUrls = photoUrls;
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
          ? `${sourceOf(url)} doesn't let HomeHunt read its ads${gotSome ? ', so only the details from the shared text were filled in' : ''}. Please add the rest below. (${result.message})`
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

    if (via === 'bookmarklet' && window.opener) {
      setState({ step: 'loading', url });
      let done = false;
      const onMessage = (e: MessageEvent) => {
        if (e.source !== window.opener || e.data?.type !== PAGE_MESSAGE || done) return;
        done = true;
        window.removeEventListener('message', onMessage);
        const pageUrl = String(e.data.url);
        void fill(pageUrl, parseListingHtml(String(e.data.html), pageUrl));
      };
      window.addEventListener('message', onMessage);
      window.opener.postMessage(READY_MESSAGE, '*');
      // Some sites cut the link back to their tab; fall back to reading the URL.
      setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener('message', onMessage);
        if (url) void readLink(url);
        else setState({ step: 'link' });
      }, 4000);
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
          <h1>New home</h1>
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

  return (
    <>
      <header className="page-head">
        <h1>Add a home</h1>
      </header>
      <form
        className="form add-link"
        onSubmit={(e) => {
          e.preventDefault();
          void readLink(link);
        }}
      >
        <label>
          Paste the link of the ad
          <input
            type="url"
            inputMode="url"
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.idealista.pt/imovel/…"
          />
        </label>
        <div className="form-actions">
          {'clipboard' in navigator && 'readText' in navigator.clipboard && (
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
              📋 Paste
            </button>
          )}
          <button type="submit" className="btn primary" disabled={!link.trim()}>
            Get details
          </button>
        </div>
      </form>
      <div className="or">or</div>
      <button type="button" className="btn wide" onClick={() => setState({ step: 'form', listing: emptyListing() })}>
        ✍️ Enter a home by hand (e.g. a "Arrenda-se" sign on the street)
      </button>
      <p className="muted small center">
        Works with most property sites that show a link preview when you share them.{' '}
        <a href="#/more">Add homes faster →</a>
      </p>
      <p className="center">
        <button type="button" className="link" onClick={() => back()}>
          Cancel
        </button>
      </p>
    </>
  );
}
