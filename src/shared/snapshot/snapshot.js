(function () {
  /* Snapshot of the ad page the user has open: meta tags, phone and email links,
     photo URLs, visible text and structured data. Shared by the HomeHunt bookmark
     and the Android app; parsed by src/shared/parse.ts. Kept small (max 60k
     characters) because it travels inside a link. */
  var MAX = 60000;
  var d = document;
  function q(s) { return Array.prototype.slice.call(d.querySelectorAll(s)); }
  function e(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  var seen = {};
  var images = [];
  function add(u) {
    if (u && /^https?:/.test(u) && !seen[u]) { seen[u] = 1; images.push(u); }
  }
  q('img').forEach(function (m) {
    add(m.currentSrc); add(m.src); add(m.getAttribute('data-src')); add(m.getAttribute('data-ondemandimg'));
  });
  (d.documentElement.outerHTML.replace(/\\\//g, '/').match(/https?:\/\/[^"'\s)\\]+?\.(?:jpe?g|webp)/gi) || []).forEach(add);
  var geo = d.documentElement.outerHTML.match(/["']?(?:latitude|lat)["']?\s*[:=]\s*["']?(-?\d{1,2}\.\d{3,})["']?\s*,\s*["']?(?:longitude|lng|lon)["']?\s*[:=]\s*["']?(-?\d{1,3}\.\d{3,})/i);
  var p = '<title>' + e(d.title) + '</title>' +
    (geo ? '<meta name="homehunt:lat" content="' + geo[1] + '"><meta name="homehunt:lng" content="' + geo[2] + '">' : '') +
    q('meta[property],meta[name],meta[itemprop]').map(function (m) { return m.outerHTML; }).join('') +
    q('a[href^="tel:"],a[href^="mailto:"]').map(function (a) { return '<a href="' + e(a.getAttribute('href')) + '"></a>'; }).join('') +
    images.slice(0, 150).map(function (u) { return '<img src="' + e(u) + '">'; }).join('') +
    '<main data-page-text>' + e((d.body && d.body.innerText || '').slice(0, 4000)) + '</main>';
  q('script[type="application/ld+json"]').forEach(function (s) {
    if (p.length + s.outerHTML.length < MAX) p += s.outerHTML;
  });
  return p.slice(0, MAX);
})()
