"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filter of a list by month: a month picker with the month before and after (the list shows what falls in that month). A page opened
 * without a month opens on this month (the proxy adds it, see MONTH_FILTER_PAGES). The company and the search stay.
 */
export function MonthFilter({ param = "month", allowAll = false }: { param?: string; /** shows an "All months" button (month=all: no month filter) */ allowAll?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(param) ?? "";
  const isAll = raw === "all";
  const value = isAll ? "" : raw;

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(param, next);
    else params.delete(param);
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  function step(delta: number) {
    const now = new Date();
    const [y, m] = (value || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    change(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const btn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-text hover:bg-surface-alt";
  // the label above the boxes, like every field of the filter bars
  return (
    <div className="flex flex-col text-[12px] font-semibold text-text-secondary max-sm:w-full">
      <span className="leading-4">Month</span>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" aria-label="Previous month" onClick={() => step(-1)} className={btn}>
          ‹
        </button>
        <input
          type="month"
          value={value}
          onChange={(e) => change(e.target.value)}
          aria-label="Month"
          className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-normal text-text outline-none focus:border-primary max-sm:min-w-0 max-sm:flex-1"
        />
        <button type="button" aria-label="Next month" onClick={() => step(1)} className={btn}>
          ›
        </button>
        {allowAll && (
          <button
            type="button"
            onClick={() => change("all")}
            className={`h-9 shrink-0 rounded-lg border px-3 text-[13px] font-semibold ${isAll ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}
          >
            All months
          </button>
        )}
      </div>
    </div>
  );
}
