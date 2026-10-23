"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { restoreRecords, type RecordUndo } from "@/lib/driver/recordActions";

const UNDO_KEY = "operation-record-undo";
const UNDO_EVENT = "operation-record-undo-changed";

/** Remembers what was just deleted so the banner (on any Operation Management list) can offer Undo. */
export function rememberDeleted(undo: RecordUndo) {
  try {
    sessionStorage.setItem(UNDO_KEY, JSON.stringify(undo));
  } catch {
    /* the banner just does not appear */
  }
  window.dispatchEvent(new Event(UNDO_EVENT));
}

/** Shown after a record was deleted: Undo puts the same record back. */
export function RecordUndoBanner() {
  const router = useRouter();
  const [undo, setUndo] = useState<RecordUndo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem(UNDO_KEY);
        setUndo(raw ? (JSON.parse(raw) as RecordUndo) : null);
      } catch {
        setUndo(null);
      }
    };
    const timer = setTimeout(read, 0);
    window.addEventListener(UNDO_EVENT, read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(UNDO_EVENT, read);
    };
  }, []);

  if (!undo) return null;

  const dismiss = () => {
    try {
      sessionStorage.removeItem(UNDO_KEY);
    } catch {
      /* nothing stored */
    }
    setUndo(null);
    setError(null);
  };

  async function restore() {
    if (!undo) return;
    setBusy(true);
    setError(null);
    try {
      const result = await restoreRecords(undo);
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
      <span className="font-semibold text-text">{`Deleted: ${undo.label}`}</span>
      <button type="button" disabled={busy} onClick={restore} className="rounded-lg bg-primary px-3 py-1 text-[12.5px] font-bold text-white disabled:opacity-60">
        {busy ? "Restoring..." : "Undo"}
      </button>
      <button type="button" onClick={dismiss} className="text-[12.5px] font-semibold text-text-secondary hover:underline">
        Dismiss
      </button>
      {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}
