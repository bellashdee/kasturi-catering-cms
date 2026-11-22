import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSupplierInvoices } from "@/lib/procurement/queries";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { parseInvoiceDateFilter } from "@/lib/finance/dateFilter";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { natural, readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Invoice date", month: "Month", invoice: "Invoice No.", supplier: "Supplier", due: "Due date", amount: "Amount", autocount: "AutoCount Invoice No." };

export default async function SupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; dateField?: string; from?: string; to?: string; month?: string; supplier?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, dateField, from, to, month, supplier } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const dateFilter = parseInvoiceDateFilter({ dateField, from, to });
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // by month: the invoice date (or the due date when the date filter below is set to the due date)
  const inPeriod = filterByMonth(await listSupplierInvoices(supabase, targetCompanyIds, dateFilter), month, (inv) => (dateFilter.field === "due_date" ? inv.due_date : inv.invoice_date));
  const monthLabel = monthLabelOf(month);
  // the suppliers of the invoices in this period, for the supplier filter
  const supplierOptions = Array.from(new Map(inPeriod.filter((inv) => inv.supplier_id).map((inv) => [inv.supplier_id as string, inv.suppliers?.name ?? "—"])).entries()).sort((a, b) => natural(a[1], b[1]));
  const invoices = sortBy(
    inPeriod.filter((inv) => !supplier || inv.supplier_id === supplier),
    sort,
    dir,
    {
      date: [(inv) => inv.invoice_date, (inv) => inv.invoice_number],
      month: [(inv) => inv.invoice_date?.slice(0, 7), (inv) => inv.suppliers?.name, (inv) => inv.invoice_number],
      invoice: (inv) => inv.invoice_number,
      supplier: [(inv) => inv.suppliers?.name, (inv) => inv.invoice_number],
      due: [(inv) => inv.due_date, (inv) => inv.invoice_number],
      amount: (inv) => Number(inv.amount),
      autocount: [(inv) => inv.autocount_invoice_no, (inv) => inv.invoice_number],
    },
  );
  // a column header link that keeps every filter and sorts by that column (a second click turns the order round)
  const sortHref = (key: keyof typeof SORTS) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ company: requestedId, dateField, from, to, month, supplier })) if (v) q.set(k, v);
    q.set("sort", key);
    q.set("dir", sort === key && dir === "asc" ? "desc" : "asc");
    return `/supplier-procurement/invoices?${q.toString()}`;
  };
  const arrow = (key: keyof typeof SORTS) => (sort === key ? (dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}{dateFilter.active ? ` · ${dateFilter.field === "due_date" ? "due" : "dated"} ${dateFilter.from ?? "any date"} to ${dateFilter.to ?? "any date"}` : ""}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <Link href={`/supplier-procurement/invoices/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Invoice
        </Link>
      </div>

      <SupplierProcurementSubNav />

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/supplier-procurement/invoices${query}`}>
        <FilterField label="Supplier">
          <Select name="supplier" defaultValue={supplier ?? ""} className={`${FILTER_INPUT} w-64`}>
            <option value="">All suppliers</option>
            {supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Filter by">
          <Select name="dateField" defaultValue={dateFilter.field} className={`${FILTER_INPUT} w-36`}>
            <option value="invoice_date">Invoice date</option>
            <option value="due_date">Due date</option>
          </Select>
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={dateFilter.from ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={dateFilter.to ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
      </ListFilters>
      {dateFilter.error && <p className="-mt-3 text-[13px] font-semibold text-danger">{dateFilter.error}</p>}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {invoices.length === 0 ? (
          <EmptyRow text={supplier ? "No invoices match these filters." : monthLabel ? "No invoices in this month." : dateFilter.active ? "No invoices match this date filter." : "No invoices yet."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <Link href={sortHref("invoice")} className={sort === "invoice" ? "text-primary" : "hover:text-text"}>Invoice No.{arrow("invoice")}</Link>
              <Link href={sortHref("supplier")} className={sort === "supplier" ? "text-primary" : "hover:text-text"}>Supplier{arrow("supplier")}</Link>
              <Link href={sortHref("date")} className={sort === "date" ? "text-primary" : "hover:text-text"}>Invoice Date{arrow("date")}</Link>
              <Link href={sortHref("due")} className={sort === "due" ? "text-primary" : "hover:text-text"}>Due Date{arrow("due")}</Link>
              <Link href={sortHref("amount")} className={sort === "amount" ? "text-primary" : "hover:text-text"}>Amount{arrow("amount")}</Link>
              <Link href={sortHref("autocount")} className={sort === "autocount" ? "text-primary" : "hover:text-text"}>AutoCount Invoice No.{arrow("autocount")}</Link>
              <div>Company</div>
            </div>
            {invoices.map((inv) => {
              return (
                <Link
                  key={inv.id}
                  href={`/supplier-procurement/invoices/${inv.id}${query}`}
                  className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">{inv.invoice_number}</div>
                  <div className="text-text-secondary">{inv.suppliers?.name}{inv.remarks && <span className="block text-[12px] text-text-muted">{inv.remarks}</span>}</div>
                  <div className="text-text-secondary">{formatMalaysiaDate(inv.invoice_date)}</div>
                  <div className="text-text-secondary">{formatMalaysiaDate(inv.due_date)}</div>
                  <div className="text-text-secondary">{formatCurrency(Number(inv.amount))}</div>
                  <div className={inv.autocount_invoice_no ? "font-semibold text-text" : "text-text-muted"}>{inv.autocount_invoice_no ?? "—"}</div>
                  <div className="text-text-secondary">{inv.companies?.name}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
