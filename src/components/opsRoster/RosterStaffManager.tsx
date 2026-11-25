"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRosterStaff, updateRosterStaff } from "@/lib/opsRoster/actions";
import type { RosterStaff } from "@/lib/opsRoster/shared";

type HrOption = { id: string; name: string; detail: string };

const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";

/**
 * The roster staff list (Staff tab): every name is a staff member from HR (no second record). Add from HR, rename the short name
 * shown on the roster, move, remove (kept on past rosters) or bring back.
 */
export function RosterStaffManager({ staff, hrStaff }: { staff: RosterStaff[]; hrStaff: HrOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState({ employeeId: "", shortName: "" });
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Could not save.");
      else {
        setRenaming(null);
        router.refresh();
      }
    });
  const onRoster = new Set(staff.filter((s) => s.active).map((s) => s.fullName.toUpperCase()));
  const choices = hrStaff.filter((h) => !onRoster.has(h.name.toUpperCase()));

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {staff.map((s, i) => (
          <div key={s.id} className={`flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 ${s.active ? "" : "opacity-60"}`}>
            <div className="min-w-[8rem]">
              {renaming?.id === s.id ? (
                <div className="flex gap-1.5">
                  <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: s.id, name: e.target.value })} className="h-9 w-32 rounded-lg border border-border-strong px-2 text-[13.5px] font-bold uppercase" />
                  <button type="button" disabled={pending} onClick={() => run(() => updateRosterStaff(s.id, { shortName: renaming.name }))} className="h-9 rounded-lg bg-primary px-3 text-[12.5px] font-bold text-white">Save</button>
                  <button type="button" onClick={() => setRenaming(null)} className={btn}>Cancel</button>
                </div>
              ) : (
                <div className="text-[15px] font-extrabold text-text">{s.shortName}</div>
              )}
              <div className="text-[12px] text-text-muted">{s.fullName}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"}`}>{s.active ? "On the roster" : "Removed"}</span>
            {!s.userLinked && <span className="text-[11.5px] text-text-muted">No login: cannot be notified</span>}
            <div className="ml-auto flex flex-wrap gap-1.5">
              <button type="button" disabled={pending || i === 0} onClick={() => run(() => updateRosterStaff(s.id, { move: -1 }))} className={btn} aria-label="Move up">↑</button>
              <button type="button" disabled={pending || i === staff.length - 1} onClick={() => run(() => updateRosterStaff(s.id, { move: 1 }))} className={btn} aria-label="Move down">↓</button>
              <button type="button" onClick={() => setRenaming({ id: s.id, name: s.shortName })} className={btn}>Rename</button>
              {s.active ? (
                <button type="button" disabled={pending} onClick={() => window.confirm(`Remove ${s.shortName} from the roster? Past rosters keep their lines.`) && run(() => updateRosterStaff(s.id, { active: false }))} className={`${btn} text-danger`}>Remove</button>
              ) : (
                <button type="button" disabled={pending} onClick={() => run(() => updateRosterStaff(s.id, { active: true }))} className={btn}>Bring back</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Add a staff member from HR
          <select value={adding.employeeId} onChange={(e) => setAdding({ ...adding, employeeId: e.target.value })} className="h-9 w-72 rounded-lg border border-border-strong bg-surface px-2 text-[13px] text-text">
            <option value="">Choose…</option>
            {choices.map((h) => <option key={h.id} value={h.id}>{h.name}{h.detail ? ` — ${h.detail}` : ""}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Name on the roster
          <input value={adding.shortName} onChange={(e) => setAdding({ ...adding, shortName: e.target.value })} placeholder="e.g. FADIL" className="h-9 w-36 rounded-lg border border-border-strong px-3 text-[13px] uppercase text-text" />
        </label>
        <button
          type="button"
          disabled={pending || !adding.employeeId}
          onClick={() => run(async () => {
            const res = await addRosterStaff(adding.employeeId, adding.shortName);
            if (res.ok) setAdding({ employeeId: "", shortName: "" });
            return res;
          })}
          className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          + Add to roster
        </button>
      </div>
    </div>
  );
}
