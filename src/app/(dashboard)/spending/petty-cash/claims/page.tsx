import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPettyCashTransactions, summarizePettyCashClaims } from "@/lib/finance/queries";
import {
  PETTY_CASH_TYPE_LABEL,
  PETTY_CASH_PAYMENT_STATUS_LABEL,
  PETTY_CASH_OVERDUE_DAYS,
  pettyCashDaysPending,
  isPettyCashOverdue,
} from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";
import { canAccessModule } from "@/lib/modules";
import { PettyCashForm } from "@/components/finance/PettyCashForm";
import { PettyCashPaymentAction } from "@/components/finance/PettyCashPaymentAction";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";
import { PettyCashOverview } from "@/components/pettyCash/PettyCashOverview";
import { buildOverview } from "@/lib/pettyCash/overview";
import { chosenHolder, holdersOnly, likeExact, loadPersonOptions } from "@/lib/pettyCash/people";
import { PettyCashHolderBar } from "@/components/pettyCash/PettyCashHolderBar";
import { todayInMalaysia } from "@/lib/format";

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; status?: string; month?: string; holder?: string; position?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, status: statusParam, month: monthParam } = sp;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const people = await loadPersonOptions(supabase);
  const holders = holdersOnly(people);
  // whose petty cash this is: only that person's money and claims are read, so nobody else's is mixed in
  const who = chosenHolder(sp, holders, session.userId);
  const transactions = who.name ? await listPettyCashTransactions(supabase, targetCompanyIds, likeExact(who.name)) : [];

  // the month shown (this month unless another is chosen, or all time)
  const thisMonth = todayInMalaysia().slice(0, 7);
  const months = Array.from(new Set([thisMonth, ...transactions.map((t) => t.transaction_date.slice(0, 7))])).sort().reverse();
  const month = monthParam === "all" ? "all" : monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : thisMonth;
  const overview = buildOverview(
    transactions.map((t) => ({ date: t.transaction_date, kind: t.type === "top_up" ? ("in" as const) : ("out" as const), amount: Number(t.amount), category: t.category })),
    month,
    thisMonth,
  );
  const inPeriod = (date: string) => month === "all" || date.startsWith(month);

  const balance = transactions.reduce((t, tx) => t + (tx.type === "top_up" ? Number(tx.amount) : -Number(tx.amount)), 0);
  const topUps = transactions.filter((t) => t.type === "top_up" && inPeriod(t.transaction_date));
  const allClaims = transactions.filter((t) => t.type === "expense" && inPeriod(t.transaction_date));
  const summary = summarizePettyCashClaims(allClaims);
  const claims = statusParam ? allClaims.filter((c) => c.payment_status === statusParam) : allClaims;
  const overdueClaims = allClaims.filter((c) => isPettyCashOverdue(c.transaction_date, c.payment_status));

  const keep = new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), holder: who.name, position: who.position, month });
  const monthQuery = `?${keep.toString()}`;

  return (
    <SoftPage>
      <SoftHeader title="Petty Cash" subtitle="Claims: money received, what staff claimed, and what is left" />

      <SpendingSubNav hideFinance={!canAccessModule(session.allowedModules, "finance-admin")} />

      {overdueClaims.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-bg px-4 py-3">
          <span className="text-lg">🔴</span>
          <div className="text-[13px] font-semibold text-danger">
            {`Petty cash claims overdue for payment: ${overdueClaims.length} (pending more than ${PETTY_CASH_OVERDUE_DAYS} days) — please review and pay.`}
          </div>
        </div>
      )}

      <PettyCashHolderBar holders={holders} holder={who.name} position={who.position} month={month} months={months} hidden={{ company: requestedId ?? "", status: statusParam ?? "" }}>
        {who.name && (
          <span>
            Balance of {who.name}: <strong className={balance >= 0 ? "text-text" : "text-danger"}>{formatCurrency(balance)}</strong>
            {summary.pendingCount > 0 && <span>{` · claims still to be paid: ${summary.pendingCount} (${formatCurrency(summary.totalPendingAmount)})`}</span>}
          </span>
        )}
      </PettyCashHolderBar>

      {!who.name && <EmptyRow text="Choose your name and position above to see your own petty cash." />}

      {who.name && <PettyCashOverview overview={overview} periodLabel={month === "all" ? "All time" : month} />}

      {who.name && <PettyCashForm companies={selectable} defaultCompanyId={defaultCompanyId} people={people} holderName={who.name} holderPosition={who.position} />}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="text-[15px] font-bold text-text">Petty Cash Claims</div>
          <div className="flex gap-1">
            <Link
              href={`/spending/petty-cash/claims${monthQuery}`}
              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${!statusParam ? "bg-primary text-white" : "text-text-secondary hover:bg-bg"}`}
            >
              All
            </Link>
            <Link
              href={`/spending/petty-cash/claims${monthQuery}&status=pending_payment`}
              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${statusParam === "pending_payment" ? "bg-primary text-white" : "text-text-secondary hover:bg-bg"}`}
            >
              Pending Payment
            </Link>
            <Link
              href={`/spending/petty-cash/claims${monthQuery}&status=paid`}
              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${statusParam === "paid" ? "bg-primary text-white" : "text-text-secondary hover:bg-bg"}`}
            >
              Paid
            </Link>
          </div>
        </div>

        {claims.length === 0 ? (
          <EmptyRow text="No petty cash claims yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1fr_1.4fr_0.9fr_1fr_1.2fr_1fr_1.2fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Claimant</div>
              <div>Company</div>
              <div>Purpose</div>
              <div>Amount</div>
              <div>Claim Date</div>
              <div>Payment Status</div>
              <div>Payment Date</div>
              <div>Action</div>
            </div>
            {claims.map((c) => {
              const overdue = isPettyCashOverdue(c.transaction_date, c.payment_status);
              const daysPending = c.payment_status === "pending_payment" ? pettyCashDaysPending(c.transaction_date) : null;
              return (
                <div key={c.id} className="grid grid-cols-[1.2fr_1fr_1.4fr_0.9fr_1fr_1.2fr_1fr_1.2fr] items-center border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                  <div>
                    <div className="font-semibold text-text">{c.claimant_name ?? "—"}</div>
                    {c.claimant_department && <div className="text-[11px] text-text-muted">{c.claimant_department}</div>}
                  </div>
                  <div className="text-text-secondary">{c.companies?.name}</div>
                  <div className="truncate text-text-muted">{c.description ?? "—"}</div>
                  <div className="font-semibold text-text">{formatCurrency(Number(c.amount))}</div>
                  <div className="text-text-secondary">{c.transaction_date}</div>
                  <div>
                    <StatusBadge tone={c.payment_status === "paid" ? "success" : overdue ? "danger" : "warning"}>
                      {overdue ? "🔴 " : c.payment_status === "paid" ? "🟢 " : "🟡 "}
                      {PETTY_CASH_PAYMENT_STATUS_LABEL[c.payment_status] ?? c.payment_status}
                    </StatusBadge>
                    {daysPending !== null && (
                      <div className={`mt-1 text-[11px] ${overdue ? "font-semibold text-danger" : "text-text-muted"}`}>
                        {daysPending} day{daysPending === 1 ? "" : "s"} pending
                      </div>
                    )}
                  </div>
                  <div className="text-text-secondary">{c.payment_date ?? "—"}</div>
                  <div className="relative flex justify-start">
                    <PettyCashPaymentAction transactionId={c.id} paymentStatus={c.payment_status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3.5 text-[15px] font-bold text-text">Float Top-Ups</div>
        {topUps.length === 0 ? (
          <EmptyRow text="No top-ups recorded yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Date</div>
              <div>Type</div>
              <div>Amount</div>
              <div>Received by / Company / Description</div>
            </div>
            {topUps.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr_1.4fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                <div className="text-text-secondary">{t.transaction_date}</div>
                <div className="font-semibold text-text">{PETTY_CASH_TYPE_LABEL[t.type] ?? t.type}</div>
                <div className="text-success">+{formatCurrency(Number(t.amount))}</div>
                <div className="text-text-muted">
                  {(t.person_name || t.person_position) && <div className="font-semibold text-text-secondary">{[t.person_name, t.person_position].filter(Boolean).join(" · ")}</div>}
                  <div className="truncate">{t.companies?.name}{t.description ? ` · ${t.description}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SoftPage>
  );
}
