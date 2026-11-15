import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomerInvoices } from "@/lib/finance/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { parseInvoiceDateFilter } from "@/lib/finance/dateFilter";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { Select } from "@/components/ui/Select";
import { readSort, sortBy } from "@/lib/listSort";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard, StatRow } from "@/components/dashboard/SectionCard";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";

const SORTS = { date: "Invoice date", due: "Due date", customer: "Customer", invoice: "Invoice No.", amount: "Amount" };

function statusTone(status: string, overdue: boolean): "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (overdue) return "danger";
  return "warning";
}

export default async function CustomerInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; dateField?: string; from?: string; to?: string; month?: string; customer?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, dateField, from, to, month } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const customerQuery = sp.customer?.trim().toLowerCase() ?? "";
  const dateFilter = parseInvoiceDateFilter({ dateField, from, to });
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // the month applies to the same date as the date filter (invoice date unless "Due date" is picked)
  const inMonth = filterByMonth(await listCustomerInvoices(supabase, targetCompanyIds, dateFilter), month, (i) => i[dateFilter.field]);
  const matching = inMonth.filter(
    (i) =>
      (!customerQuery || (i.customers?.name ?? "").toLowerCase().includes(customerQuery)) &&
      (!sp.status || (sp.status === "overdue" ? isOverdue(i.due_date, i.status) : i.status === sp.status)),
  );
  const invoices = sortBy(matching, sort, dir, {
    date: [(i) => i.invoice_date, (i) => i.invoice_number],
    due: [(i) => i.due_date, (i) => i.invoice_number],
    customer: [(i) => i.customers?.name, (i) => i.invoice_number],
    invoice: (i) => i.invoice_number,
    amount: (i) => Number(i.amount),
  });
  const monthLabel = monthLabelOf(month);
  const filtered = dateFilter.active || !!monthLabel || !!customerQuery || !!sp.status;
  const outstanding = invoices.filter((i) => i.status !== "paid");
  const totalOutstanding = outstanding.reduce((t, i) => t + Number(i.amount), 0);
  const overdueCount = outstanding.filter((i) => isOverdue(i.due_date, i.status)).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{invoices.length} customer invoice{invoices.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {dateFilter.field === "due_date" ? "due in " : ""}{monthLabel}</span> : null}{dateFilter.active ? ` · ${dateFilter.field === "due_date" ? "due" : "dated"} ${dateFilter.from ?? "any date"} to ${dateFilter.to ?? "any date"}` : ""}</p>
        </div>
        <Link href={`/finance/invoices/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Invoice
        </Link>
      </div>

      <FinanceAdminSubNav />

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/finance/invoices${query}`}>
        <FilterField label="Customer">
          <input name="customer" defaultValue={sp.customer ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All statuses</option>
            {Object.entries(INVOICE_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="overdue">Overdue</option>
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

      <SectionCard title={filtered ? "Customer outstanding (invoices in this filter)" : "Customer outstanding"}>
        <StatRow label="Total outstanding" value={formatCurrency(totalOutstanding)} />
        <StatRow label="Overdue invoices" value={overdueCount} />
      </SectionCard>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {invoices.length === 0 ? (
          <EmptyRow text={monthLabel && !dateFilter.active && !customerQuery && !sp.status ? "No customer invoices in this month." : filtered ? "No invoices match this filter." : "No customer invoices yet."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Invoice #</div>
              <div>Customer</div>
              <div>Invoice date</div>
              <div>Due date</div>
              <div>Amount</div>
              <div>Company</div>
              <div>Status</div>
            </div>
            {invoices.map((inv) => {
              const overdue = isOverdue(inv.due_date, inv.status);
              return (
                <Link
                  key={inv.id}
                  href={`/finance/invoices/${inv.id}${query}`}
                  className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">{inv.invoice_number}</div>
                  <div className="text-text-secondary">{inv.customers?.name ?? "—"}</div>
                  <div className="text-text-secondary">{inv.invoice_date}</div>
                  <div className="text-text-secondary">{inv.due_date}</div>
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
