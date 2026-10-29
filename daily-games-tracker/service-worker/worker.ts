/// <reference lib="webworker" />

import { isAppShellAsset, isNetworkOnlyPath } from "../shared/cache-policy";

declare const self: ServiceWorkerGlobalScope;

const CACHE_PREFIX = "wht-app-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const CORE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNetworkOnlyPath(url.pathname)) {
    // Bypass the HTTP cache too, including entries from an older deployment.
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isAppShellAsset(url.pathname, request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstNavigation(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    // A shell navigation may redirect to login or another protected endpoint.
    if (response.ok && !response.redirected) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put("/", withoutRequestId(response));
    }
    return response;
  } catch {
    const cached = await caches.match("/");
    return cached ?? Response.error();
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && !response.redirected) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, withoutRequestId(response));
  }
  return response;
}

function withoutRequestId(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("X-Request-ID");
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
