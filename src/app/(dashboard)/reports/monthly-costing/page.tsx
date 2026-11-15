import { PieChart, sumBy } from "@/components/reports/PieChart";
import { SPENDING_CATEGORIES } from "@/lib/finance/spendingCategories";
import { monthDateRange, parseDateRange, resolvePeriod } from "@/lib/finance/constants";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getMonthlyCostBreakdown, getMonthlySales, listCostCategories, listSpending, sameLabel, uniqueCategories } from "@/lib/finance/queries";
import { CostingCharts, type CostingMonth } from "@/components/reports/CostingCharts";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { amount: "Amount", module: "Module", category: "Category", department: "Department" };

function currentYearMonth() {
  return malaysiaYearMonth();
}

/** The month `back` months before year / month, as { year, month }. */
function monthsBefore(year: number, month: number, back: number) {
  const d = new Date(Date.UTC(year, month - 1 - back, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Every day from start to end (YYYY-MM-DD), at most 120 days. */
function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end && days.length < 120; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default async function MonthlyCostingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; from?: string; to?: string; department?: string; category?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, year: yearParam, month: monthParam, from: fromParam, to: toParam, department: departmentParam, category: categoryParam } = sp;
  const { sort, dir } = readSort(sp, SORTS, "amount", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;
  const range = parseDateRange(fromParam, toParam);

  const [allRows, categories] = await Promise.all([
    getMonthlyCostBreakdown(supabase, targetCompanyIds, year, month, range),
    listCostCategories(supabase, targetCompanyIds),
  ]);

  const departments = Array.from(new Set(allRows.map((r) => r.department).filter((d): d is string => !!d))).sort();
  const filteredRows = allRows.filter((r) => {
    if (departmentParam && !sameLabel(r.department, departmentParam)) return false;
    if (categoryParam && !sameLabel(r.category, categoryParam)) return false;
    return true;
  });
  const total = filteredRows.reduce((t, r) => t + r.amount, 0);

  // the charts: the period shown, and the 6 months up to the month the period ends in (same company and filters), with their sales
  const period = resolvePeriod(year, month, range);
  const endYear = Number(period.end.slice(0, 4));
  const endMonth = Number(period.end.slice(5, 7));
  const trendMonths = Array.from({ length: 6 }, (_, i) => monthsBefore(endYear, endMonth, 5 - i));
  const trendStart = monthDateRange(trendMonths[0].year, trendMonths[0].month).start;
  const trendEnd = monthDateRange(endYear, endMonth).end;
  const [trendRows, trendSales] = await Promise.all([
    listSpending(supabase, targetCompanyIds, trendStart, trendEnd),
    Promise.all(trendMonths.map((m) => getMonthlySales(supabase, targetCompanyIds, m.year, m.month))),
  ]);
  const keep = (r: { department: string | null; category: string }) => (!departmentParam || sameLabel(r.department, departmentParam)) && (!categoryParam || sameLabel(r.category, categoryParam));
  const months: CostingMonth[] = trendMonths.map((m, i) => {
    const ym = `${m.year}-${String(m.month).padStart(2, "0")}`;
    return { month: ym, sales: trendSales[i].amount, rows: trendRows.filter((r) => r.date.startsWith(ym) && keep(r)) };
  });
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const periodLabel = range ? `${period.start} to ${period.end}` : `${MONTH_NAMES[month - 1]} ${year}`;

  const grouped = new Map<string, { source: string; category: string; department: string | null; amount: number }>();
  for (const r of filteredRows) {
    const key = `${r.source}·${r.category}·${r.department ?? ""}`;
    const existing = grouped.get(key);
    grouped.set(key, { source: r.source, category: r.category, department: r.department, amount: (existing?.amount ?? 0) + r.amount });
  }
  const rows = sortBy(Array.from(grouped.values()), sort, dir, {
    amount: (r) => r.amount,
    module: [(r) => r.source, (r) => r.category],
    category: [(r) => r.category, (r) => r.source],
    department: [(r) => r.department, (r) => r.category],
  });

  // where the records behind a line are kept (to review and edit them): the page of that module, for the same company and month
  const companyQuery = requestedId ? `company=${requestedId}&` : "";
  const periodMonth = range ? "all" : `${year}-${String(month).padStart(2, "0")}`;
  const SOURCE_HREF: Record<string, string> = {
    "Petty Cash": `/spending/petty-cash?${companyQuery}all=1&month=${periodMonth}`,
    "Company Expenses": `/spending/expenses${query}`,
    "Finance Payments": `/finance/payments${query}`,
    Supplier: `/supplier-procurement/invoices${query}`,
    Catering: `/catering${query}`,
    Kitchen: `/kitchen/stock${query}`,
    Driver: `/driver-logistics${query}`,
    Marketing: `/marketing${query}`,
    HR: `/hr${query}`,
  };

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      {
        key: "source",
        label: "Module",
        exportValue: (r) => r.source,
        display: (r) =>
          SOURCE_HREF[r.source] ? (
            <Link href={SOURCE_HREF[r.source]} title="Open the records of this line to review and edit them" className="font-semibold text-primary hover:underline">
              {r.source} →
            </Link>
          ) : (
            r.source
          ),
      },
      { key: "category", label: "Category", exportValue: (r) => r.category },
      { key: "department", label: "Department", exportValue: (r) => r.department ?? "—" },
      { key: "amount", label: "Amount", exportValue: (r) => r.amount, display: (r) => formatCurrency(r.amount) },
    ],
    (r, i) => `${r.source}-${r.category}-${i}`,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Monthly Costing Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} line{rows.length === 1 ? "" : "s"} · {formatCurrency(total)} total</p>
      </div>

      <ReportFilterBar
        path="/reports/monthly-costing"
        sortOptions={SORTS}
        sort={sort}
        dir={dir}
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        from={fromParam}
        to={toParam}
        department={departmentParam}
        departmentOptions={departments.map((d) => ({ value: d, label: d }))}
        category={categoryParam}
        categoryOptions={SPENDING_CATEGORIES.map((name) => ({ value: name, label: name }))}
      />

      <CostingCharts
        rows={filteredRows.map((r) => ({ date: r.date, source: r.source, category: r.category, department: r.department, amount: r.amount }))}
        months={months}
        chosenMonth={period.end.slice(0, 7)}
        periodLabel={periodLabel}
        periodDays={daysBetween(period.start, period.end)}
        sales={range ? null : (months[months.length - 1]?.sales ?? null)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChart title="Cost by module" slices={sumBy(filteredRows, (r) => r.source, (r) => r.amount)} />
        <PieChart title="Cost by category" slices={sumBy(filteredRows, (r) => r.category, (r) => r.amount)} />
      </div>

      <ReportTable
        filenameBase={`monthly-costing-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
