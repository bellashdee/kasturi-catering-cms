import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listDeliveries, listDriverExpenses } from "@/lib/driver/queries";
import { DELIVERY_STATUS_LABEL, EXPENSE_CATEGORY_LABEL } from "@/lib/driver/constants";
import { parseDateRange, resolvePeriod } from "@/lib/finance/constants";
import { formatCurrency, formatMalaysiaDateTime, malaysiaDateOf, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function DriverReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; from?: string; to?: string; category?: string; status?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam, from: fromParam, to: toParam, category: categoryParam, status: statusParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;
  const range = parseDateRange(fromParam, toParam);
  const { start, end } = resolvePeriod(year, month, range);

  const [allDeliveries, allExpenses] = await Promise.all([
    listDeliveries(supabase, targetCompanyIds),
    listDriverExpenses(supabase, targetCompanyIds),
  ]);

  const monthDeliveries = allDeliveries.filter((d) => !!d.scheduled_time && malaysiaDateOf(d.scheduled_time) >= start && malaysiaDateOf(d.scheduled_time) <= end);
  const rows = statusParam ? monthDeliveries.filter((d) => d.status === statusParam) : monthDeliveries;

  const monthExpenses = allExpenses.filter((e) => e.expense_date >= start && e.expense_date <= end);
  const filteredExpenses = categoryParam ? monthExpenses.filter((e) => e.category === categoryParam) : monthExpenses;
  const totalExpenses = filteredExpenses.reduce((t, e) => t + Number(e.amount), 0);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "date", label: "Scheduled", exportValue: (r) => formatMalaysiaDateTime(r.scheduled_time) },
      { key: "event", label: "Event / Location", exportValue: (r) => [r.catering_events?.customers?.name ?? r.catering_events?.event_name, r.catering_events?.location ?? r.location].filter(Boolean).join(" — ") || "—" },
      { key: "driver", label: "Driver", exportValue: (r) => r.employees?.full_name ?? "—" },
      { key: "vehicle", label: "Vehicle", exportValue: (r) => r.vehicles?.plate_number ?? "—" },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => DELIVERY_STATUS_LABEL[r.status] ?? r.status,
        display: (r) => <StatusBadge tone={r.status === "delivered" ? "success" : r.status === "cancelled" ? "danger" : "warning"}>{DELIVERY_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>,
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Driver Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} {rows.length === 1 ? "delivery" : "deliveries"}</p>
      </div>

      <ReportFilterBar
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        from={fromParam}
        to={toParam}
        category={categoryParam}
        categoryOptions={Object.entries(EXPENSE_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
        categoryLabel="Expense Category"
        status={statusParam}
        statusOptions={Object.entries(DELIVERY_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
      />

      <SectionCard title={`Vehicle Running Costs (${categoryParam ? EXPENSE_CATEGORY_LABEL[categoryParam] : "All Categories"})`}>
        <div className="text-xl font-extrabold text-text">{formatCurrency(totalExpenses)}</div>
      </SectionCard>

      <ReportTable
        filenameBase={`driver-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
