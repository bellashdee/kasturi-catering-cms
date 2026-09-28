import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getMonthlyCostBreakdown, listCostCategories } from "@/lib/finance/queries";
import { formatCurrency } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { EmptyRow } from "@/components/dashboard/SectionCard";

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function ExpenseReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; department?: string; category?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam, department: departmentParam, category: categoryParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;

  const [allRows, categories] = await Promise.all([
    getMonthlyCostBreakdown(supabase, targetCompanyIds, year, month),
    listCostCategories(supabase, targetCompanyIds),
  ]);

  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const departments = Array.from(new Set(allRows.map((r) => r.department).filter((d): d is string => !!d))).sort();
  const rows = allRows
    .filter((r) => {
      if (departmentParam && r.department !== departmentParam) return false;
      if (categoryParam && r.category !== categoryParam) return false;
      return true;
    })
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((t, r) => t + r.amount, 0);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "source", label: "Module", exportValue: (r) => r.source },
      { key: "category", label: "Category", exportValue: (r) => r.category },
      { key: "department", label: "Department", exportValue: (r) => r.department ?? "—" },
      { key: "company", label: "Company", exportValue: (r) => companyName.get(r.companyId) ?? "—" },
      { key: "amount", label: "Amount", exportValue: (r) => r.amount, display: (r) => formatCurrency(r.amount) },
    ],
    (r, i) => `${r.source}-${r.category}-${i}`,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Expense Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} transaction{rows.length === 1 ? "" : "s"} · {formatCurrency(total)} total</p>
      </div>

      <ReportFilterBar
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        department={departmentParam}
        departmentOptions={departments.map((d) => ({ value: d, label: d }))}
        category={categoryParam}
        categoryOptions={categories.map((c) => ({ value: c.name, label: c.name }))}
      />

      <ReportTable
        filenameBase={`expenses-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
