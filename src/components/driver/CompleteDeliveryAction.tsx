"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeDeliveryTask } from "@/lib/driver/actions";

export function CompleteDeliveryAction({ deliveryId, companyId, hasProof }: { deliveryId: string; companyId: string; hasProof: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-success px-4 py-2 text-[13px] font-bold text-white">
        ✅ Complete Task
      </button>
    );
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await completeDeliveryTask({
        deliveryId,
        companyId,
        completionRemarks: remarks || undefined,
        adminOverride: !hasProof ? override : false,
        overrideReason: !hasProof && override ? overrideReason : undefined,
      });
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-80 flex-col gap-2 rounded-lg border border-border bg-white p-4 shadow-lg">
      <div className="text-[13px] font-bold text-text">Complete Task</div>
      {error && <div className="rounded-md bg-danger-bg px-2 py-1.5 text-[11.5px] text-danger">{error}</div>}

      {!hasProof && (
        <div className="rounded-md bg-warning-bg px-2 py-1.5 text-[11.5px] text-warning">
          No proof of delivery has been uploaded yet. Upload proof below, or an authorized Admin/Management user can override this.
        </div>
      )}

      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Completion Remarks (optional)</label>
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]" />
      </div>

      {!hasProof && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border-strong p-2">
          <label className="flex items-center gap-2 text-[12px] font-semibold text-text">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            Admin Override (mark completed without proof)
          </label>
          {override && (
            <input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Reason for override *"
              className="h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]"
            />
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} disabled={saving} className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving || (!hasProof && !override)}
          className="rounded-md bg-success px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Confirm Completed"}
        </button>
      </div>
    </div>
  );
}
