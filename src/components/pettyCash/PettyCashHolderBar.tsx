"use client";

import { useState } from "react";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { positionOptions, type PersonOption } from "@/lib/pettyCash/people";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px] font-semibold outline-none focus:border-primary";
const labelClass = "text-[11.5px] font-bold uppercase tracking-wide text-text-muted";

/**
 * Whose petty cash is shown: the name and the position are chosen here (the signed-in person's own at first). The overview, the records
 * and the form are only about that person's petty cash; nothing of anyone else's is mixed in.
 */
export function PettyCashHolderBar({
  holders,
  holder,
  position,
  month,
  months,
  hidden,
  children,
}: {
  holders: PersonOption[];
  holder: string;
  position: string;
  month: string;
  months: string[];
  /** other parts of the address to keep (company, status) */
  hidden: Record<string, string>;
  children?: React.ReactNode;
}) {
  const [name, setName] = useState(holder);
  const [pos, setPos] = useState(position);
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface px-5 py-3.5">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="min-w-[14rem] flex-1">
        <label className={labelClass} htmlFor="pc-holder">Petty cash of (name)</label>
        <SearchSelect
          id="pc-holder"
          name="holder"
          required
          value={name}
          onChange={setName}
          options={holders.map((h) => h.name)}
          onPick={(picked) => {
            // the position of the person is filled in
            const found = holders.find((h) => h.name === picked);
            if (found?.position) setPos(found.position);
          }}
          className={inputClass}
          placeholder="Search or choose your name"
        />
      </div>
      <div className="min-w-[12rem] flex-1">
        <label className={labelClass} htmlFor="pc-position">Position</label>
        <SearchSelect id="pc-position" name="position" required value={pos} onChange={setPos} options={positionOptions(holders)} className={inputClass} placeholder="Search or choose the position" />
      </div>
      <div>
        <label className={labelClass} htmlFor="pc-month">Month</label>
        <select id="pc-month" name="month" defaultValue={month} className="mt-1 h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13.5px] font-semibold">
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value="all">All</option>
        </select>
      </div>
      <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Show my petty cash</button>
      {children && <div className="ml-auto text-[13px] text-text-secondary">{children}</div>}
    </form>
  );
}
