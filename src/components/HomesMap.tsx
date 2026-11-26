import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { updateListing } from '../db.ts';
import { STATUSES, type Listing } from '../types.ts';
import { facts, formatPrice } from '../lib/format.ts';
import { distanceKm, formatKm, loadPlaces, locateHomes, lookupAddress, needsLocation, savePlaces, type Place } from '../lib/geo.ts';
import { uniquePhotos } from '../shared/parse.ts';
import { Icon } from './Icon.tsx';
import { RemotePhoto } from './Photo.tsx';

// Map of the homes in the current list (search and filters apply), with your
// own places (work, school…) and distances to them.

const START: L.LatLngExpression = [38.6979, -9.4215]; // Cascais
// OpenStreetMap's standard tiles: free, no key, attribution required. Dark mode
// darkens them with a CSS filter (see .map in styles.css).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function HomesMap({ listings }: { listings: Listing[] }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const homesLayer = useRef<L.LayerGroup | null>(null);
  const fittedFor = useRef('');
  const [places, setPlaces] = useState<Place[]>(loadPlaces);
  const [locating, setLocating] = useState(0);
  const [moving, setMoving] = useState<string | null>(null);
  /** The home whose card is shown at the bottom of the map. */
  const [selected, setSelected] = useState<string | null>(null);
  /** A home being placed by tapping the map. */
  const [placing, setPlacing] = useState<Listing | null>(null);

  // Look up locations for homes that don't have one yet.
  const lookupKey = listings.filter(needsLocation).map((l) => l.id + l.address).join('|');
  useEffect(() => {
    if (lookupKey) void locateHomes(listings, setLocating);
  }, [lookupKey]);

  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: false, attributionControl: true }).setView(START, 12);
    L.control.zoom({ position: 'topright' }).addTo(m);
    homesLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!placing) return;
    const m = map.current!;
    m.getContainer().classList.add('placing');
    const onClick = async (e: L.LeafletMouseEvent) => {
      await updateListing(placing.id, { lat: e.latlng.lat, lng: e.latlng.lng, geoFor: placing.address, geoApprox: false });
      setPlacing(null);
    };
    m.on('click', onClick);
    return () => {
      m.off('click', onClick);
      m.getContainer().classList.remove('placing');
    };
  }, [placing]);

  useEffect(() => {
    const tiles = L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 });
    tiles.addTo(map.current!);
    return () => {
      tiles.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current!;
    const layer = homesLayer.current!;
    layer.clearLayers();
    const points: L.LatLngExpression[] = [];

    for (const p of places) {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: 'map-place', html: `<span>★ ${esc(p.name)}</span>`, iconSize: [0, 0] }),
        zIndexOffset: -1000,
        keyboard: false,
      }).addTo(layer);
      points.push([p.lat, p.lng]);
    }

    for (const l of listings) {
      if (l.lat == null || l.lng == null) continue;
      const color = STATUSES.find((s) => s.id === l.status)?.color ?? '#64748b';
      if (l.geoApprox) {
        L.circle([l.lat, l.lng], { radius: 450, color, weight: 1, opacity: 0.5, fillOpacity: 0.08, dashArray: '4 4', interactive: false }).addTo(layer);
      }
      const marker = L.marker([l.lat, l.lng], {
        icon: L.divIcon({
          className: 'map-pin-wrap',
          html: `<span class="map-pin ${l.favorite ? 'fav' : ''} ${l.geoApprox ? 'approx' : ''} ${moving === l.id ? 'moving' : ''} ${selected === l.id ? 'selected' : ''}" style="--pin:${color}"><i></i>${l.geoApprox ? '≈ ' : ''}${esc(shortPrice(l))}${l.favorite ? ' <b>♥</b>' : ''}</span>`,
          iconSize: [0, 0],
        }),
        draggable: moving === l.id,
        riseOnHover: true,
        zIndexOffset: selected === l.id ? 500 : 0,
      }).addTo(layer);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSelected(l.id);
      });
      marker.on('dragend', async () => {
        const { lat, lng } = marker.getLatLng();
        await updateListing(l.id, { lat, lng, geoFor: l.address, geoApprox: false });
        setMoving(null);
      });
      points.push([l.lat, l.lng]);
    }

    // Zoom to fit when the set of homes changes (not when a pin is moved).
    const key = listings.map((l) => `${l.id}:${l.lat != null}`).join(',') + places.length;
    if (key !== fittedFor.current && points.length) {
      fittedFor.current = key;
      if (points.length === 1) m.setView(points[0], 15);
      else m.fitBounds(L.latLngBounds(points), { paddingTopLeft: [70, 60], paddingBottomRight: [70, 30], maxZoom: 15 });
    }
  }, [listings, places, moving, selected]);

  // Keep the tapped pin visible above the card at the bottom of the map.
  useEffect(() => {
    const m = map.current;
    const l = listings.find((x) => x.id === selected);
    if (!m || !l || l.lat == null || l.lng == null) return;
    const pt = m.latLngToContainerPoint([l.lat, l.lng]);
    const size = m.getSize();
    const bottomLimit = size.y - 250; // the card's height plus room for the pin label
    const dy = pt.y > bottomLimit ? pt.y - bottomLimit : pt.y < 70 ? pt.y - 70 : 0;
    const dx = pt.x < 60 ? pt.x - 60 : pt.x > size.x - 60 ? pt.x - (size.x - 60) : 0;
    // After the tap has finished, so the map's own tap handling doesn't cancel the move.
    if (dx || dy) setTimeout(() => m.panBy([dx, dy], { animate: true, duration: 0.3 }), 0);
  }, [selected]);

  // Tapping the map (not a pin) closes the card.
  useEffect(() => {
    const m = map.current!;
    const close = () => setSelected(null);
    m.on('click', close);
    return () => {
      m.off('click', close);
    };
  }, []);

  const missing = listings.filter((l) => l.lat == null || l.lng == null);
  const current = listings.find((l) => l.id === selected && l.lat != null);

  return (
    <div className="map-view">
      <div className="map-box">
        <div ref={box} className="map" />
        {locating > 0 && <div className="map-note">Finding {locating} address{locating === 1 ? '' : 'es'} on the map…</div>}
        {placing && (
          <div className="map-note action">
            Tap the map where “{placing.title || placing.address || 'this home'}” is
            <button type="button" className="btn small" onClick={() => setPlacing(null)}>
              Cancel
            </button>
          </div>
        )}
        {current && !moving && !placing && (
          <HomeCard
            listing={current}
            places={places}
            onClose={() => setSelected(null)}
            onMove={() => {
              setSelected(null);
              setMoving(current.id);
            }}
          />
        )}
        {moving && (
          <div className="map-note action">
            Drag the pin to the right spot
            <button type="button" className="btn small" onClick={() => setMoving(null)}>
              Done
            </button>
          </div>
        )}
      </div>

      <PlacesBar
        places={places}
        onChange={(next) => {
          setPlaces(next);
          savePlaces(next);
        }}
      />

      {missing.length > 0 && (
        <div className="box">
          <b>Not on the map yet</b>
          <p className="muted small" style={{ margin: '2px 0 8px' }}>
            {locating > 0 ? 'Still looking these up.' : 'The ad gave no address, or it could not be found. Tap “Place on map”, then tap the right spot.'}
          </p>
          {missing.map((l) => (
            <div key={l.id} className="missing-row">
              <span>{l.title || l.address || 'Untitled home'}</span>
              <button
                type="button"
                className="btn small soft"
                onClick={() => {
                  setPlacing(l);
                  box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                <Icon name="pin" size={15} /> Place on map
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlacesBar({ places, onChange }: { places: Place[]; onChange: (p: Place[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="places">
      <div className="chips" style={{ marginTop: 12 }}>
        {places.map((p) => (
          <span key={p.id} className="chip place-chip">
            ★ {p.name}
            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(places.filter((x) => x.id !== p.id))}>
              ×
            </button>
          </span>
        ))}
        {!adding && (
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            + {places.length ? 'Add place' : 'Add a place (work, school…)'}
          </button>
        )}
      </div>
      {adding && (
        <form
          className="box place-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || !address.trim()) return setError('Please enter a name and an address.');
            setBusy(true);
            setError(null);
            const hit = await lookupAddress(address.trim());
            setBusy(false);
            if (hit === 'failed') return setError('Could not search for that address right now. Try again in a moment.');
            if (!hit) return setError('Could not find that address. Try adding the town, e.g. "Rua X, Cascais".');
            onChange([...places, { id: crypto.randomUUID(), name: name.trim(), address: address.trim(), lat: hit.lat, lng: hit.lng }]);
            setAdding(false);
            setName('');
            setAddress('');
          }}
        >
          <div className="row">
            <label style={{ flex: '0 0 36%' }}>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Work" />
            </label>
            <label>
              Address
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, town" />
            </label>
          </div>
          {error && <p className="error small">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="pin" size={17} /> {busy ? 'Finding…' : 'Add place'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function HomeCard({ listing: l, places, onClose, onMove }: { listing: Listing; places: Place[]; onClose: () => void; onMove: () => void }) {
  const photo = uniquePhotos(l.photoUrls)[0];
  const [amount, period] = formatPrice(l).split('/');
  return (
    <div className="map-card" role="dialog" aria-label={l.title || l.address || 'Home'}>
      <a className="map-card-main" href={`#/l/${l.id}`}>
        <div className="map-card-photo">
          {photo ? <RemotePhoto src={photo} /> : <div className="photo-missing"><Icon name="home" size={26} /></div>}
        </div>
        <div className="map-card-body">
          <div className="price">
            {amount}
            {period && <small>/{period}</small>}
            {l.favorite && <span className="map-card-fav">♥</span>}
          </div>
          <div className="facts">{facts(l) || 'Size not set'}</div>
          <div className="map-card-title">{l.title || l.address || 'Untitled home'}</div>
          {places.length > 0 && (
            <div className="map-card-dist">
              {places.map((p) => (
                <span key={p.id}>
                  ★ {p.name} {formatKm(distanceKm(p, { lat: l.lat!, lng: l.lng! }))}
                </span>
              ))}
            </div>
          )}
        </div>
      </a>
      {l.geoApprox && <div className="map-card-approx">≈ Approximate location: only the area is known</div>}
      <div className="map-card-actions">
        <button type="button" className="btn small" onClick={onMove}>
          <Icon name="pin" size={15} /> Move pin
        </button>
        <a className="btn small soft" href={`#/l/${l.id}`}>
          Open <Icon name="chevron" size={15} />
        </a>
      </div>
      <button type="button" className="map-card-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

/** "€2.5k" for map pins. */
function shortPrice(l: Listing): string {
  if (l.price == null) return '?';
  const sym = l.currency === 'EUR' ? '€' : `${l.currency} `;
  if (l.price >= 1_000_000) return `${sym}${+(l.price / 1_000_000).toFixed(2)}M`;
  if (l.price >= 1000) return `${sym}${+(l.price / 1000).toFixed(l.price >= 100_000 ? 0 : 1)}k`;
  return `${sym}${Math.round(l.price)}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
