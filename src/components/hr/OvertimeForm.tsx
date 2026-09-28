"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOvertime } from "@/lib/hr/actions";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function OvertimeForm({ employeeId, companyId }: { employeeId: string; companyId: string }) {
  const router = useRouter();
  const [workDate, setWorkDate] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createOvertime({ employeeId, companyId, workDate, hours: Number(hours), reason });
      router.push(`/hr/${employeeId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Hours *</label>
          <input type="number" step="0.5" min="0" required value={hours} onChange={(e) => setHours(e.target.value)} className={inputClass} placeholder="e.g. 2.5" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Reason</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Log Overtime"}
        </button>
      </div>
    </form>
  );
}
