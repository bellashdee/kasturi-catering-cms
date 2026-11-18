import Link from "next/link";
import type { InvoiceDateFilter as Filter } from "@/lib/finance/dateFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_FIELD, FILTER_INPUT } from "@/components/shared/ListFilters";

/**
 * The date filter above an invoice list: pick whether it applies to the invoice date or the due date, then a From and/or a
 * To date (either one alone is fine). A plain GET form, so the filtered list can be bookmarked or shared as a link.
 */
export function InvoiceDateFilter({ filter, requestedCompanyId, month, clearHref }: { filter: Filter; requestedCompanyId?: string; month?: string; clearHref: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm print:hidden">
      {requestedCompanyId && <input type="hidden" name="company" value={requestedCompanyId} />}
      {month && <input type="hidden" name="month" value={month} />}
      <label className={FILTER_FIELD}>
        <span className="leading-4">Filter by</span>
        <Select id="invoice-date-field" name="dateField" defaultValue={filter.field} className={`${FILTER_INPUT} w-40`}>
          <option value="invoice_date">Invoice date</option>
          <option value="due_date">Due date</option>
        </Select>
      </label>
      <label className={FILTER_FIELD}>
        <span className="leading-4">From</span>
        <input id="invoice-date-from" type="date" name="from" defaultValue={filter.from ?? ""} className={`${FILTER_INPUT} w-40`} />
      </label>
      <label className={FILTER_FIELD}>
        <span className="leading-4">To</span>
        <input id="invoice-date-to" type="date" name="to" defaultValue={filter.to ?? ""} className={`${FILTER_INPUT} w-40`} />
      </label>
      <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover max-sm:flex-1">
        Apply
      </button>
      {filter.active && (
        <Link href={clearHref} className="flex h-9 items-center rounded-lg border border-border-strong px-3 text-[13px] font-semibold text-text-secondary hover:bg-surface-alt">
          Clear
        </Link>
      )}
      {filter.error && <p className="basis-full text-[13px] font-semibold text-danger">{filter.error}</p>}
    </form>
  );
}
