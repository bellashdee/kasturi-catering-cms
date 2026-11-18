import Link from "next/link";
import type { ReactNode } from "react";
import { Select } from "@/components/ui/Select";
import { SORT_DIR_LABEL, type SortDir } from "@/lib/listSort";

/** The look of a box in the filter bar (text, date, number inputs). */
export const FILTER_INPUT = "mt-1 block h-9 rounded-lg border border-border-strong bg-surface px-2 text-[13px] text-text";

/** The layout of one labelled field of the filter bar (also for a page that builds its own field): label above, box under it. */
export const FILTER_FIELD = "flex flex-col text-[12px] font-semibold text-text-secondary max-sm:w-full max-sm:[&>div]:w-full max-sm:[&_input]:w-full";

/**
 * One labelled box of the filter bar: the label always sits above its box, so every field of the bar lines up the same way. On a phone each
 * field takes the whole width of the bar (one field per line).
 */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={FILTER_FIELD}>
      <span className="leading-4">{label}</span>
      {children}
    </label>
  );
}

/**
 * The filter bar of a list page: one GET form with the page's own filters (children), "Sort by" + Ascending / Descending, an
 * Apply Filters button and Clear. `keep` are the values the bar does not show but must not lose (the company, the month of the month picker ...).
 */
export function ListFilters({
  keep,
  sortOptions,
  sort,
  dir,
  clearHref,
  children,
}: {
  keep?: Record<string, string | number | null | undefined>;
  sortOptions?: Record<string, string>;
  sort?: string;
  dir?: SortDir;
  clearHref: string;
  children?: ReactNode;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm print:hidden">
      {Object.entries(keep ?? {}).map(([k, v]) => (v !== null && v !== undefined && v !== "" ? <input key={k} type="hidden" name={k} value={String(v)} /> : null))}
      {children}
      {sortOptions && Object.keys(sortOptions).length > 0 && (
        <>
          <FilterField label="Sort by">
            <Select name="sort" defaultValue={sort ?? Object.keys(sortOptions)[0]} className={`${FILTER_INPUT} w-44`}>
              {Object.entries(sortOptions).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Order">
            <Select name="dir" defaultValue={dir ?? "desc"} className={`${FILTER_INPUT} w-36`}>
              {(Object.keys(SORT_DIR_LABEL) as SortDir[]).map((d) => (
                <option key={d} value={d}>{SORT_DIR_LABEL[d]}</option>
              ))}
            </Select>
          </FilterField>
        </>
      )}
      <div className="flex items-center gap-2 max-sm:w-full">
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white max-sm:flex-1">Apply Filters</button>
        <Link href={clearHref} className="flex h-9 items-center rounded-lg border border-border-strong px-3 text-[13px] font-semibold text-text-secondary hover:bg-surface-alt">Clear</Link>
      </div>
    </form>
  );
}
