import { MONTH_LABEL } from "@/lib/finance/constants";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import type { SortDir } from "@/lib/listSort";

type Option = { value: string; label: string };

/**
 * The shared Year/Month/Department/Category/Status filter bar every report uses, in the filter bar of the list pages (ListFilters: Sort by,
 * Ascending / Descending, Apply Filters and Clear). Company is already handled by the global selector in the top bar (every report reads it
 * the same way every other module page does) — it is kept as it is. A filter is shown only when it is meaningful for this report's data;
 * never as a fake control with nothing real behind it.
 */
export function ReportFilterBar({
  path,
  requestedCompanyId,
  keep,
  year,
  month,
  showMonth = true,
  monthAll = false,
  showRange = true,
  showYear = true,
  from,
  to,
  department,
  departmentOptions,
  category,
  categoryOptions,
  categoryLabel = "Category",
  categoryAllLabel = "All Categories",
  status,
  statusOptions,
  sortOptions,
  sort,
  dir,
}: {
  /** the report's own address, for Clear (the company is kept) */
  path: string;
  requestedCompanyId?: string;
  /** other values of the address the bar does not show but must not lose */
  keep?: Record<string, string | number | null | undefined>;
  year?: number;
  month?: number;
  showMonth?: boolean;
  /** offer "All months" (value 0) before the months, for reports that are not about one month by default */
  monthAll?: boolean;
  /** the From / To dates (an exact range); off for reports that are not about a period of dates */
  showRange?: boolean;
  showYear?: boolean;
  /** A custom date range (YYYY-MM-DD). When both are filled in it is used instead of the month and year. */
  from?: string;
  to?: string;
  department?: string;
  departmentOptions?: Option[];
  category?: string;
  categoryOptions?: Option[];
  categoryLabel?: string;
  /** the first choice of the category list ("All Categories", "All types" ...) */
  categoryAllLabel?: string;
  status?: string;
  statusOptions?: Option[];
  /** the Sort by choices of the report's table, with the chosen sort and order */
  sortOptions?: Record<string, string>;
  sort?: string;
  dir?: SortDir;
}) {
  const withRange = showMonth && showYear && showRange;
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <ListFilters
        keep={{ company: requestedCompanyId, ...keep }}
        sortOptions={sortOptions}
        sort={sort}
        dir={dir}
        clearHref={requestedCompanyId ? `${path}?company=${requestedCompanyId}` : path}
      >
        {showYear && (
          <FilterField label="Year">
            <input type="number" name="year" defaultValue={year} className={`${FILTER_INPUT} w-24`} />
          </FilterField>
        )}
        {showMonth && (
          <FilterField label="Month">
            <Select name="month" defaultValue={month} className={`${FILTER_INPUT} w-36`}>
              {monthAll && <option value={0}>All months</option>}
              {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </FilterField>
        )}
        {withRange && (
          <>
            <FilterField label="From date">
              <input type="date" name="from" defaultValue={from ?? ""} className={`${FILTER_INPUT} w-40`} />
            </FilterField>
            <FilterField label="To date">
              <input type="date" name="to" defaultValue={to ?? ""} className={`${FILTER_INPUT} w-40`} />
            </FilterField>
          </>
        )}
        {departmentOptions && (
          <FilterField label="Department">
            <Select name="department" defaultValue={department ?? ""} className={`${FILTER_INPUT} w-44`}>
              <option value="">All Departments</option>
              {departmentOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </FilterField>
        )}
        {categoryOptions && (
          <FilterField label={categoryLabel}>
            <Select name="category" defaultValue={category ?? ""} className={`${FILTER_INPUT} w-48`}>
              <option value="">{categoryAllLabel}</option>
              {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </FilterField>
        )}
        {statusOptions && (
          <FilterField label="Status">
            <Select name="status" defaultValue={status ?? ""} className={`${FILTER_INPUT} w-44`}>
              <option value="">All Statuses</option>
              {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </FilterField>
        )}
      </ListFilters>
      {withRange && <p className="text-[12.5px] text-text-secondary">Fill in both From and To to see an exact date range; otherwise the month and year above are used.</p>}
    </div>
  );
}
