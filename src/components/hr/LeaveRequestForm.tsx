"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { requestLeave } from "@/lib/hr/actions";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

export function LeaveRequestForm({ employeeId, companyId }: { employeeId: string; companyId: string }) {
  const router = useRouter();
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (days <= 0) {
      setError("End date must be on or after the start date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let documentId: string | undefined;
      if (file) {
        const doc = await uploadDocument({ companyId, module: "hr", fileType: fileTypeFromMime(file), file });
        documentId = doc.id;
      }
      const res = await requestLeave({ employeeId, companyId, leaveType, startDate, endDate, days, reason, documentId });
      if (!res.ok) {
        setError(res.error);
        setSaving(false);
        return;
      }
      router.push(`/hr/${employeeId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div>
        <label className={labelClass}>Leave Type *</label>
        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={inputClass}>
          <option value="annual">Annual Leave</option>
          <option value="medical">Medical Leave</option>
          <option value="emergency">Emergency Leave</option>
          <option value="unpaid">Unpaid Leave</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Start Date *</label>
          <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>End Date *</label>
          <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      {days > 0 && <div className="text-[12.5px] text-text-secondary">{days} day(s) of leave</div>}

      <div>
        <label className={labelClass}>Reason</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
      </div>

      <div>
        <label className={labelClass}>{leaveType === "medical" ? "Medical Certificate (MC) — upload" : "Supporting File (optional)"}</label>
        <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-[13px]" />
        <p className="mt-1 text-[11px] text-text-muted">PDF, Excel, CSV, screenshot or photo. Kept with this leave request.</p>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Submitting..." : "Submit for Approval"}
        </button>
      </div>
    </form>
  );
}
