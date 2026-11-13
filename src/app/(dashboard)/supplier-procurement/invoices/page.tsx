import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSupplierInvoices } from "@/lib/procurement/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/procurement/constants";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { parseInvoiceDateFilter } from "@/lib/finance/dateFilter";
import { InvoiceDateFilter } from "@/components/shared/InvoiceDateFilter";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";

const SORTS: Record<string, string> = { newest: "Newest first", invoice: "Invoice number (A–Z)", supplier: "Supplier (A–Z)" };
const natural = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").localeCompare(b ?? "", undefined, { numeric: true, sensitivity: "base" });

function statusTone(status: string, overdue: boolean): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (overdue) return "danger";
  if (status === "disputed") return "danger";
  return "warning";
}

export default async function SupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; dateField?: string; from?: string; to?: string; month?: string; supplier?: string; sort?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, dateField, from, to, month, supplier, sort: sortParam } = await searchParams;
  const sort = sortParam && SORTS[sortParam] ? sortParam : "newest";
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
  const invoices = inPeriod.filter((inv) => !supplier || inv.supplier_id === supplier);
  if (sort === "invoice") invoices.sort((a, b) => natural(a.invoice_number, b.invoice_number));
  else if (sort === "supplier") invoices.sort((a, b) => natural(a.suppliers?.name, b.suppliers?.name) || natural(a.invoice_number, b.invoice_number));
  // a link that keeps every filter and changes only the sort
  const sortHref = (key: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ company: requestedId, dateField, from, to, month, supplier })) if (v) q.set(k, v);
    q.set("sort", key);
    return `/supplier-procurement/invoices?${q.toString()}`;
  };

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

      <InvoiceDateFilter filter={dateFilter} requestedCompanyId={requestedId} month={month} clearHref={`/supplier-procurement/invoices${query}`} />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        {Object.entries({ company: requestedId, dateField, from, to, month }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <label className="text-[12px] font-semibold text-text-secondary">
          Supplier
          <Select name="supplier" defaultValue={supplier ?? ""} className="mt-1 block h-9 w-72 rounded-lg border border-border-strong bg-surface px-2 text-[13px]">
            <option value="">All suppliers</option>
            {supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Sort by
          <Select name="sort" defaultValue={sort} className="mt-1 block h-9 w-52 rounded-lg border border-border-strong bg-surface px-2 text-[13px]">
            {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply</button>
      </form>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {invoices.length === 0 ? (
          <EmptyRow text={monthLabel ? "No invoices in this month." : dateFilter.active ? "No invoices match this date filter." : "No invoices yet."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <Link href={sortHref("invoice")} className={sort === "invoice" ? "text-primary" : "hover:text-text"}>Invoice #{sort === "invoice" ? " ▲" : ""}</Link>
              <Link href={sortHref("supplier")} className={sort === "supplier" ? "text-primary" : "hover:text-text"}>Supplier{sort === "supplier" ? " ▲" : ""}</Link>
              <div>Invoice Date</div>
              <div>Due Date</div>
              <div>Amount</div>
              <div>Company</div>
              <div>Status</div>
            </div>
            {invoices.map((inv) => {
              const overdue = isOverdue(inv.due_date, inv.status);
              return (
                <Link
                  key={inv.id}
                  href={`/supplier-procurement/invoices/${inv.id}${query}`}
                  className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">{inv.invoice_number}</div>
                  <div className="text-text-secondary">{inv.suppliers?.name}</div>
                  <div className="text-text-secondary">{formatMalaysiaDate(inv.invoice_date)}</div>
                  <div className="text-text-secondary">{formatMalaysiaDate(inv.due_date)}</div>
                  <div className="text-text-secondary">{formatCurrency(Number(inv.amount))}</div>
                  <div className="text-text-secondary">{inv.companies?.name}</div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge tone={statusTone(inv.status, overdue)}>{INVOICE_STATUS_LABEL[inv.status] ?? inv.status}</StatusBadge>
                    {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
