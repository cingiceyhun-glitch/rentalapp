// The bookmarklet runs on the ad page the user already has open, so it sees
// exactly what they see: no bot checks, no logins. It takes a small snapshot of
// the page (meta tags, structured data, phone links, photo URLs and the visible
// text) and opens HomeHunt with it in the URL. HomeHunt parses it locally.
//
// It navigates the same tab instead of opening a pop-up, so it also works in
// Chrome on Android, where bookmarklets are launched from the address bar.

/** Max characters of visible page text to pass along (enough for price, typology, area). */
const TEXT_LIMIT = 4000;
const MAX_IMAGES = 150;

export function bookmarkletCode(origin: string): string {
  const src =
    `(()=>{const d=document,q=s=>[...d.querySelectorAll(s)],` +
    `e=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),` +
    `i=new Set;` +
    `q('img').forEach(m=>[m.currentSrc,m.src,m.dataset.src,m.dataset.ondemandimg].forEach(u=>u&&/^http/.test(u)&&i.add(u)));` +
    `(d.documentElement.outerHTML.replace(/\\\\\\//g,'/').match(/https?:\\/\\/[^"'\\s)\\\\]+?\\.(?:jpe?g|webp)/gi)||[]).forEach(u=>i.add(u));` +
    `const p='<title>'+e(d.title)+'</title>'` +
    `+q('meta[property],meta[name],meta[itemprop]').map(m=>m.outerHTML).join('')` +
    `+q('script[type="application/ld+json"]').map(s=>s.outerHTML).join('')` +
    `+q('a[href^="tel:"],a[href^="mailto:"]').map(a=>'<a href="'+e(a.getAttribute('href'))+'"></a>').join('')` +
    `+[...i].slice(0,${MAX_IMAGES}).map(u=>'<img src="'+e(u)+'">').join('')` +
    `+'<main data-page-text>'+e((d.body.innerText||'').slice(0,${TEXT_LIMIT}))+'</main>';` +
    `location.href=${JSON.stringify(origin)}+'/#/add?via=bookmarklet&url='+encodeURIComponent(location.href)+'&page='+encodeURIComponent(p)})()`;
  return `javascript:${encodeURIComponent(src)}`;
}
