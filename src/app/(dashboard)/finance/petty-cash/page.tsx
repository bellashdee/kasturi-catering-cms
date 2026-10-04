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
import { KpiCard } from "@/components/dashboard/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { PettyCashForm } from "@/components/finance/PettyCashForm";
import { PettyCashPaymentAction } from "@/components/finance/PettyCashPaymentAction";

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; status?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, status: statusParam } = await searchParams;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const transactions = await listPettyCashTransactions(supabase, targetCompanyIds);

  const balance = transactions.reduce((t, tx) => t + (tx.type === "top_up" ? Number(tx.amount) : -Number(tx.amount)), 0);
  const topUps = transactions.filter((t) => t.type === "top_up");
  const allClaims = transactions.filter((t) => t.type === "expense");
  const summary = summarizePettyCashClaims(allClaims);
  const claims = statusParam ? allClaims.filter((c) => c.payment_status === statusParam) : allClaims;
  const overdueClaims = allClaims.filter((c) => isPettyCashOverdue(c.transaction_date, c.payment_status));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Petty Cash</p>
      </div>

      <FinanceAdminSubNav />

      {overdueClaims.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-bg px-4 py-3">
          <span className="text-lg">🔴</span>
          <div className="text-[13px] font-semibold text-danger">
            {overdueClaims.length} petty cash claim{overdueClaims.length === 1 ? " is" : "s are"} overdue for payment (pending more than{" "}
            {PETTY_CASH_OVERDUE_DAYS} days) — please review and pay.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Total Claims" value={String(summary.totalClaims)} />
        <KpiCard label="Pending Payment" value={String(summary.pendingCount)} tone={summary.pendingCount > 0 ? "warning" : "neutral"} iconTone="warning" />
        <KpiCard label="Paid" value={String(summary.paidCount)} tone="success" iconTone="success" />
        <KpiCard label="Total Pending Amount" value={formatCurrency(summary.totalPendingAmount)} tone={summary.totalPendingAmount > 0 ? "warning" : "neutral"} iconTone="warning" />
        <KpiCard label="Total Paid Amount" value={formatCurrency(summary.totalPaidAmount)} tone="success" iconTone="success" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Current Float Balance</div>
        <div className={`mt-1 text-2xl font-extrabold ${balance >= 0 ? "text-text" : "text-danger"}`}>{formatCurrency(balance)}</div>
      </div>

      <PettyCashForm companies={selectable} defaultCompanyId={defaultCompanyId} />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="text-[15px] font-bold text-text">Petty Cash Claims</div>
          <div className="flex gap-1">
            <Link
              href={`/finance/petty-cash${query}`}
              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${!statusParam ? "bg-primary text-white" : "text-text-secondary hover:bg-bg"}`}
            >
              All
            </Link>
            <Link
              href={`/finance/petty-cash${query}${query ? "&" : "?"}status=pending_payment`}
              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${statusParam === "pending_payment" ? "bg-primary text-white" : "text-text-secondary hover:bg-bg"}`}
            >
              Pending Payment
            </Link>
            <Link
              href={`/finance/petty-cash${query}${query ? "&" : "?"}status=paid`}
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
              <div>Company / Description</div>
            </div>
            {topUps.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_1fr_1fr_1.4fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                <div className="text-text-secondary">{t.transaction_date}</div>
                <div className="font-semibold text-text">{PETTY_CASH_TYPE_LABEL[t.type] ?? t.type}</div>
                <div className="text-success">+{formatCurrency(Number(t.amount))}</div>
                <div className="truncate text-text-muted">{t.companies?.name}{t.description ? ` · ${t.description}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
