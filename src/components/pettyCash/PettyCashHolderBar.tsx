"use client";

import { useState } from "react";
import { SearchSelect } from "@/components/ui/SearchSelect";
import type { PersonOption } from "@/lib/pettyCash/people";
import { Select } from "@/components/ui/Select";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px] font-semibold outline-none focus:border-primary";
const labelClass = "text-[11.5px] font-bold uppercase tracking-wide text-text-muted";

/**
 * Whose petty cash is shown: the name is chosen here (the signed-in person's own at first). The overview, the records
 * and the form are only about that person's petty cash; nothing of anyone else's is mixed in.
 */
export function PettyCashHolderBar({
  holders,
  holder,
  month,
  months,
  hidden,
  lockName = false,
  canSeeAll = false,
  everyone = false,
  children,
}: {
  holders: PersonOption[];
  holder: string;
  month: string;
  months: string[];
  /** other parts of the address to keep (company, status) */
  hidden: Record<string, string>;
  /** a person who may only see their own petty cash cannot change the name */
  lockName?: boolean;
  /** may see everyone's petty cash (Ms. Penny and Ms. Nabilah) */
  canSeeAll?: boolean;
  everyone?: boolean;
  children?: React.ReactNode;
}) {
  const [name, setName] = useState(holder);
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface px-5 py-3.5">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="min-w-[14rem] flex-1">
        <label className={labelClass} htmlFor="pc-holder">Petty cash of (name)</label>
        {lockName ? (
          <>
            <input id="pc-holder" name="holder" value={name} readOnly className={`${inputClass} cursor-not-allowed bg-surface-alt`} />
            <div className="mt-0.5 text-[11px] text-text-muted">Your own petty cash only.</div>
          </>
        ) : (
          <SearchSelect
            id="pc-holder"
            name="holder"
            required={!everyone}
            value={name}
            onChange={setName}
            options={holders.map((h) => h.name)}
            className={inputClass}
            placeholder="Search or choose a name"
          />
        )}
      </div>
      <div>
        <label className={labelClass} htmlFor="pc-month">Month</label>
        <Select id="pc-month" name="month" defaultValue={month} className="mt-1 block h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13.5px] font-semibold">
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value="all">All</option>
        </Select>
      </div>
      <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">{lockName ? "Show my petty cash" : "Show this petty cash"}</button>
      {canSeeAll && (
        <button type="submit" name="all" value="1" formNoValidate className={`h-9 rounded-lg border px-4 text-[13px] font-semibold ${everyone ? "border-primary bg-info-bg text-primary" : "border-border-strong bg-surface text-text"}`}>
          Show everyone&apos;s petty cash
        </button>
      )}
      {children && <div className="ml-auto text-[13px] text-text-secondary">{children}</div>}
    </form>
  );
}
