"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, type ActionResult } from "@/lib/actionResult";

const BTN = "rounded-md border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50";

/**
 * Edit and Delete buttons for one record. Delete asks first; the record is gone from the database straight away, but the row stays on the page
 * with "Undo" until the person closes the bar or leaves the page, so a mistake can be put back. `onDelete` returns the deleted record and `onRestore`
 * puts that record back.
 */
export function RecordActions<Row>({
  onEdit,
  onDelete,
  onRestore,
  confirmText,
  canEdit = true,
  canDelete = true,
  extra,
  afterClose,
}: {
  onEdit?: () => void;
  onDelete?: () => Promise<ActionResult<{ row: Row }>>;
  onRestore?: (row: Row) => Promise<ActionResult>;
  confirmText: string;
  canEdit?: boolean;
  canDelete?: boolean;
  extra?: React.ReactNode;
  /** where to go when the bar is closed (a detail page of a deleted record has nothing left to show); the page is refreshed by default */
  afterClose?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Row | null>(null);

  async function remove() {
    if (!onDelete || !window.confirm(`${confirmText}\n\nYou can undo it straight after.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onDelete();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDeleted(r.row);
    } catch (err) {
      setError(errorMessage(err, "Could not delete."));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!deleted || !onRestore) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onRestore(deleted);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDeleted(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not put it back."));
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning-bg px-3 py-1.5 text-[12.5px] text-text">
        <span className="font-semibold">Deleted</span>
        <button type="button" disabled={busy} onClick={undo} className="font-bold text-primary hover:underline disabled:opacity-50">
          Undo
        </button>
        <button type="button" onClick={() => (afterClose ? afterClose() : router.refresh())} className="font-semibold text-text-muted hover:text-text">
          Close
        </button>
        {error && <span className="text-danger">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {extra}
        {canEdit && onEdit && (
          <button type="button" disabled={busy} onClick={onEdit} className={`${BTN} border-border-strong bg-surface text-text hover:border-primary hover:text-primary`}>
            Edit
          </button>
        )}
        {canDelete && onDelete && (
          <button type="button" disabled={busy} onClick={remove} className={`${BTN} border-danger/40 bg-surface text-danger hover:bg-danger-bg`}>
            {busy ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
      {error && <span role="alert" className="max-w-xs text-right text-[11.5px] text-danger">{error}</span>}
    </div>
  );
}
