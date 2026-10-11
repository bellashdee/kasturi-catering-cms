"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveCustomerIntake, rejectCustomerIntake } from "@/lib/catering/intakeActions";

export function IntakeReviewActions({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string } | void>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result && !result.ok) setError(result.error ?? "Something went wrong.");
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => run(() => approveCustomerIntake(submissionId))} className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
          Approve
        </button>
        <button disabled={busy} onClick={() => run(() => rejectCustomerIntake(submissionId))} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-danger disabled:opacity-60">
          Reject
        </button>
      </div>
      {error && <div className="max-w-xs text-right text-xs text-danger">{error}</div>}
    </div>
  );
}
