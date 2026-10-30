import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCostCategories, listSpending, sameLabel, uniqueCategories, type CostRow } from "@/lib/finance/queries";
import { formatCurrency, formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";
import { CompanyExpenseTable } from "@/components/finance/CompanyExpenseTable";
import { ExpenseFilterBar } from "@/components/finance/ExpenseFilterBar";
import { CompanyExpenseOverview } from "@/components/finance/CompanyExpenseOverview";

export default async function CompanyExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; page?: string; q?: string; category?: string; department?: string; from?: string; to?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, page: pageParam, q = "", category = "", department = "", from = "", to = "" } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // every cost of the companies, from the same list Monthly Costing adds up (expenses keyed in here, petty cash, rental and utilities
  // paid in Finance ...), so the two pages always tally; only the expenses keyed in here can be edited here
  const [spending, categories] = await Promise.all([listSpending(supabase, targetCompanyIds), listCostCategories(supabase, targetCompanyIds)]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const everyExpense = spending
    .map((r: CostRow) => ({ id: r.id, source: r.source, category: r.category, department: r.department, amount: r.amount, expense_date: r.date, notes: r.details, companies: { name: companyName.get(r.companyId) ?? "" } }))
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
  const expenses = matching.filter((e) => !(from && e.expense_date < from) && !(to && e.expense_date > to));
  // the charts: the months up to this month (or to the To date), and the category chart of the list as shown
  const toEntry = (e: (typeof everyExpense)[number]) => ({ date: e.expense_date, amount: Number(e.amount), category: e.category });
  const dayText = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);
  const periodLabel = from && to ? `${dayText(from)} to ${dayText(to)}` : from ? `From ${dayText(from)}` : to ? `Up to ${dayText(to)}` : "All time";
  const filtered = !!(q.trim() || category || department || from || to);
  const departments = Array.from(new Set(everyExpense.map((e) => (e.department ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const categoryNames = Array.from(new Set(everyExpense.map((e) => e.category.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const total = expenses.reduce((t, e) => t + Number(e.amount), 0);
  // the list is shown 100 at a time (a long list makes the page heavy); the total is of every expense
  const PAGE_SIZE = 100;
  const pages = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1));
  const shown = expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const keep = { ...(requestedId ? { company: requestedId } : {}), ...(q.trim() ? { q } : {}), ...(category ? { category } : {}), ...(department ? { department } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const pageHref = (n: number) => `/spending/expenses?${new URLSearchParams({ ...keep, ...(n > 1 ? { page: String(n) } : {}) }).toString()}`;
  const clearHref = `/spending/expenses${query}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{expenses.length} expense{expenses.length === 1 ? "" : "s"}{filtered ? ` found of ${everyExpense.length}` : ""} · {formatCurrency(total)} total</p>
        </div>
        <Link href={`/spending/expenses/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Expense
        </Link>
      </div>

      <SpendingSubNav />

      <ExpenseFilterBar
        categories={Array.from(new Set([...uniqueCategories(categories).map((c) => c.name), ...categoryNames])).sort((a, b) => a.localeCompare(b))}
        departments={departments}
        initial={{ q, category, department, from, to }}
        hidden={{ company: requestedId ?? "" }}
        clearHref={clearHref}
        filtered={filtered}
      />

      {matching.length > 0 && (
        <CompanyExpenseOverview entries={expenses.map(toEntry)} monthEntries={matching.map(toEntry)} thisMonth={(to || todayInMalaysia()).slice(0, 7)} periodLabel={periodLabel} />
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {expenses.length === 0 ? (
          <EmptyRow text={filtered ? "No expense matches the search. Change the words or the filters." : "No company expenses recorded yet."} />
        ) : (
          <CompanyExpenseTable
            categories={uniqueCategories(categories).map((c) => c.name)}
            rows={shown.map((e) => ({
              id: e.id,
              source: e.source,
              companyName: e.companies?.name ?? "",
              category: e.category,
              department: e.department,
              amount: Number(e.amount),
              expenseDate: e.expense_date,
              notes: e.notes,
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
