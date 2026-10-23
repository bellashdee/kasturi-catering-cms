import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listDriverExpenses } from "@/lib/driver/queries";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/driver/constants";
import { formatCurrency } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { OperationRowActions } from "@/components/driver/OperationRowActions";
import { RecordUndoBanner } from "@/components/driver/RecordUndoBanner";

export default async function DriverExpensesPage({
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

  const expenses = await listDriverExpenses(supabase, targetCompanyIds);
  const total = expenses.reduce((t, e) => t + Number(e.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{expenses.length} expense{expenses.length === 1 ? "" : "s"} · {formatCurrency(total)} total</p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">Expenses: receipts and invoices paid directly by the Director of Finance. Money spent from the Operation petty cash goes under Petty Cash.</p>
        </div>
        <Link href={`/driver-logistics/expenses/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Expense
        </Link>
      </div>

      <DriverLogisticsSubNav />

      <RecordUndoBanner />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {expenses.length === 0 ? (
          <EmptyRow text="No expenses recorded yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr_1.6fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Date</div>
              <div>Category</div>
              <div>Amount</div>
              <div>Claimed by</div>
              <div>Company / Notes</div>
            </div>
            {expenses.map((e) => (
              <div key={e.id} className="border-b border-border last:border-b-0">
              <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr_1.6fr] px-5 py-3.5 text-[13.5px]">
                <div className="text-text-secondary">{e.expense_date}</div>
                <div className="font-semibold text-text">{EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}</div>
                <div className="text-text-secondary">{formatCurrency(Number(e.amount))}</div>
                <div className="text-text-secondary">{e.claimant?.full_name ?? e.employees?.full_name ?? "—"}</div>
                <div className="truncate text-text-muted">{e.companies?.name}{e.notes ? ` · ${e.notes}` : ""}</div>
              </div>
              <div className="px-5 pb-3">
                <OperationRowActions
                  kind="expense"
                  id={e.id}
                  initial={{ expenseDate: e.expense_date, category: e.category, amount: String(e.amount), notes: e.notes ?? "" }}
                />
              </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
