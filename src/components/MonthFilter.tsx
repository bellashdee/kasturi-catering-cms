"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filter of a list by month: a month picker (the list shows what falls in that month) and All months to remove it. The company and the search stay. */
export function MonthFilter({ param = "month" }: { param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(param) ?? "";

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

  const btn = "flex h-10 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text hover:bg-surface-alt";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12.5px] font-semibold text-text-secondary">Month</span>
      <button type="button" aria-label="Previous month" onClick={() => step(-1)} className={btn}>
        ‹
      </button>
      <input
        type="month"
        value={value}
        onChange={(e) => change(e.target.value)}
        aria-label="Month"
        className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text outline-none focus:border-primary"
      />
      <button type="button" aria-label="Next month" onClick={() => step(1)} className={btn}>
        ›
      </button>
      <button
        type="button"
        onClick={() => change("")}
        className={`h-10 rounded-lg border px-3.5 text-[13px] font-semibold ${value ? "border-border-strong bg-surface text-text" : "border-primary bg-primary text-white"}`}
      >
        All months
      </button>
    </div>
  );
}
