"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteDraftRequest } from "@/lib/kitchenPurchase/actions";

const btn = "h-9 rounded-lg px-3.5 text-[13px] font-bold disabled:opacity-60";

/** Edit and Delete of one purchase request in the Kitchen list. Edit opens the request ready to change; Delete asks first. */
export function RequestRowActions({ id, status, editHref }: { id: string; status: string; editHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = status === "draft" || status === "pending_submission" || status === "revision_required";
  const canDelete = status === "draft" || status === "pending_submission" || status === "rejected";
  if (!canEdit && !canDelete) return null;

  async function remove() {
    if (!window.confirm("Delete this purchase request?")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await deleteDraftRequest(id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
      {canEdit && (
        <Link href={editHref} className={`${btn} flex items-center border border-border-strong bg-white text-text hover:border-primary hover:text-primary`}>
          Edit
        </Link>
      )}
      {canDelete && (
        <button type="button" disabled={busy} onClick={remove} className={`${btn} border border-danger text-danger hover:bg-danger-bg`}>
          {busy ? "Deleting..." : "Delete"}
        </button>
      )}
      {error && (
        <span role="alert" className="text-[12.5px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
