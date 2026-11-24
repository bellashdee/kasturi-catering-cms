"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLeaveBalance } from "@/lib/hr/leaveBalanceActions";

type Adj = { year: number; al_entitled: number | string | null; al_taken_before: number | string | null; mc_entitled: number | string | null; mc_taken_before: number | string | null; notes?: string | null };
const str = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));
const field = "h-9 w-full rounded-lg border border-border-strong bg-white px-2.5 text-[13.5px] outline-none focus:border-primary";

/** HR: key in the AL / MC already taken before the system was used, and the company's own entitlement, for one year. */
export function LeaveBalanceEditor({ employeeId, thisYear, adjustments, actDefaults }: { employeeId: string; thisYear: number; adjustments: Adj[]; actDefaults: Record<number, { al: number; mc: number }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(thisYear);
  const load = (y: number) => {
    const a = adjustments.find((x) => Number(x.year) === y);
    return { alEntitled: str(a?.al_entitled), alTakenBefore: str(a?.al_taken_before) === "0" ? "" : str(a?.al_taken_before), mcEntitled: str(a?.mc_entitled), mcTakenBefore: str(a?.mc_taken_before) === "0" ? "" : str(a?.mc_taken_before), notes: a?.notes ?? "" };
  };
  const [form, setForm] = useState(() => load(thisYear));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const act = actDefaults[year];

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[12.5px] font-semibold text-primary hover:underline print:hidden">
        Edit balance
      </button>
    );
  }

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveLeaveBalance({ employeeId, year, ...form });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-primary/40 bg-surface p-3 print:hidden">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-bold text-text">
        Edit leave balance for
        <select
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            setYear(y);
            setForm(load(y));
          }}
          className="h-8 rounded-md border border-border-strong px-2 text-[13px]"
        >
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          AL taken before the system
          <input inputMode="decimal" placeholder="0" value={form.alTakenBefore} onChange={(e) => setForm({ ...form, alTakenBefore: e.target.value })} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          AL entitled (blank = {act ? `${act.al} by the Act` : "Act"})
          <input inputMode="decimal" placeholder={act ? String(act.al) : ""} value={form.alEntitled} onChange={(e) => setForm({ ...form, alEntitled: e.target.value })} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          MC taken before the system
          <input inputMode="decimal" placeholder="0" value={form.mcTakenBefore} onChange={(e) => setForm({ ...form, mcTakenBefore: e.target.value })} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          MC entitled (blank = {act ? `${act.mc} by the Act` : "Act"})
          <input inputMode="decimal" placeholder={act ? String(act.mc) : ""} value={form.mcEntitled} onChange={(e) => setForm({ ...form, mcEntitled: e.target.value })} className={field} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary sm:col-span-4">
          Note (optional)
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. From the old leave book, Jan–Oct 2026" className={field} />
        </label>
      </div>
      {error && <div className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{error}</div>}
      <div className="mt-2.5 flex gap-2">
        <button type="button" disabled={pending} onClick={save} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text">Cancel</button>
      </div>
    </div>
  );
}
