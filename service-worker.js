const CACHE = "worldconnect-shell-v15";
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

// Runtime fetch interception is intentionally disabled for now.
// This avoids reusing or cloning already-consumed response bodies.
// The browser will request application resources directly from the network.
