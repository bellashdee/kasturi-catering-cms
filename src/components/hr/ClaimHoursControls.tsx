"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcOtHours } from "@/lib/hr/overtime";
import { decideClaimHours, deleteClaimHours, submitClaimHours } from "@/lib/hr/claimHoursActions";

const field = "h-10 w-full rounded-lg border border-border-strong bg-white px-3 text-[13.5px] outline-none focus:border-primary";

/** The staff member's form to claim the extra hours worked. */
export function ClaimHoursForm({ employeeId, today }: { employeeId: string; today: string }) {
  const router = useRouter();
  const [workDate, setWorkDate] = useState(today);
  const [startTime, setStart] = useState("");
  const [endTime, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const hours = startTime && endTime ? calcOtHours(startTime, endTime) : null;

  const submit = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await submitClaimHours({ employeeId, workDate, startTime, endTime, reason });
      if (res.ok) {
        setStart("");
        setEnd("");
        setReason("");
        setDone(true);
        router.refresh();
      } else setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Date worked
          <input type="date" max={today} value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          From
          <input type="time" value={startTime} onChange={(e) => setStart(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          To
          <input type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} className={field} />
        </label>
        <div className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Hours
          <div className="flex h-10 items-center rounded-lg bg-surface-alt px-3 text-[15px] font-extrabold text-text">{hours ?? "—"}</div>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
        What was the extra work for?
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wedding event at JDT 4, set-up until late night" className={field} />
      </label>
      {error && <div className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {done && <div className="rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success">Submitted. It counts once your manager approves it.</div>}
      <div>
        <button type="button" disabled={pending} onClick={submit} className="h-10 rounded-lg bg-primary px-5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {pending ? "Submitting…" : "Submit Claim Hours"}
        </button>
      </div>
    </div>
  );
}

export function DeleteClaimButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!confirm) return <button type="button" onClick={() => setConfirm(true)} className="text-[12.5px] font-semibold text-text-secondary hover:text-danger">Delete</button>;
  return (
    <span className="flex items-center gap-2 text-[12.5px]">
      <button type="button" disabled={pending} onClick={() => startTransition(async () => { const r = await deleteClaimHours(id); if (r.ok) router.refresh(); else alert(r.error); })} className="font-semibold text-danger">Yes, delete</button>
      <button type="button" onClick={() => setConfirm(false)} className="font-semibold text-text-secondary">No</button>
    </span>
  );
}

/** Approve (all or fewer hours) or reject a claim — for the OT approvers. */
export function ClaimDecision({ id, hours }: { id: string; hours: number }) {
  const router = useRouter();
  const [approvedHours, setApprovedHours] = useState(String(hours));
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (approve: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await decideClaimHours({ id, approve, approvedHours: approve ? Number(approvedHours) : null, remarks });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input value={approvedHours} onChange={(e) => setApprovedHours(e.target.value)} inputMode="decimal" aria-label="Approved hours" className="h-8 w-16 rounded-md border border-border-strong px-2 text-right text-[13px]" />
        <span className="text-[12px] text-text-secondary">hrs</span>
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (needed to reject)" className="h-8 w-48 rounded-md border border-border-strong px-2 text-[13px]" />
        <button type="button" disabled={pending} onClick={() => decide(true)} className="h-8 rounded-md bg-success px-3 text-[12.5px] font-semibold text-white disabled:opacity-60">Approve</button>
        <button type="button" disabled={pending} onClick={() => decide(false)} className="h-8 rounded-md border border-danger px-3 text-[12.5px] font-semibold text-danger disabled:opacity-60">Reject</button>
      </div>
      {error && <div className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}
