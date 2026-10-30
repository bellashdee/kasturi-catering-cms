import { PieChart, sumBy } from "@/components/reports/PieChart";
import { parseDateRange } from "@/lib/finance/constants";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getMonthlyCostBreakdown, listCostCategories, sameLabel, uniqueCategories } from "@/lib/finance/queries";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { EmptyRow } from "@/components/dashboard/SectionCard";

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function MonthlyCostingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; from?: string; to?: string; department?: string; category?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam, from: fromParam, to: toParam, department: departmentParam, category: categoryParam } = await searchParams;
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

  const grouped = new Map<string, { source: string; category: string; department: string | null; amount: number }>();
  for (const r of filteredRows) {
    const key = `${r.source}·${r.category}·${r.department ?? ""}`;
    const existing = grouped.get(key);
    grouped.set(key, { source: r.source, category: r.category, department: r.department, amount: (existing?.amount ?? 0) + r.amount });
  }
  const rows = Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);

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
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        from={fromParam}
        to={toParam}
        department={departmentParam}
        departmentOptions={departments.map((d) => ({ value: d, label: d }))}
        category={categoryParam}
        categoryOptions={uniqueCategories(categories).map((c) => ({ value: c.name, label: c.name }))}
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
