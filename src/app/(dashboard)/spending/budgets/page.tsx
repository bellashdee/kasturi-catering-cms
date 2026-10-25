import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listBudgets, getMonthlyCostBreakdown } from "@/lib/finance/queries";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { BudgetRowActions } from "@/components/finance/BudgetRowActions";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";

export default async function BudgetsPage({
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

  const budgets = await listBudgets(supabase, targetCompanyIds);

  const periods = Array.from(new Set(budgets.map((b) => `${b.year}-${b.month}`))).map((p) => {
    const [year, month] = p.split("-").map(Number);
    return { year, month };
  });
  const breakdowns = await Promise.all(periods.map((p) => getMonthlyCostBreakdown(supabase, targetCompanyIds, p.year, p.month)));
  const breakdownByPeriod = new Map(periods.map((p, i) => [`${p.year}-${p.month}`, breakdowns[i]]));

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
          <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{budgets.length} budget{budgets.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/spending/budgets/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Budget
        </Link>
      </div>

      <SpendingSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {budgets.length === 0 ? (
          <EmptyRow text="No budgets set yet." />
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
