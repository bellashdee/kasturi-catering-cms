"use client";

import { useSyncExternalStore } from "react";
import { MALAYSIA_TIMEZONE, formatMalaysiaClock, formatMalaysiaLongDate, formatMalaysiaShortDate } from "@/lib/format";

/**
 * One shared ticker for every clock on the page: it ticks right on each second boundary, and stops when the last clock
 * unmounts, so no timer is left running.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  timer = setTimeout(() => {
    listeners.forEach((l) => l());
    schedule();
  }, 1000 - (Date.now() % 1000));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) schedule();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** The current second (ms, rounded down); null while rendering on the server, so the clock never shows a wrong server time. */
const getSnapshot = () => Math.floor(Date.now() / 1000) * 1000;
const getServerSnapshot = () => null;

export function useMalaysiaNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The live Malaysia date + time. `header` is the compact pair used in the top bar; `date` shows only the long date. */
export function LiveClock({ variant = "header" }: { variant?: "header" | "date" }) {
  const now = useMalaysiaNow();

  if (variant === "date") {
    return (
      <time dateTime={now ? new Date(now).toISOString() : undefined} suppressHydrationWarning>
        {now ? formatMalaysiaLongDate(now) : "\u00a0"}
      </time>
    );
  }

  return (
    <time
      dateTime={now ? new Date(now).toISOString() : undefined}
      title={MALAYSIA_TIMEZONE}
      className="flex flex-col items-end leading-tight tabular-nums"
      suppressHydrationWarning
    >
      <span className="text-[15px] font-bold text-text sm:text-[16px]">
        {now ? formatMalaysiaClock(now) : "\u00a0"}
        <span className="ml-1.5 text-[11px] font-semibold text-text-secondary">MYT</span>
      </span>
      <span className="text-[12.5px] font-medium text-text-secondary">
        <span className="hidden md:inline">{now ? formatMalaysiaLongDate(now) : "\u00a0"}</span>
        <span className="md:hidden">{now ? formatMalaysiaShortDate(now) : "\u00a0"}</span>
      </span>
    </time>
  );
}
