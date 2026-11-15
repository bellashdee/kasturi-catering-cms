import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds, listPaymentsForMonth } from "@/lib/finance/paymentQueries";
import {
  PAYMENT_CATEGORY_LABEL,
  STATUS_FILTER_OPTIONS,
  URGENCY_LABEL,
  URGENCY_REMINDER,
  URGENCY_TONE,
  accountDisplay,
  formatRM,
  matchesStatusFilter,
  paymentUrgency,
  summarizePayments,
  type PaymentCategory,
} from "@/lib/finance/payments";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatMalaysiaDate } from "@/lib/format";
import { malaysiaMonthNow, todayInMalaysia } from "@/lib/driverAttendance/date";
import { buildReportRows } from "@/lib/reports/buildRows";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { PaymentSummaryCards } from "@/components/finance/PaymentSummaryCards";
import { MonthColumns, RED } from "@/components/reports/Charts";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { due: "Due date", payee: "Payee", invoice: "Invoice No.", category: "Category", amount: "Amount", status: "Status" };

type Row = Awaited<ReturnType<typeof listPaymentsForMonth>>[number];

function date(value: string | null): string {
  return value ? formatMalaysiaDate(`${value}T12:00:00+08:00`) : "—";
}

type Totals = ReturnType<typeof summarizePayments>;

/** Totals of a group of payments as a table: one row for each group, the money columns lined up, and a total row when there is more than one. */
function TotalsTable({ firstColumn, rows }: { firstColumn: string; rows: { label: string; s: Totals }[] }) {
  const sum = (pick: (s: Totals) => number) => rows.reduce((t, r) => t + pick(r.s), 0);
  const money = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">
            <th className="px-3 py-2">{firstColumn}</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">Paid</th>
            <th className="px-3 py-2 text-right">Pending</th>
            <th className="px-3 py-2 text-right">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, s }) => (
            <tr key={label} className="border-b border-border">
              <td className="px-3 py-2 font-semibold text-text">{label}</td>
              <td className={`${money} font-semibold text-text`}>{formatRM(s.total)}</td>
              <td className={`${money} text-success`}>{formatRM(s.paid)}</td>
              <td className={`${money} text-text`}>{formatRM(s.pending)}</td>
              <td className={`${money} ${s.overdue > 0 ? "font-semibold text-danger" : "text-text-secondary"}`}>{s.overdue > 0 ? formatRM(s.overdue) : "—"}</td>
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="bg-info-bg/40 font-bold">
              <td className="px-3 py-2 text-text">Total</td>
              <td className={`${money} text-text`}>{formatRM(sum((s) => s.total))}</td>
              <td className={`${money} text-success`}>{formatRM(sum((s) => s.paid))}</td>
              <td className={`${money} text-text`}>{formatRM(sum((s) => s.pending))}</td>
              <td className={`${money} ${sum((s) => s.overdue) > 0 ? "text-danger" : "text-text-secondary"}`}>{sum((s) => s.overdue) > 0 ? formatRM(sum((s) => s.overdue)) : "—"}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Finance Payment Report: supplier, rental and utilities payments of a month, with totals per category and company. Finance / Admin only. */
export default async function FinancePaymentsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; category?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, year: yearParam, month: monthParam, category: categoryParam, status: statusParam } = sp;
  const { sort, dir } = readSort(sp, SORTS, "due", "asc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const adminIds = await adminCompanyIds(supabase, targetCompanyIds, "finance-admin");
  const now = malaysiaMonthNow();
  const year = Number(yearParam) || now.year;
  const month = Number(monthParam) || now.month;
  const today = todayInMalaysia();
  const monthLabel = `${MONTH_LABEL[month - 1]} ${year}`;
  const category = (["supplier", "rental", "utility"].includes(categoryParam ?? "") ? categoryParam : undefined) as PaymentCategory | undefined;

  const header = (
    <div>
      <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Finance Payment Report</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">Supplier, rental and utilities payments · {monthLabel}</p>
    </div>
  );

  if (adminIds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="This report contains bank details and is only available to Finance / Admin users of the company." />
      </div>
    );
  }

  // the chosen month for the table, and the whole year (same category) for the month-by-month chart
  const [all, yearAll] = await Promise.all([
    listPaymentsForMonth(supabase, adminIds, year, month, { category }),
    listPaymentsForMonth(supabase, adminIds, year, 0, { category }),
  ]);
  const byMonth = MONTH_LABEL.map((_, i) => summarizePayments(yearAll.filter((p) => Number(p.period_month.slice(5, 7)) === i + 1), today));
  const yearSeries = [
    { label: "Paid", color: "#2e9e6b", values: byMonth.map((s) => s.paid) },
    { label: "Pending (not yet due)", color: "#e0a030", values: byMonth.map((s) => s.pending - s.overdue) },
    { label: "Overdue", color: RED, values: byMonth.map((s) => s.overdue) },
  ];
  const rows = sortBy(
    all.filter((p) => matchesStatusFilter(paymentUrgency(p.status, p.due_date, today), statusParam)),
    sort,
    dir,
    {
      due: [(r) => r.due_date, (r) => r.payee_name],
      payee: [(r) => r.payee_name, (r) => r.due_date],
      invoice: (r) => r.invoice_number,
      category: [(r) => PAYMENT_CATEGORY_LABEL[r.category as PaymentCategory], (r) => r.due_date],
      amount: (r) => Number(r.amount),
      status: [(r) => URGENCY_LABEL[paymentUrgency(r.status, r.due_date, today)], (r) => r.due_date],
    },
  );

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "category", label: "Category", exportValue: (r: Row) => PAYMENT_CATEGORY_LABEL[r.category as PaymentCategory] },
      { key: "company", label: "Payment Of", exportValue: (r: Row) => r.companies?.name ?? "—" },
      { key: "payee", label: "Supplier / Payee / Location", exportValue: (r: Row) => r.payee_name },
      { key: "provider", label: "Utility Provider", exportValue: (r: Row) => r.utility_provider ?? "—" },
      { key: "inOf", label: "In payment of", exportValue: (r: Row) => r.payment_of ?? "—" },
      { key: "bank", label: "Bank", exportValue: (r: Row) => r.bank_name ?? "—" },
      { key: "account", label: "Account No.", exportValue: (r: Row) => accountDisplay(r.account_no) },
      { key: "invoice", label: "Invoice / Bill No.", exportValue: (r: Row) => r.invoice_number ?? "—" },
      { key: "invoiceDate", label: "Invoice / Bill Date", exportValue: (r: Row) => date(r.invoice_date) },
      { key: "amount", label: "Amount (RM)", exportValue: (r: Row) => Number(r.amount), display: (r: Row) => formatRM(Number(r.amount)) },
      { key: "due", label: "Due Date", exportValue: (r: Row) => date(r.due_date) },
      {
        key: "status",
        label: "Status",
        exportValue: (r: Row) => URGENCY_LABEL[paymentUrgency(r.status, r.due_date, today)],
        display: (r: Row) => {
          const u = paymentUrgency(r.status, r.due_date, today);
          return <StatusBadge tone={URGENCY_TONE[u]}>{u === "pending" ? URGENCY_LABEL[u] : URGENCY_REMINDER[u]}</StatusBadge>;
        },
      },
      { key: "paid", label: "Paid Date", exportValue: (r: Row) => date(r.paid_date) },
      { key: "ref", label: "Payment Reference", exportValue: (r: Row) => r.payment_reference ?? "—" },
      { key: "voucher", label: "Voucher No.", exportValue: (r: Row) => r.voucher_number ?? "—" },
      { key: "remarks", label: "Remarks", exportValue: (r: Row) => r.remarks ?? "" },
    ],
    (r: Row) => r.id,
  );

  const byCategory = (["supplier", "rental", "utility"] as PaymentCategory[]).map((c) => ({ c, s: summarizePayments(rows.filter((r) => r.category === c), today) }));
  const byCompany = Array.from(new Set(rows.map((r) => r.companies?.name ?? "—"))).map((name) => ({ name, s: summarizePayments(rows.filter((r) => (r.companies?.name ?? "—") === name), today) }));

  return (
    <div className="flex flex-col gap-5">
      {header}

      <ReportFilterBar
        path="/reports/finance-payments"
        sortOptions={SORTS}
        sort={sort}
        dir={dir}
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        showRange={false}
        category={category}
        categoryLabel="Payment Category"
        categoryOptions={[
          { value: "supplier", label: "Supplier Payment" },
          { value: "rental", label: "Rental Payment" },
          { value: "utility", label: "Utilities Payment" },
        ]}
        status={statusParam}
        statusOptions={STATUS_FILTER_OPTIONS.filter((o) => o.value !== "")}
      />

      <PaymentSummaryCards summary={summarizePayments(rows, today)} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="By Category">
          <TotalsTable firstColumn="Category" rows={byCategory.map(({ c, s }) => ({ label: PAYMENT_CATEGORY_LABEL[c], s }))} />
        </SectionCard>
        <SectionCard title="By Company (Payment Of)">
          {byCompany.length === 0 ? (
            <EmptyRow text="No payments for this month and filter." />
          ) : (
            <TotalsTable firstColumn="Company" rows={byCompany.map(({ name, s }) => ({ label: name, s }))} />
          )}
        </SectionCard>
      </div>

      <SectionCard title={`Month by Month — ${year}${category ? ` · ${PAYMENT_CATEGORY_LABEL[category]}` : ""}`}>
        <p className="mb-3 text-[12.5px] text-text-secondary">The payments of each month of the year: what is paid, what is still to pay and what is past its due date today.</p>
        <MonthColumns series={yearSeries} empty="No payments recorded this year." />
      </SectionCard>

      <ReportTable filenameBase={`finance-payment-report-${year}-${month}`} headers={headers} rows={tableRows} emptyText="No payments for this month and filter." />
    </div>
  );
}
