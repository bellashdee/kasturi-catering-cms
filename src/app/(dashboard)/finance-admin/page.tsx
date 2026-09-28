import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getMonthlyCostBreakdown, getMonthlyRevenue, listCostCategories } from "@/lib/finance/queries";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { FinanceSubNav } from "@/components/finance/FinanceSubNav";

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function FinanceAdminPage({
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

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;

  const [allRows, revenue, categories] = await Promise.all([
    getMonthlyCostBreakdown(supabase, targetCompanyIds, year, month),
    getMonthlyRevenue(supabase, targetCompanyIds, year, month),
    listCostCategories(supabase, targetCompanyIds),
  ]);

  const departments = Array.from(new Set(allRows.map((r) => r.department).filter((d): d is string => !!d))).sort();
  const rows = allRows.filter((r) => {
    if (departmentParam && r.department !== departmentParam) return false;
    if (categoryParam && r.category !== categoryParam) return false;
    return true;
  });

  const totalCost = rows.reduce((t, r) => t + r.amount, 0);
  const net = revenue - totalCost;

  const bySource = new Map<string, number>();
  const byCategory = new Map<string, { source: string; amount: number }>();
  for (const r of rows) {
    bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.amount);
    const key = `${r.source} · ${r.category}`;
    const existing = byCategory.get(key);
    byCategory.set(key, { source: r.source, amount: (existing?.amount ?? 0) + r.amount });
  }
  const categoryRows = Array.from(byCategory.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Finance & Admin</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Monthly Financial Summary</p>
      </div>

      <FinanceSubNav />

      <form method="get" className="flex flex-wrap items-end gap-3">
        {requestedId && <input type="hidden" name="company" value={requestedId} />}
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Year</label>
          <input type="number" name="year" defaultValue={year} className="mt-1 h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Month</label>
          <select name="month" defaultValue={month} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Department</label>
          <select name="department" defaultValue={departmentParam ?? ""} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Category</label>
          <select name="category" defaultValue={categoryParam ?? ""} className="mt-1 h-9 w-52 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
      </form>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Revenue</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(revenue)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Monthly Costing</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(totalCost)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Net</div>
          <div className={`mt-1 text-xl font-extrabold ${net >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(net)}</div>
        </div>
      </div>

      <SectionCard title="Costs by Module">
        {bySource.size === 0 ? (
          <EmptyRow text="No costs recorded for this period." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]).map(([source, amount]) => (
              <div key={source} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                <span className="font-semibold text-text">{source}</span>
                <span className="text-text-secondary">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Costs by Category">
        {categoryRows.length === 0 ? (
          <EmptyRow text="No costs recorded for this period." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {categoryRows.map((c) => (
              <div key={c.key} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                <span className="text-text">{c.key}</span>
                <span className="font-semibold text-text">{formatCurrency(c.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
