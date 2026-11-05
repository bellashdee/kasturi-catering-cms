"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription, sendTestPush } from "@/lib/push/actions";

type State = "checking" | "unsupported" | "not-set-up" | "needs-install" | "blocked" | "off" | "on";

function applicationServerKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The public key of the notification service (the server keeps it; empty when notifications are not set up there). */
async function fetchKey(): Promise<string> {
  try {
    const res = await fetch("/api/push/key");
    const data = (await res.json()) as { publicKey?: string | null };
    return data.publicKey ?? "";
  } catch {
    return "";
  }
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Switches notifications on or off for THIS phone or computer: the system then tells the person (with the sound of the device) when
 * something needs them, also when the system is closed. A phone is switched on one by one, so it is asked on each device.
 */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        next = isIos() && !isInstalled() ? "needs-install" : "unsupported";
      } else if (!(await fetchKey().then((k) => { if (!cancelled) setPublicKey(k); return k; }))) {
        next = "not-set-up";
      } else if (Notification.permission === "denied") {
        next = "blocked";
      } else {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        next = sub && Notification.permission === "granted" ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchOn() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey || (await fetchKey())) }));
      const json = sub.toJSON();
      const res = await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } }, navigator.userAgent);
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setState("on");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not switch on notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function switchOff() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not switch off notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    const res = await sendTestPush();
    setBusy(false);
    setMessage(res.ok ? (res.sent > 0 ? "Test sent to your devices." : "No device is switched on yet.") : res.error);
  }

  const button = "rounded-lg px-3.5 py-2 text-[13px] font-bold disabled:opacity-60";
  const help: Record<State, string | null> = {
    checking: null,
    unsupported: "This browser cannot show notifications.",
    "not-set-up": "Notifications are not set up on the server yet.",
    "needs-install": "On an iPhone: press Share, choose Add to Home Screen, open the system from the new icon, then switch on notifications here.",
    blocked: "Notifications are blocked in this browser. Allow them in the browser settings (the lock next to the address) and try again.",
    off: "Notifications are off for this device.",
    on: "Notifications are on for this device.",
  };

  return (
    <div className={compact ? "border-t border-border px-4 py-3" : ""}>
      {!compact && (
        <p className="mb-3 text-[13px] text-text-secondary">
          You will hear the notification sound of your phone or computer when something needs you: a task given to you, an approval, a payment proof, a quotation request, a staff claim or a bulletin.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        {state === "off" && (
          <button type="button" disabled={busy} onClick={switchOn} className={`${button} bg-primary text-white`}>
            {busy ? "Switching on..." : "Switch on notifications"}
          </button>
        )}
        {state === "on" && (
          <>
            <button type="button" disabled={busy} onClick={test} className={`${button} border border-border-strong bg-surface text-text`}>
              Send a test notification
            </button>
            <button type="button" disabled={busy} onClick={switchOff} className={`${button} border border-danger/40 bg-surface text-danger`}>
              Switch off notifications
            </button>
          </>
        )}
        {help[state] && <span className={`text-[12.5px] ${state === "on" ? "font-semibold text-success" : state === "blocked" ? "text-danger" : "text-text-secondary"}`}>{help[state]}</span>}
      </div>
      {message && <div className="mt-2 text-[12.5px] text-text-secondary">{message}</div>}
    </div>
  );
}
