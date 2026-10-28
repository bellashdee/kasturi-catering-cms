import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { canAccessModule } from "@/lib/modules";
import { formatPrice, formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { listPettyCashTransactions, summarizePettyCashClaims } from "@/lib/finance/queries";
import { PETTY_CASH_OVERDUE_DAYS, PETTY_CASH_PAYMENT_STATUS_LABEL, isPettyCashOverdue, pettyCashDaysPending } from "@/lib/finance/constants";
import { ENTRY_TYPE_LABEL, PAYMENT_METHOD_LABEL, type EntryType, type OperationPettyCashRow, type PaymentMethod } from "@/lib/operationPettyCash/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { ExportListButtons } from "@/components/procurement/ExportListButtons";
import { PettyCashEntryForm } from "@/components/pettyCash/PettyCashEntryForm";
import { PettyCashHolderBar } from "@/components/pettyCash/PettyCashHolderBar";
import { PettyCashOverview } from "@/components/pettyCash/PettyCashOverview";
import { OperationPettyCashRowActions } from "@/components/operationPettyCash/OperationPettyCashRowActions";
import { PettyCashPaymentAction } from "@/components/finance/PettyCashPaymentAction";
import { PettyCashClaimActions } from "@/components/finance/FinanceRecordActions";
import { UndoBanner } from "@/components/operationPettyCash/UndoBanner";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";
import { buildOverview } from "@/lib/pettyCash/overview";
import { chosenHolder, holdersOnly, likeExact, loadHolderNames, loadPersonOptions } from "@/lib/pettyCash/people";
import { claimPayers, ownIdentity, pettyCashAccess } from "@/lib/pettyCash/access";

const MONTH_RE = /^\d{4}-\d{2}$/;
const dayLabel = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);

type Row = {
  key: string;
  source: "book" | "claim" | "topup";
  date: string;
  created: string;
  companyId: string;
  companyName: string;
  kind: "in" | "out";
  amount: number;
  title: string;
  category: string | null;
  /** cash or online transfer, for money received */
  method?: string | null;
  person: string;
  documentId: string | null;
  bookId?: string;
  claim?: { id: string; status: string; paymentDate: string | null; claimant: string | null; department: string | null };
  /** a row that comes from the claims / top-ups table (it can be edited and deleted here) */
  tx?: { id: string; type: "expense" | "top_up"; claimant: string; department: string; category: string; description: string; companyId: string; sharedCompanyIds: string[] };
};

/**
 * Petty Cash: one place for the money received, the money spent (with the receipts) and the staff claims, for ONE person's petty cash:
 * the name and the position are chosen at the top and nothing of anyone else's is mixed in. The cash book is private to the people who
 * hold a petty cash (and the Director of Finance); the claims follow Admin & Finance access.
 */
export default async function PettyCashPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string; edit?: string; holder?: string; position?: string; status?: string; all?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { isHolder, seeAll } = await pettyCashAccess(supabase, session.userId);
  const canClaims = canAccessModule(session.allowedModules, "finance-admin");
  const sp = await searchParams;

  if (!isHolder && !canClaims) {
    return (
      <SoftPage>
        <SoftHeader title="Petty Cash" subtitle="Cash book" />
        <SpendingSubNav hideFinance />
        <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-[14px] text-text-secondary">
          The petty cash cash book is private. Only the person who holds it and the Director of Finance can open it.
        </div>
      </SoftPage>
    );
  }

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;
  const defaultCompanyId = sp.company && accessibleIds.includes(sp.company) ? sp.company : selectable[0]?.id;

  const [people, holderNames, payers] = await Promise.all([loadPersonOptions(supabase), loadHolderNames(supabase), canClaims ? claimPayers() : Promise.resolve([])]);
  const holders = holdersOnly(people, holderNames);
  // whose petty cash this is: only that person's money, spending and claims are read, so nobody else's is ever mixed in.
  // Only Ms. Penny and Ms. Nabilah may choose another person or look at everyone's; everybody else is kept to their own.
  const own = ownIdentity(people, session.userId, session.fullName);
  const everyone = seeAll && sp.all === "1";
  const who = seeAll ? (everyone ? { name: "", position: "" } : chosenHolder(sp, holders, session.userId)) : { name: own.name, position: (sp.position ?? "").trim() || own.position };
  const shownScope = !!who.name || everyone;
  const pattern = who.name ? likeExact(who.name) : "";

  let book: Awaited<ReturnType<typeof readBook>> = [];
  let transactions: Awaited<ReturnType<typeof listPettyCashTransactions>> = [];
  if (shownScope) {
    [book, transactions] = await Promise.all([isHolder ? readBook(supabase, targetCompanyIds, pattern) : Promise.resolve([]), canClaims ? listPettyCashTransactions(supabase, targetCompanyIds, pattern || undefined) : Promise.resolve([])]);
  }

  // an entry keyed in once for more than one company is listed with all of them ("Signature Solution + Kasturi Indah"), its amount counted once
  const companiesLabel = (main: string | undefined, sharedIds: string[] | null | undefined) =>
    [main ?? "", ...(sharedIds ?? []).map((id) => companies.find((c) => c.id === id)?.name ?? "")].filter(Boolean).join(" + ");

  // one list, oldest first, so the balance can run down it
  const rows: Row[] = [
    ...book.map<Row>((e) => ({
      key: `b${e.id}`,
      source: "book",
      date: e.entry_date,
      created: e.created_at,
      companyId: e.company_id,
      companyName: companiesLabel(e.companies?.name, e.shared_company_ids),
      kind: e.entry_type === "top_up" ? "in" : "out",
      amount: Number(e.amount),
      title: e.description || (e.entry_type === "top_up" ? ENTRY_TYPE_LABEL.top_up : "—"),
      category: e.category,
      method: e.entry_type === "top_up" ? e.payment_method : null,
      person: [e.person_name, e.person_position].filter(Boolean).join(" · "),
      documentId: e.document_id,
      bookId: e.id,
    })),
    ...transactions.map<Row>((t) => ({
      key: `t${t.id}`,
      source: t.type === "expense" ? "claim" : "topup",
      date: t.transaction_date,
      created: t.created_at,
      companyId: t.company_id,
      companyName: companiesLabel(t.companies?.name, t.shared_company_ids),
      kind: t.type === "top_up" ? "in" : "out",
      amount: Number(t.amount),
      title: t.description || (t.type === "top_up" ? ENTRY_TYPE_LABEL.top_up : "—"),
      category: t.category,
      person: [t.person_name, t.person_position].filter(Boolean).join(" · "),
      documentId: t.document_id,
      claim: t.type === "expense" ? { id: t.id, status: t.payment_status, paymentDate: t.payment_date, claimant: t.claimant_name, department: t.claimant_department } : undefined,
      tx: { id: t.id, type: t.type === "expense" ? "expense" : "top_up", claimant: t.claimant_name ?? "", department: t.claimant_department ?? "", category: t.category ?? "", description: t.description ?? "", companyId: t.company_id, sharedCompanyIds: t.shared_company_ids ?? [] },
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created));

  // balance after each row, per company (the money of each company is kept apart)
  const running = new Map<string, number>();
  const withBalance = rows.map((r) => {
    const next = (running.get(r.companyId) ?? 0) + (r.kind === "in" ? r.amount : -r.amount);
    running.set(r.companyId, next);
    return { ...r, balance: next };
  });
  const balanceByCompany = companies.filter((c) => running.has(c.id)).map((c) => ({ name: c.name, balance: running.get(c.id) ?? 0 }));
  const totalBalance = Array.from(running.values()).reduce((t, v) => t + v, 0);

  const thisMonth = todayInMalaysia().slice(0, 7);
  const months = Array.from(new Set([thisMonth, ...rows.map((r) => r.date.slice(0, 7))])).sort().reverse();
  const month = sp.month === "all" ? "all" : sp.month && MONTH_RE.test(sp.month) ? sp.month : thisMonth;
  const inMonth = withBalance.filter((r) => month === "all" || r.date.startsWith(month));
  const claimsInMonth = inMonth.filter((r) => r.source === "claim" && r.claim);
  const summary = summarizePettyCashClaims(claimsInMonth.map((r) => ({ amount: r.amount, payment_status: r.claim!.status })));
  const overdueCount = claimsInMonth.filter((r) => isPettyCashOverdue(r.date, r.claim!.status)).length;
  const statusParam = sp.status === "pending_payment" || sp.status === "paid" ? sp.status : undefined;
  const shown = (statusParam ? inMonth.filter((r) => r.claim?.status === statusParam) : inMonth).slice().reverse();

  const overview = buildOverview(
    rows.map((r) => ({ date: r.date, kind: r.kind, amount: r.amount, category: r.category })),
    month,
    thisMonth,
  );

  const editing = sp.edit ? book.find((e) => e.id === sp.edit) : undefined;
  const editingRow: OperationPettyCashRow | undefined = editing
    ? { id: editing.id, company_id: editing.company_id, entry_type: editing.entry_type as EntryType, entry_date: editing.entry_date, category: editing.category, description: editing.description, amount: Number(editing.amount), document_id: editing.document_id, created_by: editing.created_by, person_name: editing.person_name, person_position: editing.person_position, payment_method: editing.payment_method, shared_company_ids: editing.shared_company_ids ?? [] }
    : undefined;

  const keep = new URLSearchParams({ ...(sp.company ? { company: sp.company } : {}), holder: who.name, position: who.position, month, ...(everyone ? { all: "1" } : {}) });
  const listHref = `/spending/petty-cash?${keep.toString()}`;
  const editHref = (id: string) => `${listHref}${statusParam ? `&status=${statusParam}` : ""}&edit=${id}`;
  const statusHref = (status?: string) => `${listHref}${status ? `&status=${status}` : ""}`;

  const exportHeaders = ["Date", "Company", "Kind", "Category", "Payment received by", "Details", "Name / position", "Claimant", "Claim status", "Received (RM)", "Spent (RM)", "Balance (RM)"];
  const exportRows = [...shown].reverse().map((r): (string | number)[] => [
    r.date,
    r.companyName,
    r.source === "claim" ? "Staff claim" : r.kind === "in" ? "Received" : "Spent",
    r.category ?? "",
    r.method ? (PAYMENT_METHOD_LABEL[r.method as PaymentMethod] ?? r.method) : "",
    r.title,
    r.person,
    r.claim?.claimant ?? "",
    r.claim ? (PETTY_CASH_PAYMENT_STATUS_LABEL[r.claim.status] ?? r.claim.status) : "",
    r.kind === "in" ? r.amount : "",
    r.kind === "out" ? r.amount : "",
    r.balance,
  ]);

  return (
    <SoftPage>
      <SoftHeader title="Petty Cash" subtitle="Money received, what was spent and what staff claimed, for one person's petty cash" />

      <SpendingSubNav hideFinance={!canClaims} />
      <UndoBanner />

      {overdueCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-bg px-4 py-3">
          <span className="text-lg">🔴</span>
          <div className="text-[13px] font-semibold text-danger">
            {`Petty cash claims overdue for payment: ${overdueCount} (pending more than ${PETTY_CASH_OVERDUE_DAYS} days) — please review and pay.`}
          </div>
        </div>
      )}

      <PettyCashHolderBar holders={holders} holder={who.name} position={who.position} month={month} months={months} hidden={{ company: sp.company ?? "", status: statusParam ?? "" }} lockName={!seeAll} canSeeAll={seeAll} everyone={everyone}>
        {shownScope && (
          <span>
            {everyone ? "Everyone's balance" : <>Balance of {who.name}</>}: <strong className={totalBalance < 0 ? "text-danger" : "text-text"}>{formatPrice(totalBalance)}</strong>
            {summary.pendingCount > 0 && <span>{` · claims still to be paid: ${summary.pendingCount} (${formatPrice(summary.totalPendingAmount)})`}</span>}
          </span>
        )}
      </PettyCashHolderBar>

      {!shownScope && <EmptyRow text="Choose your name and position above to see your own petty cash." />}

      {shownScope && <PettyCashOverview overview={overview} periodLabel={month === "all" ? "All time" : month} />}

      {shownScope && balanceByCompany.length > 1 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-text-secondary">
          {balanceByCompany.map((b) => (
            <span key={b.name}>
              {b.name}: <strong className={b.balance < 0 ? "text-danger" : "text-text"}>{formatPrice(b.balance)}</strong>
            </span>
          ))}
        </div>
      )}

      {who.name && !everyone && (
        <PettyCashEntryForm
          key={editing?.id ?? "new"}
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          editing={editingRow}
          listHref={listHref}
          people={people}
          holders={holders}
          claimPayers={payers.map((p) => ({ name: p.name, position: holders.find((h) => h.name === p.name)?.position ?? p.position }))}
          holderName={who.name}
          holderPosition={who.position}
          allowBook={isHolder}
          allowClaim={canClaims && !editing}
          allowPayClaims={canClaims && seeAll}
          pendingClaims={rows
            .filter((r) => r.claim?.status === "pending_payment")
            .map((r) => ({ id: r.claim!.id, label: `${r.claim!.claimant ?? "—"} · ${r.title} · RM ${r.amount.toFixed(2)} · ${r.date} · ${r.companyName}`, claimant: r.claim!.claimant ?? "—", amount: r.amount, date: r.date, description: r.title, companyName: r.companyName }))}
          lockName={!seeAll}
        />
      )}

      {shownScope && (
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div className="text-[15px] font-bold text-text">Petty cash records</div>
            <div className="flex flex-wrap items-center gap-3">
              {canClaims && (
                <div className="flex gap-1">
                  <Link href={statusHref()} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${!statusParam ? "bg-primary text-white" : "text-text-secondary hover:bg-bg"}`}>
                    All
                  </Link>
                  <Link href={statusHref("pending_payment")} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${statusParam === "pending_payment" ? "bg-primary text-white" : "text-text-secondary hover:bg-bg"}`}>
                    Claims pending payment
                  </Link>
                  <Link href={statusHref("paid")} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${statusParam === "paid" ? "bg-primary text-white" : "text-text-secondary hover:bg-bg"}`}>
                    Claims paid
                  </Link>
                </div>
              )}
              <ExportListButtons filenameBase={`petty-cash-${month}`} headers={exportHeaders} rows={exportRows} />
            </div>
          </div>

          {shown.length === 0 ? (
            <EmptyRow text="No petty cash records for this month yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead className="bg-surface-alt">
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Company</th>
                    <th className="px-4 py-2.5">Details</th>
                    <th className="px-4 py-2.5 text-right">Received</th>
                    <th className="px-4 py-2.5 text-right">Spent</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                    <th className="px-4 py-2.5">Claim status</th>
                    <th className="px-4 py-2.5">Receipt</th>
                    <th className="px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const overdue = r.claim ? isPettyCashOverdue(r.date, r.claim.status) : false;
                    const days = r.claim?.status === "pending_payment" ? pettyCashDaysPending(r.date) : null;
                    return (
                      <tr key={r.key} className="border-t border-border align-top text-[13px]">
                        <td className="px-4 py-2.5 text-text-secondary">{dayLabel(r.date)}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{r.companyName}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-text">{r.title}</div>
                          {r.category && <div className="text-[11.5px] text-text-muted">{r.category}</div>}
                          {r.method && (
                            <div className="flex gap-1 text-[11.5px] font-semibold text-text-secondary">
                              <span>Payment received by:</span> <span>{PAYMENT_METHOD_LABEL[r.method as PaymentMethod] ?? r.method}</span>
                            </div>
                          )}
                          {r.claim && (
                            <div className="text-[11.5px] text-text-secondary">{`Claimed by: ${[r.claim.claimant, r.claim.department].filter(Boolean).join(" · ") || "—"}`}</div>
                          )}
                          {r.person && <div className="text-[11.5px] text-text-secondary">{`${r.kind === "in" ? "Received by" : r.claim ? "Paid from the petty cash of" : "Spent by"}: ${r.person}`}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-success">{r.kind === "in" ? formatPrice(r.amount) : ""}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-text">{r.kind === "out" ? formatPrice(r.amount) : ""}</td>
                        <td className={`px-4 py-2.5 text-right ${r.balance < 0 ? "font-semibold text-danger" : "text-text-secondary"}`}>{formatPrice(r.balance)}</td>
                        <td className="px-4 py-2.5">
                          {r.claim ? (
                            <>
                              <StatusBadge tone={r.claim.status === "paid" ? "success" : overdue ? "danger" : "warning"}>
                                {overdue ? "🔴 " : r.claim.status === "paid" ? "🟢 " : "🟡 "}
                                {PETTY_CASH_PAYMENT_STATUS_LABEL[r.claim.status] ?? r.claim.status}
                              </StatusBadge>
                              {days !== null && <div className={`mt-1 text-[11px] ${overdue ? "font-semibold text-danger" : "text-text-muted"}`}>{days} day{days === 1 ? "" : "s"} pending</div>}
                              {r.claim.paymentDate && <div className="mt-1 text-[11px] text-text-muted">{dayLabel(r.claim.paymentDate)}</div>}
                            </>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">{r.documentId ? <DocumentViewLink documentId={r.documentId} /> : <span className="text-text-muted">—</span>}</td>
                        <td className="px-4 py-2.5">
                          {r.bookId ? (
                            <OperationPettyCashRowActions id={r.bookId} editHref={editHref(r.bookId)} />
                          ) : (
                            <div className="flex flex-col items-start gap-1.5">
                              {r.claim && (seeAll ? <PettyCashPaymentAction transactionId={r.claim.id} paymentStatus={r.claim.status} /> : <span className="text-[12px] text-text-muted">—</span>)}
                              {r.tx && <PettyCashClaimActions claim={{ ...r.tx, amount: String(r.amount), date: r.date }} companies={companies} />}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </SoftPage>
  );
}

/** The cash book entries of one person (read only for the people who hold a petty cash; the database enforces it too). */
async function readBook(supabase: Awaited<ReturnType<typeof createClient>>, companyIds: string[], pattern: string) {
  let query = supabase.from("operation_petty_cash").select("*, companies(name)").in("company_id", companyIds);
  if (pattern) query = query.ilike("person_name", pattern);
  const { data, error } = await query.order("entry_date", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
