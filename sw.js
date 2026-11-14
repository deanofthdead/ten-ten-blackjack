// Offline-first shell: everything the game needs is cached on install, including the pixel font,
// so the home-screen app works with no signal. Same-origin files are refreshed from the network
// when it's available (bypassing the HTTP cache) so updates land; otherwise the cache answers.
const CACHE = 'ttbj-v6';
const CORE = ['./', 'index.html', 'engine.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';

async function cacheFont(c) {
  try {
    const r = await fetch(FONT_CSS, { mode: 'cors' });
    if (!r.ok) return;
    const css = await r.clone().text();
    await c.put(FONT_CSS, r);
    const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(f => f.ok && c.put(u, f)).catch(() => {})));
  } catch (e) {}
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...CORE.map(u => fetch(u, { cache: 'no-store' }).then(r => r.ok && c.put(u, r)).catch(() => {})),
    cacheFont(c),
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // Network first (short timeout), cache fallback. Ignore query strings (?s=SEED, ?daily) for the cache.
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const key = url.pathname.endsWith('/') ? './' : req;
      try {
        const net = await Promise.race([
          fetch(req.url.split('?')[0], { cache: 'no-store' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3500)),
        ]);
        if (net && net.ok) c.put(key, net.clone());
        return net;
      } catch (err) {
        return (await c.match(key, { ignoreSearch: true })) || (await c.match('index.html')) || Response.error();
      }
    })());
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    // Fonts: cache first.
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(req.url)) || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req.url, r.clone()); return r; })));
  }
});
