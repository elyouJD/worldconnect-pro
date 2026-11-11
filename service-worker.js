const CACHE = "worldconnect-shell-v4";
const SHELL = ["./", "./index.html", "./css/styles.css", "./js/app.js", "./manifest.json"];

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
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const shouldCache = request.mode === "navigate" ||
          SHELL.some((path) => new URL(path, self.location).pathname === url.pathname);
        if (shouldCache) {
          // Clone exactly once, before the response is returned to the page.
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch((error) => {
              console.warn("No se pudo actualizar la caché:", error);
            })
          );
        }
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      return new Response("Sin conexión", { status: 503, statusText: "Service Unavailable" });
    }
  })());
});
