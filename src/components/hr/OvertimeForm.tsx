"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/lib/documents/upload";
import { errorMessage } from "@/lib/actionResult";
import { previewOvertime, saveOvertime, type OvertimePreview } from "@/lib/hr/overtimeActions";
import { OT_MONTHLY_LIMIT, OT_WARNING_FROM, calcOtHours, formatHours } from "@/lib/hr/overtime";

export type OtStaffOption = {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  department: string | null;
  position: string | null;
};

type Initial = {
  employeeId: string;
  workDate: string;
  normalWorkingHours: string;
  otStartTime: string;
  otEndTime: string;
  reason: string;
  documentId: string | null;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const readonlyClass = "mt-1.5 flex h-10 w-full items-center rounded-lg border border-border bg-bg px-3 text-sm text-text-secondary";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function OvertimeForm({
  staff,
  defaultEmployeeId,
  overtimeId,
  initial,
  maxDate,
}: {
  staff: OtStaffOption[];
  defaultEmployeeId?: string;
  overtimeId?: string;
  initial?: Initial;
  /** Today in Malaysia time; OT cannot be dated after it. */
  maxDate: string;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? defaultEmployeeId ?? (staff.length === 1 ? staff[0].id : ""));
  const [workDate, setWorkDate] = useState(initial?.workDate ?? maxDate);
  const [normalHours, setNormalHours] = useState(initial?.normalWorkingHours ?? "8");
  const [start, setStart] = useState(initial?.otStartTime ?? "");
  const [end, setEnd] = useState(initial?.otEndTime ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<OvertimePreview | null>(null);

  const person = staff.find((s) => s.id === employeeId);
  const hours = calcOtHours(start, end);

  // Month-to-date total for this staff member, refreshed whenever the staff, date or hours change.
  useEffect(() => {
    if (!employeeId || !workDate) return;
    let cancelled = false;
    previewOvertime({ employeeId, workDate, hours: hours ?? 0, excludeId: overtimeId })
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [employeeId, workDate, hours, overtimeId]);

  async function handleSave(intent: "draft" | "submit") {
    if (!employeeId) {
      setError("Select your name from the list.");
      return;
    }
    if (!start || !end) {
      setError("Enter the OT start and end time.");
      return;
    }
    if (intent === "submit" && !reason.trim()) {
      setError("Enter the reason / description for this OT.");
      return;
    }
    if (intent === "submit" && !photo && !initial?.documentId) {
      setError("Attach the approval of your manager before you submit the OT.");
      return;
    }
    setBusy(intent);
    setError(null);
    try {
      let documentId = initial?.documentId ?? undefined;
      if (photo && person) {
        const doc = await uploadDocument({ companyId: person.companyId, module: "hr", fileType: photo.type === "application/pdf" ? "pdf" : "photo", file: photo });
        documentId = doc.id;
      }
      const result = await saveOvertime(
        { employeeId, workDate, normalWorkingHours: Number(normalHours), otStartTime: start, otEndTime: end, reason, documentId },
        intent,
        overtimeId,
      );
      if (!result.ok) {
        setError(result.error);
        setBusy(null);
        return;
      }
      router.push(`/hr/overtime/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
      setBusy(null);
    }
  }

  const limitReached = !!preview && preview.monthlyTotal >= OT_MONTHLY_LIMIT;
  const wouldExceed = !!preview && preview.needsApproval;
  const nearLimit = !!preview && !wouldExceed && preview.projectedTotal >= OT_WARNING_FROM;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void handleSave("submit"); }} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      {preview && (limitReached || wouldExceed) && (
        <div className="rounded-xl border-2 border-danger bg-danger-bg px-4 py-3">
          <div className="text-[15px] font-extrabold text-danger">
            {limitReached ? `🔴 OT LIMIT REACHED – ${OT_MONTHLY_LIMIT} HOURS` : `🔴 THIS OT WOULD EXCEED ${OT_MONTHLY_LIMIT} HOURS`}
          </div>
          <p className="mt-1 text-[13px] text-danger">
            {limitReached
              ? `This staff member has reached ${OT_MONTHLY_LIMIT} OT hours. Further OT requires OT Request and Manager Approval.`
              : `This would bring the month to ${formatHours(preview.projectedTotal)}. It will be sent as an OT Request for Manager Approval.`}
          </p>
        </div>
      )}
      {nearLimit && preview && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-2.5 text-[13px] font-semibold text-warning">
          🟡 Approaching the {OT_MONTHLY_LIMIT}-hour monthly limit ({formatHours(preview.projectedTotal)} after this OT).
        </div>
      )}

      <div>
        <label className={labelClass}>Select Staff Name *</label>
        <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!!overtimeId} className={inputClass}>
          <option value="">Select Staff Name</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{staff.some((o) => o.id !== s.id && o.name === s.name) ? ` (${s.companyName})` : ""}</option>)}
        </select>
        {staff.length === 0 && (
          <p className="mt-1.5 text-[12px] text-text-muted">Your login is not linked to a staff record. Ask HR or an admin to link your account to your name.</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Company</label>
          <div className={readonlyClass}>{person?.companyName ?? "—"}</div>
        </div>
        <div>
          <label className={labelClass}>Department</label>
          <div className={readonlyClass}>{person?.department || "—"}</div>
        </div>
        <div>
          <label className={labelClass}>Position</label>
          <div className={readonlyClass}>{person?.position || "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>OT Date *</label>
          <input type="date" required max={maxDate} value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Normal Working Hours</label>
          <input type="number" min="0" max="24" step="0.5" value={normalHours} onChange={(e) => setNormalHours(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>OT Start Time *</label>
          <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>OT End Time *</label>
          <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Total OT Hours (automatic)</label>
          <div className={`${readonlyClass} font-bold text-text`} aria-readonly="true">{hours === null ? "—" : formatHours(hours)}</div>
        </div>
      </div>

      {preview && employeeId && (
        <div className="rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px] text-text-secondary">
          Monthly OT so far: <span className="font-bold text-text">{formatHours(preview.monthlyTotal)}</span>
          {hours !== null && <> · after this OT: <span className="font-bold text-text">{formatHours(preview.projectedTotal)}</span></>}
          {" "}of {OT_MONTHLY_LIMIT} hrs
        </div>
      )}

      <div>
        <label className={labelClass}>Reason / Description *</label>
        <textarea required value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="e.g. Event preparation" />
      </div>

      <div>
        <label className={labelClass}>Manager&apos;s approval — attach *</label>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-[13px]" />
        <p className="mt-1 text-[11.5px] text-text-muted">Your manager must approve the OT first. Attach the approval (a screenshot of the message, a signed form or an email). It is required to submit; a draft can be saved without it.</p>
        {initial?.documentId && !photo && <p className="mt-1 text-[11.5px] text-text-muted">An approval is already attached. Choose a file only to replace it.</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Submission Date / Time</label>
          <div className={readonlyClass}>Generated automatically when you submit</div>
        </div>
        <div>
          <label className={labelClass}>OT Status</label>
          <div className={readonlyClass}>{overtimeId ? "Draft" : "Draft until submitted"}</div>
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void handleSave("draft")} className="rounded-lg border border-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary disabled:opacity-60">
          {busy === "draft" ? "Saving..." : "Save Draft"}
        </button>
        <button type="submit" disabled={busy !== null} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {busy === "submit" ? "Submitting..." : wouldExceed ? "Submit OT Request" : "Submit OT"}
        </button>
      </div>
    </form>
  );
}
