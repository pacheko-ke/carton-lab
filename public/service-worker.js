"use strict";

const CACHE_NAME = "packstudio-studio-v12";
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

self.addEventListener("push", (event) => {
  let payload = {};
  const rawData = event.data ? event.data.text() : "";
  if (rawData) {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed;
      }
    } catch {
      payload = { body: rawData };
    }
  }

  const title =
    typeof payload.title === "string" ? payload.title : "Production notification";
  const body = typeof payload.body === "string" ? payload.body : "Open Production to view the update.";
  const url = typeof payload.url === "string" ? payload.url : "/production/admin";
  const tag = typeof payload.tag === "string" ? payload.tag : "production-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/packstudio-icon.png",
      badge: "/packstudio-icon.png",
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let targetUrl = new URL("/production/admin", self.location.origin);
  try {
    const candidate = new URL(event.notification.data?.url, self.location.origin);
    if (candidate.origin === self.location.origin) targetUrl = candidate;
  } catch {
    targetUrl = new URL("/production/admin", self.location.origin);
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((windowClient) =>
        new URL(windowClient.url).origin === self.location.origin,
      );
      if (client) {
        return client.navigate(targetUrl.href).then(() => client.focus());
      }
      return self.clients.openWindow(targetUrl.href);
    }),
  );
});
