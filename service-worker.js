const CACHE = "worldconnect-shell-v3";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(request);

      if (networkResponse && networkResponse.ok) {
        const requestUrl = new URL(request.url);
        const shouldCache =
          request.mode === "navigate" ||
          SHELL.some((path) =>
            new URL(path, self.location.href).pathname === requestUrl.pathname
          );

        if (shouldCache) {
          // Clone immediately, before the response can be consumed elsewhere.
          const responseForCache = networkResponse.clone();

          event.waitUntil(
            caches.open(CACHE)
              .then((cache) => cache.put(request, responseForCache))
              .catch((error) => {
                console.warn("WorldConnect cache update failed:", error);
              })
          );
        }
      }

      return networkResponse;
    } catch (error) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;

      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }

      throw error;
    }
  })());
});
