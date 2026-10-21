import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCompanyExpenses, listCostCategories, uniqueCategories } from "@/lib/finance/queries";
import { formatCurrency } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { CompanyExpenseTable } from "@/components/finance/CompanyExpenseTable";

export default async function CompanyExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const [expenses, categories] = await Promise.all([listCompanyExpenses(supabase, targetCompanyIds), listCostCategories(supabase, targetCompanyIds)]);
  const total = expenses.reduce((t, e) => t + Number(e.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{expenses.length} expense{expenses.length === 1 ? "" : "s"} · {formatCurrency(total)} total</p>
        </div>
        <Link href={`/finance/expenses/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Expense
        </Link>
      </div>

      <FinanceAdminSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {expenses.length === 0 ? (
          <EmptyRow text="No company expenses recorded yet." />
        ) : (
          <CompanyExpenseTable
            categories={uniqueCategories(categories).map((c) => c.name)}
            rows={expenses.map((e) => ({
              id: e.id,
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
    </div>
  );
}
