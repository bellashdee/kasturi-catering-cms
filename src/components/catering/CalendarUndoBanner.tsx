"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { restoreEventStatus } from "@/lib/catering/calendarActions";

export const CALENDAR_UNDO_KEY = "calendar-undo-cancel";
export const CALENDAR_UNDO_EVENT = "calendar-undo-changed";

export type CancelledEvent = { eventId: string; eventName: string; previousStatus: string };

/** Remembers a cancelled event so the banner can offer Undo even after the entry has left the calendar (cancelled events are hidden). */
export function rememberCancelledEvent(value: CancelledEvent) {
  try {
    sessionStorage.setItem(CALENDAR_UNDO_KEY, JSON.stringify(value));
  } catch {
    /* the banner just does not appear */
  }
  window.dispatchEvent(new Event(CALENDAR_UNDO_EVENT));
}

/** Shown after an event was cancelled from the calendar: Undo puts it back to the status it had. */
export function CalendarUndoBanner() {
  const router = useRouter();
  const [item, setItem] = useState<CancelledEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem(CALENDAR_UNDO_KEY);
        setItem(raw ? (JSON.parse(raw) as CancelledEvent) : null);
      } catch {
        setItem(null);
      }
    };
    const timer = setTimeout(read, 0);
    window.addEventListener(CALENDAR_UNDO_EVENT, read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(CALENDAR_UNDO_EVENT, read);
    };
  }, []);

  if (!item) return null;

  const dismiss = () => {
    try {
      sessionStorage.removeItem(CALENDAR_UNDO_KEY);
    } catch {
      /* nothing stored */
    }
    setItem(null);
    setError(null);
  };

  async function undo() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const result = await restoreEventStatus(item.eventId, item.previousStatus);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dismiss();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not undo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-bg px-4 py-2.5 text-[13px]">
      <span className="font-semibold text-text">{`Event cancelled: ${item.eventName}`}</span>
      <button type="button" disabled={busy} onClick={undo} className="rounded-lg bg-primary px-3 py-1 text-[12.5px] font-bold text-white disabled:opacity-60">
        {busy ? "Restoring..." : "Undo"}
      </button>
      <button type="button" onClick={dismiss} className="text-[12.5px] font-semibold text-text-secondary hover:underline">
        Dismiss
      </button>
      {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}
