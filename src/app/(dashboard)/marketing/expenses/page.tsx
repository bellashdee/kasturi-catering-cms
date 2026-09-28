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

export default async function MarketingExpensesPage({
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

  const expenses = await listExpensesForCompanies(supabase, targetCompanyIds);
  const total = expenses.reduce((t, e) => t + Number(e.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Marketing Expenses</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {expenses.length} record{expenses.length === 1 ? "" : "s"} · Total {formatCurrency(total)}
          </p>
        </div>
        <Link href={`/marketing/expenses/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + Log Expense
        </Link>
      </div>

      <MarketingSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {expenses.length === 0 ? (
          <EmptyRow text="No marketing expenses logged yet." />
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
