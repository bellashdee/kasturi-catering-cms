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

type Row = Awaited<ReturnType<typeof listPaymentsForMonth>>[number];

function date(value: string | null): string {
  return value ? formatMalaysiaDate(`${value}T12:00:00+08:00`) : "—";
}

/** Finance Payment Report: supplier, rental and utilities payments of a month, with totals per category and company. Finance / Admin only. */
export default async function FinancePaymentsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; category?: string; status?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam, category: categoryParam, status: statusParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const adminIds = await adminCompanyIds(supabase, targetCompanyIds);
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

  const all = await listPaymentsForMonth(supabase, adminIds, year, month, { category });
  const rows = all.filter((p) => matchesStatusFilter(paymentUrgency(p.status, p.due_date, today), statusParam));

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
        requestedCompanyId={requestedId}
        year={year}
        month={month}
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
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {byCategory.map(({ c, s }) => (
              <div key={c} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                <span className="font-semibold text-text">{PAYMENT_CATEGORY_LABEL[c]}</span>
                <span className="text-text-secondary">Total {formatRM(s.total)} · Paid {formatRM(s.paid)} · Pending {formatRM(s.pending)}{s.overdue > 0 ? ` · Overdue ${formatRM(s.overdue)}` : ""}</span>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="By Company (Payment Of)">
          {byCompany.length === 0 ? (
            <EmptyRow text="No payments for this month and filter." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {byCompany.map(({ name, s }) => (
                <div key={name} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <span className="font-semibold text-text">{name}</span>
                  <span className="text-text-secondary">Total {formatRM(s.total)} · Paid {formatRM(s.paid)} · Pending {formatRM(s.pending)}{s.overdue > 0 ? ` · Overdue ${formatRM(s.overdue)}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <ReportTable filenameBase={`finance-payment-report-${year}-${month}`} headers={headers} rows={tableRows} emptyText="No payments for this month and filter." />
    </div>
  );
}
