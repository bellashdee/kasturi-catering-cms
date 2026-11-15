import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomerInvoices } from "@/lib/finance/queries";
import { listSupplierInvoices } from "@/lib/procurement/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/finance/constants";
import { formatCurrency, todayInMalaysia, addDaysToDateIso, mondayOfWeekIso } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard, StatRow } from "@/components/dashboard/SectionCard";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { MarkInvoicePaidAction } from "@/components/finance/MarkInvoicePaidAction";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const sortsFor = (view: "customer" | "supplier") => ({ date: "Invoice date", due: "Due date", party: view === "customer" ? "Customer" : "Supplier", invoice: "Invoice No.", amount: "Amount" });

function todayIso(): string {
  return todayInMalaysia();
}

function startOfWeekIso(): string {
  return mondayOfWeekIso(todayInMalaysia());
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

type Row = {
  id: string;
  counterparty: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  dueDate: string;
  status: string;
  companyName: string;
};

export default async function OutstandingPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; view?: string; month?: string; q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, view: viewParam, month: monthParam, q, status: statusParam } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const companyQuery = requestedId ? `company=${requestedId}&` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const view: "customer" | "supplier" = viewParam === "supplier" ? "supplier" : "customer";
  const SORTS = sortsFor(view);
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");

  const today = todayIso();
  const weekEndIso = addDaysToDateIso(today, 7);
  const weekStartIso = startOfWeekIso();

  let rows: Row[] = [];
  let paidThisMonthTotal = 0;
  const currentMonthKey = today.slice(0, 7);

  if (view === "customer") {
    const invoices = await listCustomerInvoices(supabase, targetCompanyIds);
    rows = invoices
      .filter((i) => i.status !== "paid")
      .map((i) => ({
        id: i.id,
        counterparty: i.customers?.name ?? "—",
        invoiceNumber: i.invoice_number,
        invoiceDate: i.invoice_date,
        amount: Number(i.amount) + Number(i.tax_amount ?? 0) - i.customer_payments.reduce((t, p) => t + Number(p.amount), 0),
        dueDate: i.due_date,
        status: i.status,
        companyName: i.companies?.name ?? "—",
      }));
    paidThisMonthTotal = invoices
      .flatMap((i) => i.customer_payments.map((p) => ({ ...p, invoiceId: i.id })))
      .filter((p) => monthKey(p.payment_date) === currentMonthKey)
      .reduce((t, p) => t + Number(p.amount), 0);
  } else {
    const invoices = await listSupplierInvoices(supabase, targetCompanyIds);
    rows = invoices
      .filter((i) => i.status !== "paid")
      .map((i) => ({
        id: i.id,
        counterparty: i.suppliers?.name ?? "—",
        invoiceNumber: i.invoice_number,
        invoiceDate: i.invoice_date,
        amount: Number(i.amount) - i.supplier_payments.filter((p) => p.status === "paid").reduce((t, p) => t + Number(p.amount), 0),
        dueDate: i.due_date,
        status: i.status,
        companyName: i.companies?.name ?? "—",
      }));
    paidThisMonthTotal = invoices
      .flatMap((i) => i.supplier_payments)
      .filter((p) => p.status === "paid" && p.payment_date && monthKey(p.payment_date) === currentMonthKey)
      .reduce((t, p) => t + Number(p.amount), 0);
  }

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => r.counterparty.toLowerCase().includes(needle) || r.invoiceNumber.toLowerCase().includes(needle));
  }
  if (statusParam) {
    rows = rows.filter((r) => r.status === statusParam);
  }
  if (monthParam) {
    rows = rows.filter((r) => monthKey(r.dueDate) === monthParam);
  }

  rows = sortBy(rows, sort, dir, {
    date: [(r) => r.invoiceDate, (r) => r.invoiceNumber],
    due: [(r) => r.dueDate, (r) => r.invoiceNumber],
    party: [(r) => (r.counterparty === "—" ? null : r.counterparty), (r) => r.invoiceNumber],
    invoice: (r) => r.invoiceNumber,
    amount: (r) => r.amount,
  });

  const totalOutstanding = rows.reduce((t, r) => t + r.amount, 0);
  const overdueRows = rows.filter((r) => r.dueDate < today);
  const dueTodayRows = rows.filter((r) => r.dueDate === today);
  const dueThisWeekRows = rows.filter((r) => r.dueDate >= weekStartIso && r.dueDate <= weekEndIso);
  const currentMonthOutstanding = rows.filter((r) => monthKey(r.dueDate) === currentMonthKey).reduce((t, r) => t + r.amount, 0);
  const previousMonthsOutstanding = rows.filter((r) => monthKey(r.dueDate) < currentMonthKey).reduce((t, r) => t + r.amount, 0);

  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const key = monthKey(r.dueDate);
    const list = grouped.get(key) ?? [];
    list.push(r);
    grouped.set(key, list);
  }
  // grouped by due month, newest month first (oldest first when sorting by due date ascending); the rows inside follow Sort by
  const sortedMonthKeys = [...grouped.keys()].sort((a, b) => (sort === "due" && dir === "asc" ? a.localeCompare(b) : b.localeCompare(a)));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} outstanding {view} invoice{rows.length === 1 ? "" : "s"}</p>
      </div>

      <FinanceAdminSubNav />

      <div className="flex gap-2">
        <Link href={`/finance/outstanding?${companyQuery}view=customer`} className={`rounded-lg px-4 py-2 text-[13px] font-bold ${view === "customer" ? "bg-primary text-white" : "border border-border-strong text-text-secondary"}`}>
          Customer Outstanding
        </Link>
        <Link href={`/finance/outstanding?${companyQuery}view=supplier`} className={`rounded-lg px-4 py-2 text-[13px] font-bold ${view === "supplier" ? "bg-primary text-white" : "border border-border-strong text-text-secondary"}`}>
          Supplier Outstanding
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <SectionCard title="Summary">
          <StatRow label="Total outstanding" value={formatCurrency(totalOutstanding)} />
          <StatRow label="Current month outstanding" value={formatCurrency(currentMonthOutstanding)} />
          <StatRow label="Previous months outstanding" value={formatCurrency(previousMonthsOutstanding)} />
          <StatRow label="Paid this month" value={formatCurrency(paidThisMonthTotal)} />
        </SectionCard>
        <SectionCard title="Timing">
          <StatRow label="Overdue" value={`${overdueRows.length} · ${formatCurrency(overdueRows.reduce((t, r) => t + r.amount, 0))}`} />
          <StatRow label="Due today" value={dueTodayRows.length} />
          <StatRow label="Due this week" value={dueThisWeekRows.length} />
        </SectionCard>
      </div>

      <ListFilters keep={{ company: requestedId, view }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/finance/outstanding?${companyQuery}view=${view}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={q ?? ""} placeholder={view === "customer" ? "Customer or invoice No." : "Supplier or invoice No."} className={`${FILTER_INPUT} w-56`} />
        </FilterField>
        <FilterField label="Due month">
          <input type="month" name="month" defaultValue={monthParam ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={statusParam ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All statuses</option>
            {Object.entries(INVOICE_STATUS_LABEL).filter(([v]) => v !== "paid").map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      {sortedMonthKeys.length === 0 ? (
        <EmptyRow text="Nothing outstanding — everything's paid." />
      ) : (
        sortedMonthKeys.map((key) => {
          const monthRows = grouped.get(key)!;
          return (
            <SectionCard key={key} title={monthLabel(key)}>
              <div className="-mx-5 -mb-5 divide-y divide-border">
                <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr] px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <div>{view === "customer" ? "Customer" : "Supplier"}</div>
                  <div>Invoice #</div>
                  <div>Amount</div>
                  <div>Due Date</div>
                  <div>Status</div>
                  <div>Task</div>
                </div>
                {monthRows.map((r) => {
                  const overdue = isOverdue(r.dueDate, r.status);
                  return (
                    <div key={r.id} className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr] items-center px-5 py-3 text-[13.5px]">
                      <div className="font-semibold text-text">{r.counterparty}</div>
                      <div className="text-text-secondary">{r.invoiceNumber}</div>
                      <div className="text-text-secondary">{formatCurrency(r.amount)}</div>
                      <div className="text-text-secondary">{r.dueDate}</div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone={overdue ? "danger" : "warning"}>
                          {overdue ? "Overdue" : INVOICE_STATUS_LABEL[r.status] ?? r.status}
                        </StatusBadge>
                      </div>
                      <div>
                        <MarkInvoicePaidAction kind={view} invoiceId={r.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
