"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { errorMessage } from "@/lib/actionResult";
import { deletePettyCashEntry } from "@/lib/operationPettyCash/actions";

export const UNDO_KEY = "operation-petty-cash-undo";
export const UNDO_EVENT = "operation-petty-cash-deleted";

/** Edit and Delete of one entry. A deleted entry can be put back with Undo (the bar above the list). */
export function OperationPettyCashRowActions({ id, editHref }: { id: string; editHref: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(t("Delete this entry? You can undo it straight after."))) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deletePettyCashEntry(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        sessionStorage.setItem(UNDO_KEY, JSON.stringify(result.row));
        window.dispatchEvent(new Event(UNDO_EVENT));
      } catch {
        /* without storage the entry is deleted but cannot be undone from here */
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-3 text-[12.5px] font-semibold">
        <Link href={editHref} className="text-primary hover:underline">
          Edit
        </Link>
        <button type="button" disabled={busy} onClick={remove} className="text-danger hover:underline disabled:opacity-50">
          {busy ? "Deleting..." : "Delete"}
        </button>
      </div>
      {error && <span role="alert" className="text-[11.5px] text-danger">{error}</span>}
    </div>
  );
}
