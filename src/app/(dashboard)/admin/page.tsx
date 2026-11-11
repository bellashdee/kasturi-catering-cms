import { redirect } from "next/navigation";
import { SPENDING_CATEGORIES } from "@/lib/finance/spendingCategories";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getMonthlyCostBreakdown, getMonthlySales, listCostCategories, sameLabel, uniqueCategories } from "@/lib/finance/queries";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { MonthlySalesForm } from "@/components/finance/MonthlySalesForm";
import { SplitSalesForm } from "@/components/finance/SplitSalesForm";
import { Select } from "@/components/ui/Select";

/** Signature Solution records its sales as catering events and daily sales. */
const SPLIT_SALES_COMPANY_NAME = "Signature Solution";

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function AdminPage({
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

  const [allRows, sales, categories] = await Promise.all([
    getMonthlyCostBreakdown(supabase, targetCompanyIds, year, month),
    getMonthlySales(supabase, targetCompanyIds, year, month),
    listCostCategories(supabase, targetCompanyIds),
  ]);

  const departments = Array.from(new Set(allRows.map((r) => r.department).filter((d): d is string => !!d))).sort();
  const rows = allRows.filter((r) => {
    if (departmentParam && !sameLabel(r.department, departmentParam)) return false;
    if (categoryParam && !sameLabel(r.category, categoryParam)) return false;
    return true;
  });

  const totalCost = rows.reduce((t, r) => t + r.amount, 0);
  const revenue = sales.amount;
  const net = revenue - totalCost;
  const pct = (value: number) => (revenue > 0 ? `${((value / revenue) * 100).toFixed(2)}%` : "—");
  const profitPct = revenue > 0 ? (net / revenue) * 100 : null;
  const singleCompanyId = targetCompanyIds.length === 1 ? targetCompanyIds[0] : null;

  // one sales box per company: the company picked, or every company when viewing them all
  const salesCompanies = companies.filter((c) => targetCompanyIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const salesByCompany = singleCompanyId
    ? [sales]
    : await Promise.all(salesCompanies.map((c) => getMonthlySales(supabase, [c.id], year, month)));
  const monthLabel = MONTH_LABEL[month - 1];

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
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Monthly Costing</p>
      </div>

      <FinanceAdminSubNav />

      <form method="get" className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {requestedId && <input type="hidden" name="company" value={requestedId} />}
        <div className="flex items-center gap-2.5">
          <label className="whitespace-nowrap text-[12px] font-semibold text-text-secondary">Year</label>
          <input type="number" name="year" defaultValue={year} className="h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div className="flex items-center gap-2.5">
          <label className="whitespace-nowrap text-[12px] font-semibold text-text-secondary">Month</label>
          <Select name="month" defaultValue={month} className="h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="whitespace-nowrap text-[12px] font-semibold text-text-secondary">Department</label>
          <Select name="department" defaultValue={departmentParam ?? ""} className="h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="whitespace-nowrap text-[12px] font-semibold text-text-secondary">Category</label>
          <Select name="category" defaultValue={categoryParam ?? ""} className="h-9 w-52 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All Categories</option>
            {SPENDING_CATEGORIES.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
      </form>

      {!singleCompanyId && (
        <p className="-mb-2 text-[12px] font-semibold text-text-secondary">Sales for {monthLabel} {year} (RM)</p>
      )}
      {salesCompanies.map((c, i) => {
        const s = salesByCompany[i];
        return c.name.startsWith(SPLIT_SALES_COMPANY_NAME) ? (
          <SplitSalesForm
            key={`${c.id}-${year}-${month}-${s.split ? "split" : "single"}`}
            companyId={c.id}
            year={year}
            month={month}
            monthLabel={monthLabel}
            current={s.split}
            earlierTotal={s.recorded && !s.split ? s.amount : null}
          />
        ) : (
          <MonthlySalesForm
            key={`${c.id}-${year}-${month}`}
            companyId={c.id}
            year={year}
            month={month}
            monthLabel={monthLabel}
            currentAmount={s.recorded ? s.amount : null}
            label={singleCompanyId ? undefined : c.name}
          />
        );
      })}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Sales</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(revenue)}</div>
          {sales.split && (
            <div className="mt-1 space-y-0.5 text-[11px] text-text-muted">
              <div className="flex justify-between gap-2"><span>Catering</span><span>{formatCurrency(sales.split.catering)}</span></div>
              <div className="flex justify-between gap-2"><span>Daily</span><span>{formatCurrency(sales.split.daily)}</span></div>
            </div>
          )}
          {!sales.recorded && <div className="mt-0.5 text-[11px] text-text-muted">From payments received (no monthly sales entered)</div>}
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Monthly Costing</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(totalCost)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{net >= 0 ? "Profit" : "Loss"}</div>
          <div className={`mt-1 text-xl font-extrabold ${net >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(Math.abs(net))}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{net >= 0 ? "Profit %" : "Loss %"}</div>
          <div className={`mt-1 text-xl font-extrabold ${net >= 0 ? "text-success" : "text-danger"}`}>{profitPct === null ? "—" : `${Math.abs(profitPct).toFixed(2)}%`}</div>
          <div className="mt-0.5 text-[11px] text-text-muted">of sales</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Cost vs Sales</div>
          <div className="mt-1 text-xl font-extrabold text-text">{pct(totalCost)}</div>
          <div className="mt-0.5 text-[11px] text-text-muted">cost as % of sales</div>
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
                <span className="font-semibold text-text">
                  {formatCurrency(c.amount)}
                  <span className="ml-3 inline-block w-16 text-right text-[12px] font-medium text-text-muted">{pct(c.amount)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
