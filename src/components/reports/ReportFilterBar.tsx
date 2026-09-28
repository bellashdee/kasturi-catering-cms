import { MONTH_LABEL } from "@/lib/finance/constants";

type Option = { value: string; label: string };

/**
 * The shared Company/Month/Year/Department/Category/Status filter bar every
 * report uses. Company is already handled by the global selector in the top
 * bar (every report reads it the same way every other module page does) — this
 * renders the other five, but only the ones that are actually meaningful for
 * this report's data; a filter is never shown as a fake control with nothing
 * real behind it.
 */
export function ReportFilterBar({
  requestedCompanyId,
  year,
  month,
  showMonth = true,
  showYear = true,
  department,
  departmentOptions,
  category,
  categoryOptions,
  categoryLabel = "Category",
  status,
  statusOptions,
}: {
  requestedCompanyId?: string;
  year?: number;
  month?: number;
  showMonth?: boolean;
  showYear?: boolean;
  department?: string;
  departmentOptions?: Option[];
  category?: string;
  categoryOptions?: Option[];
  categoryLabel?: string;
  status?: string;
  statusOptions?: Option[];
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
      {requestedCompanyId && <input type="hidden" name="company" value={requestedCompanyId} />}
      {showYear && (
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Year</label>
          <input type="number" name="year" defaultValue={year} className="mt-1 h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
      )}
      {showMonth && (
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Month</label>
          <select name="month" defaultValue={month} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      )}
      {departmentOptions && (
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Department</label>
          <select name="department" defaultValue={department ?? ""} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All Departments</option>
            {departmentOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
      )}
      {categoryOptions && (
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">{categoryLabel}</label>
          <select name="category" defaultValue={category ?? ""} className="mt-1 h-9 w-48 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All {categoryLabel}</option>
            {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      )}
      {statusOptions && (
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Status</label>
          <select name="status" defaultValue={status ?? ""} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All Statuses</option>
            {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}
      <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
    </form>
  );
}
