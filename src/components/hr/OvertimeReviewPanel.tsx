"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideOvertime } from "@/lib/hr/overtimeActions";
import { errorMessage } from "@/lib/actionResult";

/** Manager decision: approve (optionally fewer hours than requested) or reject, with remarks. */
export function OvertimeReviewPanel({ overtimeId, requestedHours }: { overtimeId: string; requestedHours: number }) {
  const router = useRouter();
  const [approvedHours, setApprovedHours] = useState(String(requestedHours));
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    setError(null);
    try {
      const result = await decideOvertime(overtimeId, decision, { approvedHours: Number(approvedHours), remarks });
      if (!result.ok) setError(result.error);
      else router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the decision."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-[10rem_1fr] gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Approved OT hours</label>
          <input
            type="number"
            min="0.25"
            max={requestedHours}
            step="0.25"
            value={approvedHours}
            onChange={(e) => setApprovedHours(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]"
          />
          <p className="mt-0.5 text-[11px] text-text-muted">Requested: {requestedHours} hrs</p>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Remarks (required to reject)</label>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void decide("rejected")} className="rounded-lg border border-danger/40 px-4 py-2 text-[13px] font-bold text-danger disabled:opacity-50">
          {busy === "rejected" ? "Rejecting..." : "Reject"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void decide("approved")} className="rounded-lg bg-success px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
          {busy === "approved" ? "Approving..." : "Approve"}
        </button>
      </div>
    </div>
  );
}
