"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** The statement date (everything up to and on this date is in the statement) and, on the list, a supplier name search. */
export function SoaDateFilter({ date, withSearch = false }: { date: string; withSearch?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(date);
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("date", value);
    else params.delete("date");
    if (withSearch) {
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-2.5 rounded-xl border border-border bg-surface p-3.5 shadow-sm print:hidden">
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
        Statement date
        <input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text" />
      </label>
      {withSearch && (
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Supplier
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier name..." className="h-10 w-64 rounded-lg border border-border bg-surface px-3 text-[13px] text-text" />
        </label>
      )}
      <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">
        Apply
      </button>
    </form>
  );
}
