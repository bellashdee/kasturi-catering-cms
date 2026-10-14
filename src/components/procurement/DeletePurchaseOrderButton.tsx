"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePurchaseOrder } from "@/lib/procurement/actions";

/** Deletes an order placed by mistake, after a confirmation that names the order. Safety rules are enforced on the server. */
export function DeletePurchaseOrderButton({ poId, poNumber, listHref }: { poId: string; poNumber: string; listHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete purchase order ${poNumber}?\n\nUse this only for an order placed by mistake. This cannot be undone (the deletion is recorded in the audit log).`)) return;
    setBusy(true);
    setError(null);
    const result = await deletePurchaseOrder(poId);
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? "Could not delete the purchase order.");
      return;
    }
    router.push(listHref);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={remove} disabled={busy} className="h-9 rounded-lg border border-danger/40 bg-surface px-3.5 text-[13px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-60">
        {busy ? "Deleting..." : "Delete order"}
      </button>
      {error && <div className="max-w-sm text-right text-xs text-danger">{error}</div>}
    </div>
  );
}
