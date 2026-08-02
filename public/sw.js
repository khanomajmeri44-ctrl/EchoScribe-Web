const SHELL_CACHE_PREFIX = "echoscribe-shell-";
const CACHE = `${SHELL_CACHE_PREFIX}v9`;
const SHELL = ["./manifest.webmanifest", "./echoscribe-icon.png", "./favicon.ico"];

const cacheResponse = (request, response) => {
  if (!response?.ok) return;
  caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => undefined);
};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        cacheResponse(event.request, response);
        return response;
      }).catch(() => caches.match(event.request)),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ?? fetch(event.request).then((response) => {
        cacheResponse(event.request, response);
        return response;
      }),
    ),
  );
});
