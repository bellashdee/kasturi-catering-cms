"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { formatPrice } from "@/lib/format";
import { restorePettyCashEntry } from "@/lib/operationPettyCash/actions";
import type { OperationPettyCashRow } from "@/lib/operationPettyCash/constants";
import { UNDO_EVENT, UNDO_KEY } from "./OperationPettyCashRowActions";

/** Shown after an entry was deleted: Undo puts the same entry back. */
export function UndoBanner() {
  const router = useRouter();
  const [row, setRow] = useState<OperationPettyCashRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem(UNDO_KEY);
        setRow(raw ? (JSON.parse(raw) as OperationPettyCashRow) : null);
      } catch {
        setRow(null);
      }
    };
    const timer = setTimeout(read, 0);
    // a delete in the list tells this bar (the page is refreshed without reloading it)
    window.addEventListener(UNDO_EVENT, read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(UNDO_EVENT, read);
    };
  }, []);

  if (!row) return null;

  const dismiss = () => {
    try {
      sessionStorage.removeItem(UNDO_KEY);
    } catch {
      /* nothing stored */
    }
    setRow(null);
  };

  async function undo() {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      const result = await restorePettyCashEntry(row);
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
      <span className="font-semibold text-text">
        {`Entry deleted: ${row.entry_type === "top_up" ? "received" : "spent"} ${formatPrice(row.amount)}${row.description ? ` · ${row.description}` : ""}`}
      </span>
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
