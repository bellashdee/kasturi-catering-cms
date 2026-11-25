"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDays } from "@/lib/opsRoster/shared";

export type RosterViewKey = "day" | "week" | "ot" | "history" | "staff";

/** The date (calendar, previous / next day, today) and the views (Daily, Weekly, OT Summary, History, Staff). */
export function RosterNav({ date, today, view, views }: { date: string; today: string; view: RosterViewKey; views: { key: RosterViewKey; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    return `${pathname}?${next.toString()}`;
  };
  const step = view === "week" ? 7 : 1;
  const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-alt";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 rounded-xl bg-surface-alt p-1">
        {views.map((v) => (
          <Link key={v.key} href={href({ view: v.key })} className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold ${v.key === view ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text"}`}>
            {v.label}
          </Link>
        ))}
      </div>
      {view !== "staff" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={btn} aria-label="Previous" onClick={() => router.push(href({ date: addDays(date, -step) }))}>‹</button>
          <input type="date" value={date} onChange={(e) => e.target.value && router.push(href({ date: e.target.value }))} className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13.5px]" />
          <button type="button" className={btn} aria-label="Next" onClick={() => router.push(href({ date: addDays(date, step) }))}>›</button>
          {date !== today && <button type="button" className={btn} onClick={() => router.push(href({ date: today }))}>Today</button>}
          {date !== addDays(today, 1) && view === "day" && <button type="button" className={btn} onClick={() => router.push(href({ date: addDays(today, 1) }))}>Tomorrow</button>}
        </div>
      )}
    </div>
  );
}
