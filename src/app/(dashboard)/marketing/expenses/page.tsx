import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listExpensesForCompanies } from "@/lib/marketing/queries";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/marketing/constants";
import { formatCurrency } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Date", description: "Description", category: "Category", campaign: "Campaign", amount: "Amount" };

export default async function MarketingExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; q?: string; category?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month, q } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const filtered = Boolean(q || sp.category);
  const expenses = sortBy(
    filterByMonth(await listExpensesForCompanies(supabase, targetCompanyIds), month, (e) => e.expense_date).filter(
      (e) => (!q || (e.description ?? "").toLowerCase().includes(q.trim().toLowerCase())) && (!sp.category || e.category === sp.category),
    ),
    sort,
    dir,
    {
      date: (e) => e.expense_date,
      description: [(e) => e.description, (e) => e.expense_date],
      category: [(e) => EXPENSE_CATEGORY_LABEL[e.category] ?? e.category, (e) => e.expense_date],
      campaign: [(e) => e.campaigns?.name, (e) => e.expense_date],
      amount: (e) => Number(e.amount),
    },
  );
  const monthLabel = monthLabelOf(month);
  const total = expenses.reduce((t, e) => t + Number(e.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Marketing Expenses</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {expenses.length} expense{expenses.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null} · {formatCurrency(total)} total
          </p>
        </div>
        <Link href={`/marketing/expenses/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Expense
        </Link>
      </div>

      <MarketingSubNav />
      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/marketing/expenses?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Description">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Category">
          <Select name="category" defaultValue={sp.category ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All categories</option>
            {Object.entries(EXPENSE_CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {expenses.length === 0 ? (
          <EmptyRow text={filtered ? "No expenses match these filters." : monthLabel ? "No expenses in this month." : "No marketing expenses yet."} />
        ) : (
          <div className="divide-y divide-border">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">{e.description}</div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {EXPENSE_CATEGORY_LABEL[e.category] ?? e.category} · {e.expense_date}
                    {e.campaigns?.name && ` · ${e.campaigns.name}`}
                  </div>
                </div>
                <div className="text-[13.5px] font-bold text-text">{formatCurrency(e.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
