// Service worker of the Central Management System.
//  1. Notifications: shows a notification when the server sends one (also when the system is closed) and opens the right page.
//  2. Offline: keeps the app's own files (scripts, styles, icons) so the app opens without a connection, and keeps the last copy of the
//     day-to-day pages the signed-in person opened, for that person only (see docs/offline-first-plan.md). Payroll, staff files,
//     finance, reports, admin and settings are never kept. Changes made offline are not handled here: the app keeps them in IndexedDB
//     and sends them to /api/sync; this worker only wakes the app for Background Sync.

const VERSION = "2026-11-28.1";
const STATIC_CACHE = "kcms-static-v1";
const META_CACHE = "kcms-meta";
const PAGES_PREFIX = "kcms-pages-";
const MAX_PAGES = 80;
const MAX_STATIC = 600;
const SHELL = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/favicon.ico"];

// Mirror of src/lib/offline/policy.ts (checked by scripts/check-offline-policy.mjs).
const OFFLINE_PAGES = [
  "/bulletin",
  "/birthdays",
  "/priority-centre",
  "/catering",
  "/kitchen",
  "/driver-logistics",
  "/restaurant",
  "/marketing",
  "/spending/petty-cash",
  "/spending/my-claims",
  "/supplier-procurement",
];
const NEVER_OFFLINE = [
  "/catering/customers",
  "/catering/import",
  "/driver-logistics/attendance",
  "/driver-logistics/vehicles/import",
  "/kitchen/ingredients/import",
  "/marketing/expenses",
  "/marketing/leads/import",
  "/restaurant/cash",
  "/restaurant/import",
];

const under = (path, prefix) => path === prefix || path.startsWith(prefix + "/");
function isOfflinePage(pathname) {
  if (pathname === "/") return true;
  if (NEVER_OFFLINE.some((p) => under(pathname, p))) return false;
  return OFFLINE_PAGES.some((p) => under(pathname, p));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // caches of an older layout of this worker are removed; the pages of the signed-in person are kept
      const keep = new Set([STATIC_CACHE, META_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith("kcms-") && !keep.has(key) && !key.startsWith(PAGES_PREFIX)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** The person signed in on this device now (written by the app); pages are only ever kept and shown for this person. */
async function currentUser() {
  try {
    const res = await (await caches.open(META_CACHE)).match("/__kcms/user");
    const id = res ? (await res.text()).trim() : "";
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

const pageKey = (url) => url.origin + url.pathname + url.search;

async function keepPage(userId, url, response) {
  if (!userId || !isOfflinePage(url.pathname)) return;
  if (!response || !response.ok || response.redirected || response.type !== "basic") return;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return;
  const headers = new Headers(response.headers);
  headers.set("x-kcms-saved-at", new Date().toISOString());
  const body = await response.blob();
  const cache = await caches.open(PAGES_PREFIX + userId);
  await cache.delete(pageKey(url), { ignoreVary: true });
  await cache.put(pageKey(url), new Response(body, { status: response.status, statusText: response.statusText, headers }));
  await trim(PAGES_PREFIX + userId, MAX_PAGES);
}

async function savedPage(userId, url) {
  if (!userId) return null;
  const cache = await caches.open(PAGES_PREFIX + userId);
  return (await cache.match(pageKey(url), { ignoreVary: true })) || (await cache.match(url.origin + url.pathname, { ignoreSearch: true, ignoreVary: true })) || null;
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const userId = await currentUser();
  try {
    const response = await fetch(request);
    if (userId && isOfflinePage(url.pathname)) keepPage(userId, url, response.clone()).catch(() => undefined);
    return response;
  } catch {
    const copy = isOfflinePage(url.pathname) ? await savedPage(userId, url) : null;
    if (copy) return copy;
    return offlinePage(userId, url);
  }
}

async function offlinePage(userId, url) {
  let links = "";
  if (userId) {
    const keys = await (await caches.open(PAGES_PREFIX + userId)).keys();
    const paths = Array.from(new Set(keys.map((r) => new URL(r.url).pathname))).sort().slice(0, 40);
    links = paths.map((p) => `<li><a href="${p}">${p === "/" ? "Home / Utama" : p}</a></li>`).join("");
  }
  const kept = !isOfflinePage(url.pathname)
    ? "<p>This page is not kept on the device (it holds private or finance data). It opens only with a connection.<br><i>Halaman ini tidak disimpan pada peranti (data peribadi atau kewangan). Ia hanya dibuka apabila ada sambungan.</i></p>"
    : "<p>This page was not opened on this device before, so there is no copy of it yet.<br><i>Halaman ini belum pernah dibuka pada peranti ini, jadi tiada salinannya lagi.</i></p>";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Kasturi Catering</title>
<style>body{font-family:Arial,sans-serif;margin:0;background:#f6f4f2;color:#2a2a2a}main{max-width:560px;margin:40px auto;padding:24px;background:#fff;border-radius:14px;border:1px solid #e5e0dc}
h1{font-size:20px;margin:0 0 8px;color:#a85d6b}p{font-size:14px;line-height:1.5}ul{padding-left:18px;font-size:14px}a{color:#a85d6b}button{background:#a85d6b;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:700;font-size:14px}</style></head>
<body><main><h1>You are offline · Anda di luar talian</h1>${kept}
${links ? `<p><b>Pages you can open offline · Halaman yang boleh dibuka tanpa sambungan:</b></p><ul>${links}</ul>` : ""}
<p>Changes you saved offline stay on this device and are sent when the connection is back.<br><i>Perubahan yang disimpan semasa luar talian kekal pada peranti ini dan dihantar apabila sambungan pulih.</i></p>
<button onclick="location.reload()">Try again · Cuba lagi</button></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    cache.put(request, response.clone()).then(() => trim(STATIC_CACHE, MAX_STATIC)).catch(() => undefined);
  }
  return response;
}

async function networkFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
    if (hit) return hit;
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Supabase data and the APIs are never kept here (they hold personal data and must always be current)
  if (url.pathname.startsWith("/supabase/") || url.pathname.startsWith("/api/") || url.pathname.startsWith("/__kcms/")) return;
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(request));
  if (url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico" || url.pathname === "/manifest.webmanifest") {
    return event.respondWith(networkFirstStatic(request));
  }
  if (request.mode === "navigate") return event.respondWith(handleNavigation(request));
  // page data of a link (RSC) is not kept: when it fails offline, Next opens the page as a full page load, which the cache above answers
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  // the files of the page that was open before this worker took over (so the first visit is enough to open offline)
  if (data.type === "kcms-cache-files" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        for (const u of data.urls.slice(0, 200)) {
          try {
            const url = new URL(u, self.location.origin);
            if (url.origin !== self.location.origin || !url.pathname.startsWith("/_next/static/")) continue;
            if (await cache.match(url.href)) continue;
            const res = await fetch(url.href);
            if (res.ok) await cache.put(url.href, res);
          } catch {
            /* skipped */
          }
        }
      })(),
    );
  }
  // the page that is open now, kept for the signed-in person (its first load happened before this worker was in control)
  if (data.type === "kcms-keep-page" && typeof data.url === "string") {
    event.waitUntil(
      (async () => {
        const userId = await currentUser();
        const url = new URL(data.url, self.location.origin);
        if (!userId || url.origin !== self.location.origin || !isOfflinePage(url.pathname)) return;
        // a copy saved in the last 15 minutes is fresh enough (each renewal is one more page load on the server)
        if (!data.force) {
          const copy = await (await caches.open(PAGES_PREFIX + userId)).match(pageKey(url), { ignoreVary: true });
          const savedAt = copy ? Date.parse(copy.headers.get("x-kcms-saved-at") || "") : NaN;
          if (savedAt && Date.now() - savedAt < 15 * 60_000) return;
        }
        try {
          const res = await fetch(url.href, { credentials: "same-origin", redirect: "manual" });
          await keepPage(userId, url, res);
        } catch {
          /* offline: kept next time */
        }
      })(),
    );
  }
  // when the copy of a page shown offline was saved
  if (data.type === "kcms-page-saved-at" && typeof data.url === "string" && event.ports && event.ports[0]) {
    event.waitUntil(
      (async () => {
        const hit = await savedPage(await currentUser(), new URL(data.url, self.location.origin));
        event.ports[0].postMessage({ savedAt: hit ? hit.headers.get("x-kcms-saved-at") : null });
      })(),
    );
  }
  if (data.type === "kcms-version" && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

// Background Sync (Chrome, Edge, Android): the app sends its queue; with no window open, the queue is sent the next time it is opened
self.addEventListener("sync", (event) => {
  if (event.tag !== "kcms-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      windows.forEach((w) => w.postMessage({ type: "kcms-run-sync" }));
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Kasturi Catering";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: data.tag || undefined,
      renotify: !!data.tag, // the same item again still makes the sound
      vibrate: [200, 100, 200],
      silent: false, // the phone or computer plays its notification sound
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          return w.navigate(target).then((c) => (c || w).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
