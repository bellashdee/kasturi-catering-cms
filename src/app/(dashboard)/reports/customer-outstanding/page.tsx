import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomerInvoices } from "@/lib/finance/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/finance/constants";
import { daysOverdue, invoiceBalance, invoicePaid, invoiceTotal, isOpenInvoice } from "@/lib/finance/outstanding";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { AGING_LABELS, RED, StackedBar, agingBucket } from "@/components/reports/Charts";
import { RankBars } from "@/components/reports/RankBars";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Invoice date", invoice: "Invoice No.", customer: "Customer", due: "Due date", balance: "Balance owed" };

export default async function CustomerOutstandingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; status?: string; year?: string; month?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, status: statusParam, year: yearParam, month: monthParam } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const allInvoices = await listCustomerInvoices(supabase, targetCompanyIds);
  // the same balance the Performance Dashboard and the Company Summary use: invoice total with tax, less the payments received
  const outstanding = allInvoices.filter((i) => isOpenInvoice(i.status) && invoiceBalance(i) > 0);
  // the month of the invoice (and its year, this year when only a month is chosen); nothing chosen = every unpaid invoice
  const month = Math.min(Math.max(Number(monthParam) || 0, 0), 12);
  const year = Number(yearParam) || (month ? malaysiaYearMonth().year : 0);
  const inPeriod = (date: string) => (!year || Number(date.slice(0, 4)) === year) && (!month || Number(date.slice(5, 7)) === month);
  const periodLabel = month ? `${MONTH_LABEL[month - 1]} ${year}` : year ? String(year) : "all months";
  const rows = sortBy(
    outstanding.filter((i) => inPeriod(i.invoice_date) && (!statusParam || i.status === statusParam)),
    sort,
    dir,
    {
      date: [(r) => r.invoice_date, (r) => r.invoice_number],
      invoice: (r) => r.invoice_number,
      customer: [(r) => r.customers?.name, (r) => r.invoice_date],
      due: [(r) => r.due_date, (r) => r.invoice_number],
      balance: (r) => invoiceBalance(r),
    },
  );
  const total = rows.reduce((t, i) => t + invoiceBalance(i), 0);

  // how late the listed invoices are (by their due date, as of today) and the customers who owe the most
  const today = todayInMalaysia();
  const aging = [0, 0, 0, 0, 0];
  const owedBy = new Map<string, { value: number; count: number; late: number }>();
  for (const i of rows) {
    const balance = invoiceBalance(i);
    const days = i.due_date ? daysOverdue(i.due_date, today) : 0;
    aging[agingBucket(days)] += balance;
    const name = i.customers?.name ?? "—";
    const c = owedBy.get(name) ?? { value: 0, count: 0, late: 0 };
    c.value += balance;
    c.count += 1;
    c.late = Math.max(c.late, days);
    owedBy.set(name, c);
  }
  const topCustomers = Array.from(owedBy.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 10)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} invoice${c.count === 1 ? "" : "s"}`, flag: c.late > 0 ? `${c.late} days late` : undefined }));

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "invoice", label: "Invoice #", exportValue: (r) => r.invoice_number },
      { key: "customer", label: "Customer", exportValue: (r) => r.customers?.name ?? "—" },
      { key: "date", label: "Invoice Date", exportValue: (r) => r.invoice_date },
      { key: "due", label: "Due Date", exportValue: (r) => r.due_date },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      { key: "amount", label: "Invoice Total", exportValue: (r) => invoiceTotal(r), display: (r) => formatCurrency(invoiceTotal(r)) },
      { key: "paid", label: "Paid", exportValue: (r) => invoicePaid(r), display: (r) => formatCurrency(invoicePaid(r)) },
      { key: "balance", label: "Balance Owed", exportValue: (r) => invoiceBalance(r), display: (r) => <span className="font-semibold text-text">{formatCurrency(invoiceBalance(r))}</span> },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => INVOICE_STATUS_LABEL[r.status] ?? r.status,
        display: (r) => <StatusBadge tone={isOverdue(r.due_date, r.status) ? "danger" : "warning"}>{INVOICE_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>,
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Customer Outstanding Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">invoices of {periodLabel} · {rows.length} invoice{rows.length === 1 ? "" : "s"} · {formatCurrency(total)} outstanding</p>
      </div>

      <ReportFilterBar
        path="/reports/customer-outstanding"
        sortOptions={SORTS}
        sort={sort}
        dir={dir}
        requestedCompanyId={requestedId}
        year={year || undefined}
        month={month}
        monthAll
        showRange={false}
        status={statusParam}
        statusOptions={Object.entries(INVOICE_STATUS_LABEL).filter(([v]) => isOpenInvoice(v)).map(([value, label]) => ({ value, label }))}
      />

      {rows.length > 0 && (
        <SectionCard title={`How Late Is It — ${formatCurrency(total)}`}>
          <p className="mb-3 text-[12.5px] text-text-secondary">The balance of the invoices listed below, by how many days past the due date they are today.</p>
          <StackedBar segments={AGING_LABELS.map((a, k) => ({ ...a, value: aging[k] }))} />
          <div className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-text-secondary">Customers who owe the most (top 10)</div>
          <RankBars items={topCustomers} total={total} color={RED} empty="Nothing is owed." />
        </SectionCard>
      )}

      <ReportTable
        filenameBase={`customer-outstanding${month ? `-${year}-${month}` : ""}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
