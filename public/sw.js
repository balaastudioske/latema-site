const CACHE = 'latema-static-v9';
const SHELL = ['/', '/fonts.css', '/fonts/dm-sans-latin.woff2', '/fonts/manrope-latin.woff2', '/styles.css', '/enquiry.css', '/slides.css', '/static.js', '/routes.json', '/gallery.json', '/manifest.webmanifest', '/latema-logo.svg', '/latema-icon.svg', '/media/latema-brand-logo.webp', '/media/686537677_122210219738356485_4557751154865791363_n.webp'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request)));
});
