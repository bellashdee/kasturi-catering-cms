"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideLeave } from "@/lib/hr/actions";
import { errorMessage } from "@/lib/actionResult";

/** Approve / Reject of a leave request waiting for a decision, with an optional remark (shown to the staff member). */
export function LeaveRowActions({ leaveId, withRemarks = false }: { leaveId: string; withRemarks?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(decision: "approved" | "rejected") {
    setBusy(decision);
    setError(null);
    try {
      const result = await decideLeave(leaveId, decision, remarks);
      if (!result.ok) setError(result.error);
      else router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the decision."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {withRemarks && (
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remark (optional)" className="h-8 w-52 rounded-lg border border-border-strong px-2 text-[12.5px]" />
      )}
      <div className="flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void run("rejected")} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50">
          {busy === "rejected" ? "Rejecting..." : "Reject"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void run("approved")} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
          {busy === "approved" ? "Approving..." : "Approve"}
        </button>
      </div>
      {error && <div className="max-w-xs text-right text-[11.5px] text-danger">{error}</div>}
    </div>
  );
}
