// Kampasika Service Worker - required for PWA install & Play Store
const CACHE_NAME = 'kampasika-v2';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/logo192.png',
  '/logo512.png',
  '/favicon.ico',
  '/manifest.json'
];

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0f1b2d" />
    <title>Kampasika Offline</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        background: #f4f6f8;
        color: #0f1b2d;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        width: min(420px, 100%);
        background: #ffffff;
        border: 1px solid #dce5ea;
        border-radius: 8px;
        padding: 24px;
        box-shadow: 0 16px 36px rgba(15, 27, 45, 0.12);
      }
      .mark {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #06d6c7;
        color: #0f1b2d;
        display: grid;
        place-items: center;
        font-size: 22px;
        font-weight: 900;
        margin-bottom: 18px;
      }
      h1 {
        font-size: 23px;
        line-height: 1.2;
        margin: 0 0 10px;
        letter-spacing: 0;
      }
      p {
        color: #486171;
        font-size: 15px;
        line-height: 1.55;
        margin: 0 0 18px;
      }
      ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 10px;
      }
      li {
        border: 1px solid #dce5ea;
        border-radius: 8px;
        padding: 11px 12px;
        font-size: 14px;
        color: #23404f;
        background: #f8fbfc;
      }
      button {
        width: 100%;
        margin-top: 20px;
        border: 0;
        border-radius: 8px;
        background: #0f1b2d;
        color: #ffffff;
        padding: 13px 16px;
        font-weight: 800;
        font-size: 15px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">K</div>
      <h1>You are offline</h1>
      <p>Kampasika can still show group data that was saved on this device. New resources, chats, and submissions will sync when your connection returns.</p>
      <ul>
        <li>Open the app again to view saved group boards and updates.</li>
        <li>Previously loaded updates can appear from cache.</li>
        <li>Files open offline only after they have been saved or cached.</li>
      </ul>
      <button onclick="location.reload()">Try again</button>
    </main>
  </body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken')
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('/index.html', responseClone);
          });
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => (
          cached || new Response(OFFLINE_PAGE, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          })
        )))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => (
        cached || new Response('', { status: 503 })
      )))
  );
});
