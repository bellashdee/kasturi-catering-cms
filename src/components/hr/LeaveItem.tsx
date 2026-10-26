"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { deleteLeave, restoreLeave, updateLeave, type LeaveSnapshot } from "@/lib/hr/actions";
import { leaveTypeText, LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL } from "@/lib/hr/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { RecordActions } from "@/components/shared/RecordActions";
import { LeaveRowActions } from "@/components/hr/LeaveRowActions";
import { Select } from "@/components/ui/Select";

export type LeaveItemData = {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  companyName?: string | null;
  leaveType: string;
  leaveTypeOther: string | null;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  documentId: string | null;
};

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/** One leave request in a list: its details, Approve / Reject for an admin while it is pending, and Edit (Save / Cancel) and Delete (Undo) for the person and the admins. */
export function LeaveItem({ leave, canDecide, canChange, compact = false }: { leave: LeaveItemData; canDecide: boolean; canChange: boolean; compact?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(leave.leaveType);
  const [other, setOther] = useState(leave.leaveTypeOther ?? "");
  const [start, setStart] = useState(leave.startDate);
  const [end, setEnd] = useState(leave.endDate);
  const [reason, setReason] = useState(leave.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updateLeave(leave.id, { leaveType: type, leaveTypeOther: other, startDate: start, endDate: end, days: 0, reason });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-3 bg-surface-alt/40 px-5 py-4">
        <div className="text-[13.5px] font-bold text-text">Edit leave request</div>
        {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Leave Type *</label>
            <Select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              {Object.entries(LEAVE_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          {type === "other" && (
            <div className="sm:col-span-2">
              <label className={labelClass}>Other: Nyatakan (state the leave) *</label>
              <input required maxLength={120} value={other} onChange={(e) => setOther(e.target.value)} className={inputClass} />
            </div>
          )}
          <div>
            <label className={labelClass}>Start Date *</label>
            <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>End Date *</label>
            <input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-lg border border-border-strong px-2 py-1.5 text-[13px] outline-none focus:border-primary" />
          </div>
        </div>
        <div className="flex justify-end gap-2.5">
          <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    );
  }

  const title = leaveTypeText(leave.leaveType, leave.leaveTypeOther);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        {compact ? (
          <div className="text-[13px] font-semibold text-text">{title}</div>
        ) : (
          <div className="text-[13.5px] font-semibold text-text">
            <Link href={`/hr/${leave.employeeId}`} className="hover:text-primary">{leave.employeeName}</Link>
            <span className="ml-2 font-normal text-text-secondary">{title}</span>
          </div>
        )}
        <div className="mt-0.5 text-xs text-text-muted">
          {leave.startDate} → {leave.endDate} · {leave.days} day(s){leave.companyName ? ` · ${leave.companyName}` : ""}
        </div>
        {leave.reason && <div className="mt-0.5 text-xs text-text-secondary">{leave.reason}</div>}
        {leave.documentId && <DocumentViewLink documentId={leave.documentId} label="📎 MC / file" className="mt-0.5 text-xs" />}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <StatusBadge tone={leave.status === "approved" ? "success" : leave.status === "rejected" ? "danger" : "warning"}>{LEAVE_STATUS_LABEL[leave.status] ?? leave.status}</StatusBadge>
        {leave.status === "pending" && canDecide && <LeaveRowActions leaveId={leave.id} />}
        {canChange && (
          <RecordActions<LeaveSnapshot>
            onEdit={() => { setError(null); setEditing(true); }}
            onDelete={() => deleteLeave(leave.id)}
            onRestore={(row) => restoreLeave(row)}
            confirmText={`Delete this leave request (${title}, ${leave.startDate} → ${leave.endDate})?`}
          />
        )}
      </div>
    </div>
  );
}
