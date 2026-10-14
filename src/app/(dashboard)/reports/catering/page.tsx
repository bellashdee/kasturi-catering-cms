import { parseDateRange } from "@/lib/finance/constants";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getCateringReportRows } from "@/lib/reports/queries";
import { EVENT_STATUS_LABEL, EVENT_TYPE_LABEL } from "@/lib/catering/constants";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function CateringReportPage({
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

  const allRows = await getCateringReportRows(supabase, targetCompanyIds, year, month, range);
  const rows = allRows.filter((e) => {
    if (categoryParam && e.event_type !== categoryParam) return false;
    if (statusParam && e.status !== statusParam) return false;
    return true;
  });
  const totalRevenue = rows.reduce((t, e) => t + e.revenue, 0);
  const totalCost = rows.reduce((t, e) => t + e.cost, 0);

  function statusTone(status: string): "success" | "warning" | "danger" | "info" {
    if (status === "completed" || status === "confirmed") return "success";
    if (status === "cancelled") return "danger";
    if (status === "enquiry") return "warning";
    return "info";
  }

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "event", label: "Event", exportValue: (r) => r.event_name },
      { key: "date", label: "Date", exportValue: (r) => r.event_date },
      { key: "customer", label: "Customer", exportValue: (r) => r.customers?.name ?? "—" },
      { key: "pax", label: "Pax", exportValue: (r) => r.pax_count ?? 0 },
      { key: "type", label: "Type", exportValue: (r) => EVENT_TYPE_LABEL[r.event_type] ?? r.event_type },
      { key: "revenue", label: "Revenue", exportValue: (r) => r.revenue, display: (r) => formatCurrency(r.revenue) },
      { key: "cost", label: "Cost", exportValue: (r) => r.cost, display: (r) => formatCurrency(r.cost) },
      { key: "margin", label: "Margin", exportValue: (r) => r.margin, display: (r) => <span className={r.margin >= 0 ? "text-success" : "text-danger"}>{formatCurrency(r.margin)}</span> },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      { key: "status", label: "Status", exportValue: (r) => EVENT_STATUS_LABEL[r.status] ?? r.status, display: (r) => <StatusBadge tone={statusTone(r.status)}>{EVENT_STATUS_LABEL[r.status] ?? r.status}</StatusBadge> },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Catering Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {rows.length} event{rows.length === 1 ? "" : "s"} · {formatCurrency(totalRevenue)} revenue · {formatCurrency(totalCost)} cost · {formatCurrency(totalRevenue - totalCost)} margin
        </p>
      </div>

      <ReportFilterBar
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        from={fromParam}
        to={toParam}
        category={categoryParam}
        categoryOptions={Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
        categoryLabel="Event Type"
        status={statusParam}
        statusOptions={Object.entries(EVENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
      />

      <ReportTable
        filenameBase={`catering-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
