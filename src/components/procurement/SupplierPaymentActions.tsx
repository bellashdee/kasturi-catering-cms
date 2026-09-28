"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideSupplierPayment } from "@/lib/procurement/actions";

export function SupplierPaymentActions({ paymentId, status }: { paymentId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setPending(true);
    setError(null);
    try {
      await decideSupplierPayment(paymentId, decision);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setPending(false);
    }
  }

  if (status !== "pending") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button disabled={pending} onClick={() => decide("approved")} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
          Approve
        </button>
        <button disabled={pending} onClick={() => decide("rejected")} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50">
          Reject
        </button>
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
