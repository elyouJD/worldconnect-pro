const CACHE = "worldconnect-shell-v14";
const SHELL = ["./", "./index.html", "./css/styles.css", "./js/app.js", "./manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .catch(error => console.error("WorldConnect: shell cache failed", error))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("worldconnect-shell-") && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);

      if (response.ok && (
        request.mode === "navigate" ||
        SHELL.some(path => new URL(path, self.location).pathname === new URL(request.url).pathname)
      )) {
        // Clone exactly once, synchronously after fetch resolves and before returning it.
        const cacheCopy = response.clone();
        caches.open(CACHE)
          .then(cache => cache.put(request, cacheCopy))
          .catch(error => console.warn("WorldConnect: cache update skipped", error));
      }

      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;

      if (request.mode === "navigate") {
        const appShell = await caches.match("./index.html");
        if (appShell) return appShell;
      }

      return new Response("Network unavailable", {
        status: 503,
        statusText: "Service Unavailable"
      });
    }
  })());
});
