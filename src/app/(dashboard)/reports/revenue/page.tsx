import { PieChart, sumBy } from "@/components/reports/PieChart";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getRevenueReportRows } from "@/lib/reports/queries";
import { INVOICE_STATUS_LABEL, parseDateRange } from "@/lib/finance/constants";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { InvoiceListingView, RevenueViewTabs } from "@/components/reports/InvoiceListingView";

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; from?: string; to?: string; status?: string; view?: string; entity?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const params = await searchParams;
  // "Invoices issued": the invoice listing view of this report (the month filter there is a plain month number)
  if (params.view === "invoiced") return <InvoiceListingView entity={params.entity} month={params.month} />;

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam, from: fromParam, to: toParam, status: statusParam } = params;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;
  const range = parseDateRange(fromParam, toParam);

  const allRows = await getRevenueReportRows(supabase, targetCompanyIds, year, month, range);
  const rows = statusParam ? allRows.filter((r) => r.customer_invoices?.status === statusParam) : allRows;
  const total = rows.reduce((t, r) => t + Number(r.amount), 0);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "date", label: "Payment Date", exportValue: (r) => r.payment_date },
      { key: "customer", label: "Customer", exportValue: (r) => r.customer_invoices?.customers?.name ?? "—" },
      { key: "invoice", label: "Invoice #", exportValue: (r) => r.customer_invoices?.invoice_number ?? "—" },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      { key: "amount", label: "Amount", exportValue: (r) => Number(r.amount), display: (r) => formatCurrency(Number(r.amount)) },
      {
        key: "status",
        label: "Invoice Status",
        exportValue: (r) => (r.customer_invoices?.status ? INVOICE_STATUS_LABEL[r.customer_invoices.status] ?? r.customer_invoices.status : "—"),
        display: (r) =>
          r.customer_invoices?.status ? (
            <StatusBadge tone={r.customer_invoices.status === "paid" ? "success" : "warning"}>
              {INVOICE_STATUS_LABEL[r.customer_invoices.status] ?? r.customer_invoices.status}
            </StatusBadge>
          ) : (
            "—"
          ),
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Revenue Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} payment{rows.length === 1 ? "" : "s"} · {formatCurrency(total)} total</p>
      </div>

      <RevenueViewTabs active="received" />

      <ReportFilterBar
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        from={fromParam}
        to={toParam}
        status={statusParam}
        statusOptions={Object.entries(INVOICE_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-1">
        <PieChart title="Revenue by customer" slices={sumBy(rows, (r) => r.customer_invoices?.customers?.name ?? "—", (r) => Number(r.amount))} />
      </div>

      <ReportTable
        filenameBase={`revenue-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
