import { describe, expect, it } from 'vitest';
import { findUrl, parseListingHtml, parsePrice } from '../src/shared/parse.ts';

describe('parsePrice', () => {
  it.each([
    ['1.500 €', 1500],
    ['1,500', 1500],
    ['1 250 €/mês', 1250],
    ['450.000', 450000],
    ['1.500,50', 1500.5],
    ['1,500.50', 1500.5],
    ['950', 950],
    ['', undefined],
    ['sob consulta', undefined],
  ])('%s → %s', (raw, expected) => expect(parsePrice(raw)).toBe(expected));
});

describe('parseListingHtml', () => {
  it('reads Open Graph tags and Portuguese title conventions', () => {
    const html = `<html><head>
      <title>ignored</title>
      <meta property="og:title" content="Apartamento T2 para arrendar em Rua Frederico Arouca, Cascais e Estoril">
      <meta property="og:description" content="Apartamento T2 com 85 m&sup2; por 1.800 &euro;/m&ecirc;s, perto da praia.">
      <meta property="og:image" content="https://img3.idealista.pt/blur/WEB_LISTING/0/id.pro.pt.image.master/aa/bb/1.jpg">
      </head><body>
      <a href="tel:+351 912 345 678">Ligar</a>
      <script>var gallery = ["https:\\/\\/img3.idealista.pt\\/blur\\/WEB_DETAIL\\/0\\/id.pro.pt.image.master\\/aa\\/bb\\/2.jpg"]</script>
      </body></html>`;
    const r = parseListingHtml(html, 'https://www.idealista.pt/imovel/12345678/');
    expect(r).toMatchObject({
      source: 'idealista.pt',
      title: 'Apartamento T2 para arrendar em Rua Frederico Arouca, Cascais e Estoril',
      price: 1800,
      currency: 'EUR',
      dealType: 'rent',
      bedrooms: 2,
      areaM2: 85,
      address: 'Rua Frederico Arouca, Cascais e Estoril',
      phone: '+351 912 345 678',
    });
    // Both photos found, upgraded to the large variant, no duplicates.
    expect(r.photoUrls).toEqual([
      'https://img3.idealista.pt/blur/WEB_DETAIL-XL-L/0/id.pro.pt.image.master/aa/bb/1.jpg',
      'https://img3.idealista.pt/blur/WEB_DETAIL-XL-L/0/id.pro.pt.image.master/aa/bb/2.jpg',
    ]);
  });

  it('prefers schema.org JSON-LD when present', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Apartment',
          name: 'Bright 3 bedroom flat with sea view',
          numberOfBedrooms: 3,
          numberOfBathroomsTotal: 2,
          floorSize: { '@type': 'QuantitativeValue', value: 120, unitCode: 'MTK' },
          address: { '@type': 'PostalAddress', streetAddress: 'Av. Rei Humberto II', addressLocality: 'Cascais', postalCode: '2750-800' },
          image: [{ '@type': 'ImageObject', contentUrl: '/photos/a.jpg' }, 'https://cdn.example.com/b.jpg'],
        },
        { '@type': 'Offer', price: '650000', priceCurrency: 'EUR' },
        { '@type': 'RealEstateAgent', name: 'Casa Boa Imobiliária', telephone: '214 000 000', email: 'info@casaboa.pt' },
      ],
    };
    const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>
      <meta property="og:title" content="Something else entirely">`;
    const r = parseListingHtml(html, 'https://www.example.pt/comprar/apartamento/123');
    expect(r).toMatchObject({
      title: 'Bright 3 bedroom flat with sea view',
      price: 650000,
      currency: 'EUR',
      dealType: 'buy',
      bedrooms: 3,
      bathrooms: 2,
      areaM2: 120,
      address: 'Av. Rei Humberto II, Cascais, 2750-800',
      agency: 'Casa Boa Imobiliária',
      phone: '214 000 000',
      email: 'info@casaboa.pt',
      photoUrls: ['https://www.example.pt/photos/a.jpg', 'https://cdn.example.com/b.jpg'],
    });
  });

  it('survives junk', () => {
    const r = parseListingHtml('<script type="application/ld+json">{not json</script><p>hello', 'https://x.com/a');
    expect(r).toEqual({ url: 'https://x.com/a', source: 'x.com', photoUrls: [] });
  });
});

describe('findUrl', () => {
  it('extracts a link from shared text', () => {
    expect(findUrl('Olha esta casa! https://www.idealista.pt/imovel/123/ (via idealista).')).toBe(
      'https://www.idealista.pt/imovel/123/',
    );
    expect(findUrl('no link')).toBeUndefined();
  });
});

describe('parseSharedText', () => {
  it('pulls what it can from share-sheet text', async () => {
    const { parseSharedText } = await import('../src/shared/parse.ts');
    const url = 'https://www.idealista.pt/imovel/34127812/';
    expect(parseSharedText(`Apartamento T2 para arrendar em Rua de Birre, Cascais por 1.650 €/mês ${url}`, url)).toMatchObject({
      title: 'Apartamento T2 para arrendar em Rua de Birre, Cascais por 1.650 €/mês',
      price: 1650,
      dealType: 'rent',
      bedrooms: 2,
      address: 'Rua de Birre, Cascais',
    });
    expect(parseSharedText(url, url)).toEqual({ url, source: 'idealista.pt', photoUrls: [] });
  });
});

describe('bookmarklet snapshot', () => {
  it('uses the visible page text when meta tags lack the details', () => {
    const snapshot =
      '<title>Apartamento T2 para arrendar em Rua de Birre, Cascais — idealista</title>' +
      '<meta property="og:title" content="Apartamento T2 para arrendar em Rua de Birre, Cascais">' +
      '<img src="https://img4.idealista.pt/blur/WEB_DETAIL/0/id.pro.pt.image.master/11/22/b.jpg">' +
      '<main data-page-text>Comprar Arrendar Apartamento T2 para arrendar 1.650 €/mês 85 m² área bruta</main>';
    const r = parseListingHtml(snapshot, 'https://www.idealista.pt/imovel/34127812/');
    expect(r).toMatchObject({ price: 1650, dealType: 'rent', bedrooms: 2, areaM2: 85 });
    expect(r.photoUrls).toEqual(['https://img4.idealista.pt/blur/WEB_DETAIL-XL-L/0/id.pro.pt.image.master/11/22/b.jpg']);
  });

  it('does not take the deal type from site menus when the ad says it', () => {
    const snapshot =
      '<meta property="og:title" content="Moradia T4 à venda em Birre">' +
      '<main data-page-text>Arrendar Comprar Moradia T4 à venda 950.000 €</main>';
    expect(parseListingHtml(snapshot, 'https://www.idealista.pt/imovel/1/')).toMatchObject({ dealType: 'buy', price: 950000 });
  });
});

describe('site name in titles', () => {
  it('drops a trailing "— idealista" and similar', () => {
    const t = (title: string, url: string) => parseListingHtml(`<title>${title}</title>`, url).title;
    expect(t('T1 flat for rent in Avenida Infante Dom Henrique, Cascais — idealista', 'https://www.idealista.pt/en/imovel/1/')).toBe(
      'T1 flat for rent in Avenida Infante Dom Henrique, Cascais',
    );
    expect(t('Apartamento T2 | Imovirtual.com', 'https://www.imovirtual.com/pt/anuncio/x')).toBe('Apartamento T2');
    expect(t('Casa - Cascais', 'https://www.idealista.pt/imovel/1/')).toBe('Casa - Cascais');
  });
});

describe('duplicate photos', () => {
  it('treats the same idealista photo from another server, size or format as one', async () => {
    const { uniquePhotos } = await import('../src/shared/parse.ts');
    const base = 'id.pro.pt.image.master/2a/f1/0e/1234567.jpg';
    const urls = [
      `https://img3.idealista.pt/blur/WEB_DETAIL-XL-L/0/${base}`,
      `https://img4.idealista.pt/blur/WEB_DETAIL-XL-L/0/${base}`,
      `https://img3.idealista.pt/blur/WEB_LISTING/0/${base.replace('.jpg', '.webp')}`,
      `https://img3.idealista.pt/blur/WEB_DETAIL-XL-L/0/id.pro.pt.image.master/2a/f1/0e/7654321.jpg`,
    ];
    expect(uniquePhotos(urls)).toEqual([urls[0], urls[3]]);
  });

  it('collects each photo once from a page that lists copies', () => {
    const html =
      '<meta property="og:image" content="https://img3.idealista.pt/blur/WEB_LISTING/0/id.pro.pt.image.master/aa/1.jpg">' +
      '<img src="https://img4.idealista.pt/blur/WEB_DETAIL/0/id.pro.pt.image.master/aa/1.webp">' +
      '<img src="https://img3.idealista.pt/blur/WEB_DETAIL/0/id.pro.pt.image.master/aa/2.jpg">';
    expect(parseListingHtml(html, 'https://www.idealista.pt/imovel/1/').photoUrls).toHaveLength(2);
  });
});

describe('coordinates', () => {
  it('reads them from JSON-LD, meta tags or the page map data', () => {
    const url = 'https://www.example.pt/imovel/1';
    const ld = '<script type="application/ld+json">{"@type":"Apartment","geo":{"@type":"GeoCoordinates","latitude":38.7012,"longitude":-9.4189}}</script>';
    expect(parseListingHtml(ld, url)).toMatchObject({ lat: 38.7012, lng: -9.4189 });
    const meta = '<meta property="place:location:latitude" content="38.69"><meta property="place:location:longitude" content="-9.42">';
    expect(parseListingHtml(meta, url)).toMatchObject({ lat: 38.69, lng: -9.42 });
    const snap = '<meta name="homehunt:lat" content="38.7051"><meta name="homehunt:lng" content="-9.3961">';
    expect(parseListingHtml(snap, url)).toMatchObject({ lat: 38.7051, lng: -9.3961 });
    const script = '<script>var map = {"latitude":"38.7071","longitude":"-9.4252","zoom":15}</script>';
    expect(parseListingHtml(script, url)).toMatchObject({ lat: 38.7071, lng: -9.4252 });
    expect(parseListingHtml('<p>no map</p>', url).lat).toBeUndefined();
  });
});
