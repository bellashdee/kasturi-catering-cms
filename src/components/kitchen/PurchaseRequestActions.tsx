"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePurchaseRequestStatus } from "@/lib/kitchen/actions";

export function PurchaseRequestActions({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(next: string) {
    setPending(true);
    setError(null);
    try {
      await updatePurchaseRequestStatus(requestId, next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {status === "pending" && (
          <>
            <button disabled={pending} onClick={() => run("ordered")} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text disabled:opacity-50">
              Mark Ordered
            </button>
            <button disabled={pending} onClick={() => run("cancelled")} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50">
              Cancel
            </button>
          </>
        )}
        {status === "ordered" && (
          <button disabled={pending} onClick={() => run("received")} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
            Mark Received
          </button>
        )}
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
