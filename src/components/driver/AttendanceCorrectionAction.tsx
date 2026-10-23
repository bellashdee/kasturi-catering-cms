"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctAttendance } from "@/lib/driverAttendance/actions";
import { fromMalaysiaInputValue, toMalaysiaInputValue } from "@/lib/format";

export function AttendanceCorrectionAction({
  attendanceId,
  companyId,
  clockInTime,
  clockOutTime,
}: {
  attendanceId: string;
  companyId: string;
  clockInTime: string | null;
  clockOutTime: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clockIn, setClockIn] = useState(toMalaysiaInputValue(clockInTime));
  const [clockOut, setClockOut] = useState(toMalaysiaInputValue(clockOutTime));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-semibold text-text-secondary hover:text-primary hover:underline">
        Correct
      </button>
    );
  }

  async function save() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await correctAttendance({
        attendanceId,
        companyId,
        clockInTime: clockIn ? fromMalaysiaInputValue(clockIn) : null,
        clockOutTime: clockOut ? fromMalaysiaInputValue(clockOut) : null,
        reason,
      });
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save correction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-64 flex-col gap-2 rounded-lg border border-border bg-white p-3 text-left shadow-lg">
      <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Correct Attendance</div>
      {error && <div className="text-[11px] text-danger">{error}</div>}
      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Clock In</label>
        <input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]" />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Clock Out</label>
        <input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]" />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Reason *</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]" placeholder="Why is this being corrected?" />
      </div>
      <p className="text-[10.5px] text-text-muted">The original clock-in/out times stay in the audit trail.</p>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} disabled={saving} className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-text-secondary">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="rounded-md bg-primary px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save Correction"}
        </button>
      </div>
    </div>
  );
}
