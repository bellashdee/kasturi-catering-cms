import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSpending, sameLabel, type CostRow } from "@/lib/finance/queries";
import { formatCurrency, formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";
import { CompanyExpenseTable } from "@/components/finance/CompanyExpenseTable";
import { CompanyExpenseOverview } from "@/components/finance/CompanyExpenseOverview";
import { SPENDING_CATEGORIES } from "@/lib/finance/spendingCategories";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Date", category: "Category", department: "Department", amount: "Amount" };

export default async function CompanyExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; page?: string; q?: string; category?: string; department?: string; from?: string; to?: string; month?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, page: pageParam, q = "", category = "", department = "", from = "", to = "", month = "" } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // every cost of the companies, from the same list Monthly Costing adds up (expenses keyed in here, petty cash, rental and utilities
  // paid in Finance ...), so the two pages always tally; only the expenses keyed in here can be edited here
  const spending = await listSpending(supabase, targetCompanyIds);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const everyExpense = spending
    .map((r: CostRow) => ({ id: r.id, source: r.source, category: r.category, department: r.department, amount: r.amount, note: r.note ?? null, expense_date: r.date, notes: r.details, companies: { name: companyName.get(r.companyId) ?? "" } }))
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || a.source.localeCompare(b.source));

  // search and filters: words in the category, notes, department, company or amount; the category and department; a date range
  const words = q.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const matching = everyExpense.filter((e) => {
    if (category && !sameLabel(e.category, category)) return false;
    if (department && !sameLabel(e.department, department)) return false;
    if (words.length === 0) return true;
    const hay = `${e.source} ${e.category} ${e.department ?? ""} ${e.notes ?? ""} ${e.companies?.name ?? ""} ${e.expense_date} ${e.amount} ${Number(e.amount).toFixed(2)}`.toUpperCase();
    return words.every((w) => hay.includes(w));
  });
  // the month picker (by expense date) works together with the search, the filters and the date range; the monthly chart below keeps showing every month
  const monthLabel = monthLabelOf(month);
  const expenses = sortBy(filterByMonth(matching.filter((e) => !(from && e.expense_date < from) && !(to && e.expense_date > to)), month, (e) => e.expense_date), sort, dir, {
    date: [(e) => e.expense_date, (e) => e.source],
    category: [(e) => e.category, (e) => e.expense_date],
    department: [(e) => e.department, (e) => e.expense_date],
    amount: (e) => Number(e.amount),
  });
  // the charts: the months up to this month (or to the To date), and the category chart of the list as shown
  const toEntry = (e: (typeof everyExpense)[number]) => ({ date: e.expense_date, amount: Number(e.amount), category: e.category });
  const dayText = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);
  const periodLabel = from && to ? `${dayText(from)} to ${dayText(to)}` : from ? `From ${dayText(from)}` : to ? `Up to ${dayText(to)}` : "All time";
  const filtered = !!(q.trim() || category || department || from || to || monthLabel);
  const departments = Array.from(new Set(everyExpense.map((e) => (e.department ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const categoryNames = Array.from(new Set(everyExpense.map((e) => e.category.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const total = expenses.reduce((t, e) => t + Number(e.amount), 0);
  // the list is shown 100 at a time (a long list makes the page heavy); the total is of every expense
  const PAGE_SIZE = 100;
  const pages = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1));
  const shown = expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const keep = { ...(requestedId ? { company: requestedId } : {}), ...(q.trim() ? { q } : {}), ...(category ? { category } : {}), ...(department ? { department } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(monthLabel ? { month } : {}), ...(sp.sort ? { sort: sp.sort } : {}), ...(sp.dir ? { dir: sp.dir } : {}) };
  const pageHref = (n: number) => `/spending/expenses?${new URLSearchParams({ ...keep, ...(n > 1 ? { page: String(n) } : {}) }).toString()}`;
  const clearHref = `/spending/expenses${query}${monthLabel ? `${query ? "&" : "?"}month=${month}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Company Expenses</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{expenses.length} expense{expenses.length === 1 ? "" : "s"}{filtered ? ` found of ${everyExpense.length}` : ""}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null} · {formatCurrency(total)} total</p>
        </div>
        <Link href={`/spending/expenses/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Expense
        </Link>
      </div>

      <SpendingSubNav />
      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month: monthLabel ? month : "" }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={clearHref}>
        <FilterField label="Search">
          <input name="q" defaultValue={q} placeholder="Category, notes, department, amount…" className={`${FILTER_INPUT} w-56`} />
        </FilterField>
        <FilterField label="Category">
          <Select name="category" defaultValue={category} className={`${FILTER_INPUT} w-44`}>
            <option value="">All categories</option>
            {Array.from(new Set([...SPENDING_CATEGORIES, ...categoryNames])).sort((a, b) => a.localeCompare(b)).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Department">
          <Select name="department" defaultValue={department} className={`${FILTER_INPUT} w-44`}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={from} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={to} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
      </ListFilters>

      {matching.length > 0 && (
        <CompanyExpenseOverview entries={expenses.map(toEntry)} monthEntries={matching.map(toEntry)} thisMonth={(to || todayInMalaysia()).slice(0, 7)} periodLabel={periodLabel} />
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {expenses.length === 0 ? (
          <EmptyRow text={filtered ? "No expense matches the search. Change the words or the filters." : "No company expenses yet."} />
        ) : (
          <CompanyExpenseTable
            categories={SPENDING_CATEGORIES}
            rows={shown.map((e) => ({
              id: e.id,
              source: e.source,
              companyName: e.companies?.name ?? "",
              category: e.category,
              department: e.department,
              amount: Number(e.amount),
              expenseDate: e.expense_date,
              notes: e.notes,
              note: e.note,
            }))}
          />
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-[13px] text-text-secondary">
          <span>{`Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, expenses.length)} of ${expenses.length}`}</span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 font-semibold text-text hover:bg-surface-alt">
                Previous
              </Link>
            )}
            <span>{`Page ${page} of ${pages}`}</span>
            {page < pages && (
              <Link href={pageHref(page + 1)} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 font-semibold text-text hover:bg-surface-alt">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
