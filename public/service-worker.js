"use strict";

const CACHE_NAME = "packstudio-studio-v11";
const APP_ASSETS = [
  "/offline.html",
  "/packstudio-icon.png",
  "/packstudio/app.html",
  "/packstudio/app.css",
  "/packstudio/account-controls.css",
  "/packstudio/core.js",
  "/packstudio/engine.js",
  "/packstudio/job-sheet.js",
  "/packstudio/app.js",
];
const APP_ASSET_PATHS = new Set(APP_ASSETS);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith("packstudio-studio-") ||
                key.startsWith("cartonlab-studio-")) &&
              key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === "/app") {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match("/offline.html")) ||
        new Response("Studio is unavailable offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      ),
    );
    return;
  }

  if (APP_ASSET_PATHS.has(url.pathname)) {
    event.respondWith(
      caches.match(`${url.origin}${url.pathname}`).then((cached) => cached || fetch(request)),
    );
  }
});
