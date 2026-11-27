"use client";

import { useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { BTN_SM } from "@/components/priority/ui";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// the browser offers the install only once per page load: it is caught as early as possible
let deferred: InstallPrompt | null = null;
const waiters = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    waiters.forEach((w) => w());
  });
}

function subscribeInstall(listener: () => void) {
  waiters.add(listener);
  return () => {
    waiters.delete(listener);
  };
}

type Platform = "windows" | "android" | "ios" | "mac" | "other";

function detect(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh/i.test(ua)) return "mac";
  return "other";
}

const STEPS: Record<Platform, { title: string; steps: string[] }> = {
  windows: {
    title: "Windows computer (Chrome or Edge)",
    steps: ["Open the system in Chrome or Edge and sign in.", "Press the Install icon at the right end of the address bar (or the ⋮ / … menu > Apps > Install this site as an app).", "The app opens in its own window and gets an icon in the Start menu and on the taskbar."],
  },
  android: {
    title: "Android phone or tablet (Chrome)",
    steps: ["Open the system in Chrome and sign in.", "Press the ⋮ menu > Install app (or Add to Home screen).", "Open the app from its icon on the home screen."],
  },
  ios: {
    title: "iPhone or iPad (Safari)",
    steps: ["Open the system in Safari and sign in.", "Press the Share button, then Add to Home Screen, then Add.", "Always open the app from its Home Screen icon: iOS keeps its offline data only for the installed app, and may remove it if the app is not opened for a few weeks."],
  },
  mac: {
    title: "Mac (Safari or Chrome)",
    steps: ["Safari: File > Add to Dock.", "Chrome: press the Install icon at the right end of the address bar."],
  },
  other: { title: "Other devices", steps: ["Use the browser's menu: Install app or Add to Home screen."] },
};

/** How to install the system as an app on each kind of device (and the Install button where the browser offers one). */
export function InstallGuide() {
  const { t } = useI18n();
  // shown only after a press (never rendered on the server), so the device can be read straight away
  const [platform] = useState<Platform>(detect);
  const [installed] = useState(() => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const canInstall = useSyncExternalStore(subscribeInstall, () => !!deferred, () => false);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    waiters.forEach((w) => w());
  }

  const order: Platform[] = [platform, ...(["windows", "android", "ios", "mac"] as Platform[]).filter((p) => p !== platform)];
  return (
    <details className="rounded-lg border border-border bg-surface-alt">
      <summary className="cursor-pointer px-3 py-2 text-[13px] font-bold text-text">{t("Install the app on this device")}</summary>
      <div className="flex flex-col gap-3 border-t border-border px-3 py-3 text-[12.5px] text-text-secondary">
        {installed ? <p className="font-semibold text-success">{t("The app is installed on this device.")}</p> : null}
        {canInstall && (
          <button type="button" className={`${BTN_SM} self-start`} onClick={() => void install()}>
            {t("Install app")}
          </button>
        )}
        {order.map((p) => (
          <div key={p}>
            <div className="font-bold text-text">{t(STEPS[p].title)}</div>
            <ol className="ml-4 list-decimal">
              {STEPS[p].steps.map((s) => (
                <li key={s}>{t(s)}</li>
              ))}
            </ol>
          </div>
        ))}
        <p>{t("After the first sign-in with a connection, the pages you open are kept for you on this device and the app opens without a connection. Signing out removes them.")}</p>
      </div>
    </details>
  );
}
