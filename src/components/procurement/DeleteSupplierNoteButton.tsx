"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSupplierNote } from "@/lib/procurement/noteActions";

export function DeleteSupplierNoteButton({ noteId, label, listHref }: { noteId: string; label: string; listHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteSupplierNote(noteId);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(listHref);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={remove} disabled={busy} className="h-9 rounded-lg border border-danger/40 bg-surface px-3.5 text-[13px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-50 print:hidden">
        {busy ? "Deleting..." : "Delete"}
      </button>
      {error && <span className="self-center text-[12.5px] text-danger">{error}</span>}
    </>
  );
}
