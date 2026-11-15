"use client";

import { useEffect, useState } from "react";
import { PushToggle } from "@/components/settings/PushToggle";

const DISMISS_KEY = "cms-push-prompt-dismissed";

/**
 * Notifications are switched on per phone or computer. When this device was never asked (or never switched on), a small box at the
 * bottom offers to switch them on, so a phone also rings when the app is closed. "Not now" hides it on this device for 7 days.
 */
export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
        if (Notification.permission === "denied") return;
        const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
        if (until > Date.now()) return;
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub && Notification.permission === "granted") return;
        if (!cancelled) setShow(true);
      } catch {
        // never in the way of the work
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {}
    setShow(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-xl border border-border-strong bg-surface shadow-2xl print:hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <div className="text-[14px] font-bold text-text">Get notifications on this device</div>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">Your phone or computer will ring when something needs you, even when the app is closed.</p>
        </div>
        <button type="button" onClick={close} className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-semibold text-text-secondary hover:text-text">
          Not now
        </button>
      </div>
      <PushToggle compact />
    </div>
  );
}
