import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listProductionOrders } from "@/lib/kitchen/queries";
import { getMonthlyCostBreakdown } from "@/lib/finance/queries";
import { PRODUCTION_STATUS_LABEL } from "@/lib/kitchen/constants";
import { parseDateRange, resolvePeriod } from "@/lib/finance/constants";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Planned Date", recipe: "Recipe", event: "Event", status: "Status" };

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function KitchenReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; from?: string; to?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, year: yearParam, month: monthParam, from: fromParam, to: toParam, status: statusParam } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
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

  const [allOrders, costRows] = await Promise.all([
    listProductionOrders(supabase, targetCompanyIds),
    getMonthlyCostBreakdown(supabase, targetCompanyIds, year, month, range),
  ]);

  const monthOrders = allOrders.filter((o) => !!o.planned_date && o.planned_date >= start && o.planned_date <= end);
  const rows = sortBy(statusParam ? monthOrders.filter((o) => o.status === statusParam) : monthOrders, sort, dir, {
    date: (r) => r.planned_date,
    recipe: [(r) => r.recipes?.name, (r) => r.planned_date],
    event: [(r) => r.catering_events?.event_name, (r) => r.planned_date],
    status: [(r) => PRODUCTION_STATUS_LABEL[r.status] ?? r.status, (r) => r.planned_date],
  });

  const kitchenCosts = costRows.filter((r) => r.source === "Kitchen");
  const ingredientCost = kitchenCosts.filter((r) => r.category === "Ingredients Consumed").reduce((t, r) => t + r.amount, 0);
  const wastageCost = kitchenCosts.filter((r) => r.category === "Wastage").reduce((t, r) => t + r.amount, 0);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "date", label: "Planned Date", exportValue: (r) => r.planned_date ?? "—" },
      { key: "recipe", label: "Recipe", exportValue: (r) => r.recipes?.name ?? "—" },
      { key: "pax", label: "Pax", exportValue: (r) => r.pax_count ?? 0 },
      { key: "event", label: "Linked Event", exportValue: (r) => r.catering_events?.event_name ?? "—" },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => PRODUCTION_STATUS_LABEL[r.status] ?? r.status,
        display: (r) => <StatusBadge tone={r.status === "completed" ? "success" : r.status === "in_progress" ? "info" : "warning"}>{PRODUCTION_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>,
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Kitchen Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} production order{rows.length === 1 ? "" : "s"}</p>
      </div>

      <ReportFilterBar
        path="/reports/kitchen"
        sortOptions={SORTS}
        sort={sort}
        dir={dir}
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        from={fromParam}
        to={toParam}
        status={statusParam}
        statusOptions={Object.entries(PRODUCTION_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
      />

      <div className="grid grid-cols-2 gap-4">
        <SectionCard title="Ingredient Cost Used"><div className="text-xl font-extrabold text-text">{formatCurrency(ingredientCost)}</div></SectionCard>
        <SectionCard title="Wastage Cost"><div className="text-xl font-extrabold text-danger">{formatCurrency(wastageCost)}</div></SectionCard>
      </div>

      <ReportTable
        filenameBase={`kitchen-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
