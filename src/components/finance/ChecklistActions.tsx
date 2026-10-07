"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPaymentProgress } from "@/lib/finance/paymentActions";

/** Checklist row controls: Not Started -> In Progress, then Mark as Paid (which needs the payment date and reference). */
export function ChecklistActions({ paymentId, status }: { paymentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(next: "pending" | "in_progress") {
    setBusy(true);
    setError(null);
    try {
      await setPaymentProgress(paymentId, next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "paid") {
    return <Link href={`/finance/payments/${paymentId}`} className="text-[12px] font-semibold text-text-secondary">View</Link>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {status === "pending" ? (
          <button type="button" disabled={busy} onClick={() => void move("in_progress")} className="rounded-md border border-border-strong px-2 py-1 text-[11.5px] font-semibold text-text disabled:opacity-60">
            Start
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void move("pending")} className="rounded-md border border-border-strong px-2 py-1 text-[11.5px] font-semibold text-text-secondary disabled:opacity-60">
            Back
          </button>
        )}
        <Link href={`/finance/payments/${paymentId}`} className="rounded-md bg-success px-2 py-1 text-[11.5px] font-bold text-white">
          Mark Paid
        </Link>
      </div>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
