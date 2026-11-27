"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { refreshCounts, runSync, setOnline, setSyncUser, syncStore } from "@/lib/offline/sync";

const META_CACHE = "kcms-meta";

/** written before the worker is asked to keep this page (it keeps pages only for the person written there) */
let userReady: Promise<void> = Promise.resolve();

/** The form of a list that can be filled in offline: kept together with the list, so it opens offline even if never opened before. */
const OFFLINE_FORMS: Record<string, string> = { "/kitchen/wastage": "/kitchen/wastage/new" };

/** Tells the service worker who is signed in on this device now, and removes the kept pages of anybody else. */
async function rememberUser(userId: string) {
  try {
    const meta = await caches.open(META_CACHE);
    await meta.put("/__kcms/user", new Response(userId, { headers: { "Content-Type": "text/plain" } }));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("kcms-pages-") && k !== `kcms-pages-${userId}`).map((k) => caches.delete(k)));
  } catch {
    /* no Cache Storage (old browser / private window): pages are simply not kept */
  }
}

/** The service worker keeps the app's files and this page now: one visit is enough to open the app without a connection. */
async function warmUp(reg: ServiceWorkerRegistration) {
  const worker = reg.active ?? (await navigator.serviceWorker.ready).active;
  if (!worker) return;
  const urls = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => u.startsWith(`${location.origin}/_next/static/`));
  worker.postMessage({ type: "kcms-cache-files", urls });
  worker.postMessage({ type: "kcms-keep-page", url: location.href });
  const form = OFFLINE_FORMS[location.pathname];
  if (form) worker.postMessage({ type: "kcms-keep-page", url: form + location.search });
  // the installed app opens on the home page: it is kept too
  if (location.pathname !== "/") worker.postMessage({ type: "kcms-keep-page", url: "/" });
}

/**
 * Offline support of the signed-in pages: registers the service worker, keeps the person's queue going and refreshes the page when
 * changes made offline have been saved. Shown nowhere itself (the status is in the top bar).
 */
export function OfflineProvider({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // a page opened with a link (no full page load) is kept too: the worker asks for it once more when the device is idle
  // (only for the pages kept offline, and at most every 15 minutes per page)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !navigator.serviceWorker?.controller) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const worker = navigator.serviceWorker.controller;
    const timer = window.setTimeout(() => {
      worker.postMessage({ type: "kcms-keep-page", url: location.href });
      const form = OFFLINE_FORMS[location.pathname];
      if (form) worker.postMessage({ type: "kcms-keep-page", url: form + location.search });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    setSyncUser(userId);
    userReady = rememberUser(userId);
    setOnline(navigator.onLine);
    void runSync();

    const online = () => {
      setOnline(true);
      void runSync(true);
    };
    const offline = () => setOnline(false);
    const visible = () => {
      if (document.visibilityState === "visible") void runSync();
    };
    const applied = () => {
      router.refresh();
      // the kept copy of this page is renewed with the saved changes
      window.setTimeout(() => navigator.serviceWorker?.controller?.postMessage({ type: "kcms-keep-page", url: location.href, force: true }), 2500);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("kcms-sync-applied", applied);

    // every minute while something waits (or the connection is down): changes whose wait time is over are sent
    const timer = window.setInterval(() => {
      const s = syncStore.get();
      if (s.pending + s.failed > 0 || !s.online) void runSync();
    }, 60_000);

    const fromWorker = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "kcms-run-sync") void runSync(true);
    };
    navigator.serviceWorker?.addEventListener("message", fromWorker);

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("kcms-sync-applied", applied);
      navigator.serviceWorker?.removeEventListener("message", fromWorker);
      window.clearInterval(timer);
    };
  }, [userId, router]);

  useEffect(() => {
    // in development the build files change on every save: the worker (which keeps them) is only used by the built app
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        await userReady;
        if (cancelled) return;
        await warmUp(reg);
      })
      .catch(() => undefined);
    void refreshCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
