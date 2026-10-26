import Link from "next/link";
import type { InvoiceDateFilter as Filter } from "@/lib/finance/dateFilter";
import { Select } from "@/components/ui/Select";

/**
 * The date filter above an invoice list: pick whether it applies to the invoice date or the due date, then a From and/or a
 * To date (either one alone is fine). A plain GET form, so the filtered list can be bookmarked or shared as a link.
 */
export function InvoiceDateFilter({ filter, requestedCompanyId, clearHref }: { filter: Filter; requestedCompanyId?: string; clearHref: string }) {
  const field = "mt-1 h-10 rounded-lg border border-border-strong bg-surface px-2.5 text-[14px] text-text";
  const label = "text-[12.5px] font-semibold text-text-secondary";
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm print:hidden">
      {requestedCompanyId && <input type="hidden" name="company" value={requestedCompanyId} />}
      <div>
        <label className={label} htmlFor="invoice-date-field">Filter by</label>
        <Select id="invoice-date-field" name="dateField" defaultValue={filter.field} className={`${field} block w-40`}>
          <option value="invoice_date">Invoice date</option>
          <option value="due_date">Due date</option>
        </Select>
      </div>
      <div>
        <label className={label} htmlFor="invoice-date-from">From</label>
        <input id="invoice-date-from" type="date" name="from" defaultValue={filter.from ?? ""} className={`${field} block w-44`} />
      </div>
      <div>
        <label className={label} htmlFor="invoice-date-to">To</label>
        <input id="invoice-date-to" type="date" name="to" defaultValue={filter.to ?? ""} className={`${field} block w-44`} />
      </div>
      <button type="submit" className="h-10 rounded-lg bg-primary px-5 text-[14px] font-semibold text-white hover:bg-primary-hover">
        Apply
      </button>
      {filter.active && (
        <Link href={clearHref} className="flex h-10 items-center px-2 text-[14px] font-semibold text-text-secondary hover:text-text">
          Clear
        </Link>
      )}
      {filter.error && <p className="basis-full text-[13px] font-semibold text-danger">{filter.error}</p>}
    </form>
  );
}
