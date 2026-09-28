import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPettyCashTransactions } from "@/lib/finance/queries";
import { PETTY_CASH_TYPE_LABEL } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { FinanceSubNav } from "@/components/finance/FinanceSubNav";
import { PettyCashForm } from "@/components/finance/PettyCashForm";

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const transactions = await listPettyCashTransactions(supabase, targetCompanyIds);
  const balance = transactions.reduce((t, tx) => t + (tx.type === "top_up" ? Number(tx.amount) : -Number(tx.amount)), 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Finance & Admin</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Petty Cash</p>
      </div>

      <FinanceSubNav />

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Current Balance</div>
        <div className={`mt-1 text-2xl font-extrabold ${balance >= 0 ? "text-text" : "text-danger"}`}>{formatCurrency(balance)}</div>
      </div>

      <PettyCashForm companies={selectable} defaultCompanyId={defaultCompanyId} />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {transactions.length === 0 ? (
          <EmptyRow text="No petty cash transactions yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.4fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Date</div>
              <div>Type</div>
              <div>Category</div>
              <div>Amount</div>
              <div>Company / Description</div>
            </div>
            {transactions.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_1.4fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                <div className="text-text-secondary">{t.transaction_date}</div>
                <div className="font-semibold text-text">{PETTY_CASH_TYPE_LABEL[t.type] ?? t.type}</div>
                <div className="text-text-secondary">{t.category ?? "—"}</div>
                <div className={t.type === "top_up" ? "text-success" : "text-danger"}>
                  {t.type === "top_up" ? "+" : "-"}{formatCurrency(Number(t.amount))}
                </div>
                <div className="truncate text-text-muted">{t.companies?.name}{t.description ? ` · ${t.description}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
