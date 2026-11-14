const CACHE = "worldconnect-shell-v12";
const SHELL = ["./", "./index.html", "./css/styles.css", "./js/app.js", "./manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && (request.mode === "navigate" ||
          SHELL.some(path => new URL(path, self.location).pathname === new URL(request.url).pathname))) {
        // Clone synchronously before returning the original response to the browser.
        const cacheCopy = response.clone();
        event.waitUntil(
          caches.open(CACHE).then(cache => cache.put(request, cacheCopy)).catch(() => {})
        );
      }
      return response;
    }).catch(() =>
      caches.match(request).then(cached => cached || caches.match("./index.html"))
    )
  );
});
