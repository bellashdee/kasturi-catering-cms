"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
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

const BLANK = " ";

/**
 * The live Malaysia date + time, always in Malaysia time whatever the language: only the names of the days and months and the
 * AM/PM wording follow the chosen language (digits stay 0-9). `header` is the compact pair used in the top bar; `date` shows
 * only the long date.
 */
export function LiveClock({ variant = "header" }: { variant?: "header" | "date" }) {
  const now = useMalaysiaNow();
  const { locale } = useI18n();

  if (variant === "date") {
    return (
      <time dateTime={now ? new Date(now).toISOString() : undefined} translate="no" suppressHydrationWarning>
        {now ? formatMalaysiaLongDate(now, locale) : BLANK}
      </time>
    );
  }

  return (
    <time
      dateTime={now ? new Date(now).toISOString() : undefined}
      title={MALAYSIA_TIMEZONE}
      translate="no"
      className="flex flex-col items-end leading-tight tabular-nums"
      suppressHydrationWarning
    >
      <span className="whitespace-nowrap text-[15px] font-bold text-text sm:text-[16px]">
        {now ? formatMalaysiaClock(now, locale) : BLANK}
        <span className="ml-1.5 text-[11px] font-semibold text-text-secondary">MYT</span>
      </span>
      <span className="hidden whitespace-nowrap text-[12.5px] font-medium text-text-secondary lg:block">
        <span className="hidden md:inline">{now ? formatMalaysiaLongDate(now, locale) : BLANK}</span>
        <span className="md:hidden">{now ? formatMalaysiaShortDate(now, locale) : BLANK}</span>
      </span>
    </time>
  );
}
