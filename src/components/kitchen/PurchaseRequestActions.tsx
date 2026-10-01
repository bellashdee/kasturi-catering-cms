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
        {status === "draft" && (
          <button disabled={pending} onClick={() => run("pending_approval")} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text disabled:opacity-50">
            Submit for Approval
          </button>
        )}
        {status === "pending_approval" && (
          <>
            <button disabled={pending} onClick={() => run("approved")} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              Approve
            </button>
            <button disabled={pending} onClick={() => run("rejected")} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50">
              Reject
            </button>
          </>
        )}
        {status === "approved" && (
          <button disabled={pending} onClick={() => run("ordered")} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text disabled:opacity-50">
            Mark Ordered
          </button>
        )}
        {status === "ordered" && (
          <button disabled={pending} onClick={() => run("completed")} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
            Mark Completed (adds stock)
          </button>
        )}
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
