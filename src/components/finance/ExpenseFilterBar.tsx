"use client";

import { useState } from "react";
import Link from "next/link";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/**
 * Search and filter of the company expenses: words (category, notes, department, company, amount), category and department chosen by searching the
 * list, and a date range. It is a plain GET form: the chosen filters are in the address, so the list can be shared and the pages keep them.
 */
export function ExpenseFilterBar({
  categories,
  departments,
  initial,
  hidden,
  clearHref,
  filtered,
}: {
  categories: string[];
  departments: string[];
  initial: { q: string; category: string; department: string; from: string; to: string };
  hidden: Record<string, string>;
  clearHref: string;
  filtered: boolean;
}) {
  const [category, setCategory] = useState(initial.category);
  const [department, setDepartment] = useState(initial.department);
  const catOptions = [{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))];
  const depOptions = [{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))];

  return (
    <form method="get" className="grid grid-cols-2 items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm md:grid-cols-6">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="department" value={department} />
      <div className="col-span-2 md:col-span-2">
        <label className={labelClass} htmlFor="ex-q">Search</label>
        <input id="ex-q" name="q" defaultValue={initial.q} placeholder="Category, notes, department, amount…" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Category</label>
        <ChoiceSelect value={category} onChange={setCategory} options={catOptions} placeholder="Search a category" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Department</label>
        <ChoiceSelect value={department} onChange={setDepartment} options={depOptions} placeholder="Search a department" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="ex-from">From</label>
        <input id="ex-from" type="date" name="from" defaultValue={initial.from} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="ex-to">To</label>
        <input id="ex-to" type="date" name="to" defaultValue={initial.to} className={inputClass} />
      </div>
      <div className="col-span-2 flex items-center gap-3 md:col-span-6">
        <button type="submit" className="h-9 rounded-lg bg-primary px-5 text-[13px] font-semibold text-white">
          Search
        </button>
        {filtered && (
          <Link href={clearHref} className="text-[13px] font-semibold text-text-secondary hover:text-text">
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}
