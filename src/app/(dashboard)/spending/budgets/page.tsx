import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listBudgets, listSpending } from "@/lib/finance/queries";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { BudgetRowActions } from "@/components/finance/BudgetRowActions";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { period: "Period", category: "Category", department: "Department", budgeted: "Budgeted" };

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; category?: string; department?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // a budget belongs to the month it is set for
  const inMonth = filterByMonth(await listBudgets(supabase, targetCompanyIds), month, (b) => `${b.year}-${String(b.month).padStart(2, "0")}-01`);
  const categoryNames = Array.from(new Set(inMonth.map((b) => b.category))).sort((a, b) => a.localeCompare(b));
  const departmentNames = Array.from(new Set(inMonth.map((b) => b.department).filter((d): d is string => !!d))).sort((a, b) => a.localeCompare(b));
  const { sort, dir } = readSort(sp, SORTS, "period", "desc");
  const budgets = sortBy(
    inMonth.filter((b) => (!sp.category || b.category === sp.category) && (!sp.department || b.department === sp.department)),
    sort,
    dir,
    {
      period: (b) => b.year * 100 + b.month,
      category: [(b) => b.category, (b) => b.year * 100 + b.month],
      department: [(b) => b.department, (b) => b.category],
      budgeted: (b) => Number(b.budgeted_amount),
    },
  );
  const monthLabel = monthLabelOf(month);

  const periods = Array.from(new Set(budgets.map((b) => `${b.year}-${b.month}`))).map((p) => {
    const [year, month] = p.split("-").map(Number);
    return { year, month };
  });
  // one read of every cost from the first to the last budget month, grouped by month, instead of a full read for each budget month
  const first = periods.reduce((m, p) => Math.min(m, p.year * 12 + p.month), Infinity);
  const last = periods.reduce((m, p) => Math.max(m, p.year * 12 + p.month), 0);
  const monthStart = (n: number) => `${Math.floor((n - 1) / 12)}-${String(((n - 1) % 12) + 1).padStart(2, "0")}-01`;
  const monthEnd = (n: number) => {
    const y = Math.floor((n - 1) / 12);
    const m = ((n - 1) % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  };
  const spending = periods.length ? await listSpending(supabase, targetCompanyIds, monthStart(first), monthEnd(last)) : [];
  const breakdownByPeriod = new Map<string, typeof spending>();
  for (const r of spending) {
    const key = `${Number(r.date.slice(0, 4))}-${Number(r.date.slice(5, 7))}`;
    (breakdownByPeriod.get(key) ?? breakdownByPeriod.set(key, []).get(key)!).push(r);
  }

  function actualFor(b: (typeof budgets)[number]) {
    const rows = breakdownByPeriod.get(`${b.year}-${b.month}`) ?? [];
    return rows
      .filter((r) => r.category === b.category && r.companyId === b.company_id && (!b.department || r.department === b.department))
      .reduce((t, r) => t + r.amount, 0);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Budgets</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{budgets.length} budget{budgets.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <Link href={`/spending/budgets/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Budget
        </Link>
      </div>

      <SpendingSubNav />
      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/spending/budgets${query}${month ? `${query ? "&" : "?"}month=${month}` : ""}`}>
        <FilterField label="Category">
          <Select name="category" defaultValue={sp.category ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All categories</option>
            {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Department">
          <Select name="department" defaultValue={sp.department ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All departments</option>
            {departmentNames.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {budgets.length === 0 ? (
          <EmptyRow text={monthLabel ? "No budgets set for this month." : "No budgets yet."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Period</div>
              <div>Category</div>
              <div>Department</div>
              <div>Budgeted</div>
              <div>Actual</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            {budgets.map((b) => {
              const actual = actualFor(b);
              const over = actual > Number(b.budgeted_amount);
              return (
                <div key={b.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                  <div className="text-text-secondary">{MONTH_LABEL[b.month - 1]} {b.year}</div>
                  <div className="font-semibold text-text">{b.category}</div>
                  <div className="text-text-secondary">{b.department ?? "Company-wide"}</div>
                  <div className="text-text-secondary">{formatCurrency(Number(b.budgeted_amount))}</div>
                  <div className={over ? "font-semibold text-danger" : "text-text-secondary"}>{formatCurrency(actual)}</div>
                  <div><StatusBadge tone={over ? "danger" : "success"}>{over ? "Over Budget" : "On Track"}</StatusBadge></div>
                  <BudgetRowActions id={b.id} label={`${b.category} · ${MONTH_LABEL[b.month - 1]} ${b.year}`} amount={Number(b.budgeted_amount)} department={b.department} notes={b.notes} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
