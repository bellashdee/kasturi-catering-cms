"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelOvertime, submitOvertime } from "@/lib/hr/overtimeActions";

/** Staff-side actions: submit a draft, edit a draft, or cancel an OT that has not been decided yet. */
export function OvertimeRecordActions({ overtimeId, status }: { overtimeId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(name: string, action: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="flex gap-2">
        {status === "draft" && (
          <Link href={`/hr/overtime/${overtimeId}/edit`} className="rounded-lg border border-border-strong px-3.5 py-2 text-[13px] font-semibold text-text">
            Edit Draft
          </Link>
        )}
        {status === "draft" && (
          <button type="button" disabled={busy !== null} onClick={() => void run("submit", () => submitOvertime(overtimeId))} className="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
            {busy === "submit" ? "Submitting..." : "Submit"}
          </button>
        )}
        {["draft", "submitted", "pending_approval"].includes(status) && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => { if (window.confirm("Cancel this OT? It stays in the history as Cancelled.")) void run("cancel", () => cancelOvertime(overtimeId)); }}
            className="rounded-lg border border-danger/40 px-3.5 py-2 text-[13px] font-semibold text-danger disabled:opacity-60"
          >
            {busy === "cancel" ? "Cancelling..." : "Cancel OT"}
          </button>
        )}
      </div>
    </div>
  );
}
