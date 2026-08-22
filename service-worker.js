const CACHE_NAME = "fsd-chorale-offline-v5";

const LOCAL_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./social-preview.jpg"
];

const FIREBASE_MODULES = [
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Local files are required for the app shell.
    await cache.addAll(LOCAL_SHELL);

    // Try to store Firebase modules too. Failure of one remote file must
    // not prevent the service worker from installing.
    await Promise.allSettled(
      FIREBASE_MODULES.map(async (url) => {
        const response = await fetch(url, { mode: "cors" });
        if (response.ok) await cache.put(url, response);
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isFirebaseModule =
    url.hostname === "www.gstatic.com" &&
    url.pathname.includes("/firebasejs/12.17.1/");

  // Firebase modules: cache-first so the JavaScript can start offline.
  if (isFirebaseModule) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return new Response("", {
          status: 503,
          statusText: "Offline"
        });
      }
    })());
    return;
  }

  // Page navigation: newest page when online, saved page when offline.
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put("./index.html", response.clone());
        return response;
      } catch {
        return (await caches.match("./index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }

  // Other same-origin assets: network-first, cache fallback.
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response && response.ok && url.origin === self.location.origin) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(event.request)) ||
        new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
