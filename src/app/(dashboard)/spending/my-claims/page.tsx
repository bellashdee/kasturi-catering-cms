import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { canAccessModule } from "@/lib/modules";
import { pettyCashAccess } from "@/lib/pettyCash/access";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimPayers } from "@/lib/pettyCash/access";
import { loadPersonOptions, shortNameIn } from "@/lib/pettyCash/people";
import { createClient } from "@/lib/supabase/server";
import { formatMalaysiaDate, formatPrice, todayInMalaysia } from "@/lib/format";
import { PETTY_CASH_PAYMENT_STATUS_LABEL } from "@/lib/finance/constants";
import { paymentMethodLabel } from "@/lib/operationPettyCash/constants";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { ExportListButtons } from "@/components/procurement/ExportListButtons";
import { receiptIds } from "@/lib/documents/receipts";
import { formatRm, spendSummary, spentByCompany } from "@/lib/pettyCash/summary";
import { MyClaimActions, MyClaimForm } from "@/components/claims/MyClaims";

const MONTH_RE = /^\d{4}-\d{2}$/;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (ym: string) => (ym === "all" ? "All months" : `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`);

/**
 * My Claims: any staff member claims back, from Penny Chan or Nabilah, what they bought with their own money, and sees the history of
 * their purchases like the Petty Cash: by month, with the totals (claimed, paid, waiting) and the spending of each company, to export or
 * print. A person sees and works on only their own claims (the staff have no access to the petty cash records themselves, so this page
 * reads them with the service role and keeps to the claims the person made).
 */
export default async function MyClaimsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const sp = await searchParams;

  const admin = createAdminClient();
  const supabase = await createClient();
  const [{ data: records }, { data: companyRows }, payers, people, access] = await Promise.all([
    admin.from("employees").select("company_id").eq("user_id", session.userId).eq("status", "active"),
    admin.from("companies").select("id, name").order("name"),
    claimPayers(),
    loadPersonOptions(supabase),
    pettyCashAccess(supabase, session.userId),
  ]);
  const hasFinance = canAccessModule(session.allowedModules, "finance-admin");
  const ownCompanyIds = Array.from(new Set((records ?? []).map((r) => r.company_id)));
  const allCompanies = companyRows ?? [];
  // a claim can be for any of the companies (the bill is chosen under the company it belongs to), once the staff record is linked
  const companies = ownCompanyIds.length > 0 ? allCompanies : [];
  // the position shown for Penny Chan / Nabilah is the one on the list of petty cash holders
  const payerList = payers.map((p) => ({ name: p.name, position: people.find((x) => x.name === p.name)?.position ?? p.position }));
  const short = shortNameIn(people);

  const { data: claims } = await admin.from("petty_cash_transactions").select("*").eq("created_by", session.userId).eq("type", "expense").order("transaction_date", { ascending: false }).order("created_at", { ascending: false });
  const all = claims ?? [];

  // the history by month (all months by default), like the Petty Cash
  const thisMonth = todayInMalaysia().slice(0, 7);
  const months = Array.from(new Set([thisMonth, ...all.map((c) => c.transaction_date.slice(0, 7))])).sort().reverse();
  const month = sp.month && (sp.month === "all" || MONTH_RE.test(sp.month)) ? sp.month : "all";
  const shown = all.filter((c) => month === "all" || c.transaction_date.startsWith(month));

  const sum = (list: typeof all) => list.reduce((t, c) => t + Number(c.amount), 0);
  const paid = shown.filter((c) => c.payment_status === "paid");
  const waiting = shown.filter((c) => c.payment_status !== "paid");
  const spent = shown.map((c) => ({ companyId: c.company_id, amount: Number(c.amount) }));
  const byCompany = spentByCompany(spent, allCompanies);
  const companyLabel = (c: (typeof all)[number]) =>
    [c.company_id, ...(c.shared_company_ids ?? [])].map((id) => allCompanies.find((x) => x.id === id)?.name).filter(Boolean).join(" + ");

  const exportHeaders = ["Date", "Company", "Category", "What you bought", "Remarks", "Claim from", "You paid by", "Status", "Payment date", "Amount (RM)"];
  const exportRows = shown.map((c): (string | number)[] => [
    c.transaction_date,
    companyLabel(c),
    c.category ?? "",
    c.description ?? "",
    c.remarks ?? "",
    short(c.person_name),
    paymentMethodLabel(c.payment_method),
    PETTY_CASH_PAYMENT_STATUS_LABEL[c.payment_status] ?? c.payment_status,
    c.payment_date ?? "",
    Math.round(Number(c.amount) * 100) / 100,
  ]);
  const summary = spendSummary(spent, allCompanies, {
    totalLabel: "Total claimed (money spent)",
    after: [
      { label: "Paid", value: formatRm(sum(paid)) },
      { label: "Waiting for payment", value: formatRm(sum(waiting)), bold: true },
    ],
  });

  return (
    <SoftPage>
      <SoftHeader title="My Claims" subtitle="Claim back what you bought for the company with your own money" />
      <SpendingSubNav hideFinance={!hasFinance} hidePettyCash={!hasFinance && !access.isHolder} />

      {companies.length === 0 ? (
        <EmptyRow text="Your staff record is not linked to your login yet. Please ask the HR admin to link it, then you can send your claims here." />
      ) : (
        <SectionCard title="New claim">
          <MyClaimForm companies={companies} payers={payerList} />
        </SectionCard>
      )}

      <form method="get" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface px-5 py-3.5">
        <label className="text-[12px] font-bold uppercase tracking-wide text-text-muted" htmlFor="mc-month">
          History of
        </label>
        <select id="mc-month" name="month" defaultValue={month} className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13.5px] font-semibold">
          <option value="all">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">
          Show
        </button>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total claimed", value: sum(shown), sub: `${shown.length} claim${shown.length === 1 ? "" : "s"} · ${monthLabel(month)}`, colour: "var(--color-danger)" },
          { label: "Paid", value: sum(paid), sub: `${paid.length} paid`, colour: "var(--color-success)" },
          { label: "Waiting for payment", value: sum(waiting), sub: `${waiting.length} waiting`, colour: "var(--color-warning, #b7791f)" },
        ].map((t) => (
          <div key={t.label} className="overflow-hidden rounded-2xl border border-border bg-surface text-center shadow-sm">
            <div className="h-1.5" style={{ background: t.colour }} />
            <div className="px-4 py-3.5">
              <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{t.label}</div>
              <div className="mt-1 text-[24px] font-extrabold leading-tight tabular-nums" style={{ color: t.colour }}>{formatPrice(t.value)}</div>
              <div className="mt-0.5 text-[12px] text-text-secondary">{t.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {byCompany.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-text-secondary">
          <span>{`Spent by each company (${monthLabel(month)}):`}</span>
          {byCompany.map((b) => (
            <span key={b.name}>
              {b.name}: <strong className="text-text">{formatPrice(b.amount)}</strong>
            </span>
          ))}
        </div>
      )}

      <SectionCard
        title="My claims"
        action={<ExportListButtons filenameBase={`my-claims-${month}`} headers={exportHeaders} rows={exportRows} moneyColumns={["Amount (RM)"]} summary={summary} />}
      >
        {shown.length === 0 ? (
          <EmptyRow text={all.length === 0 ? "You have not sent any claim yet." : "No claim in this month."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="text-[11.5px] font-semibold uppercase text-text-muted">
                  <th className="whitespace-nowrap px-3 py-2">Date</th>
                  <th className="px-3 py-2">What you bought</th>
                  <th className="whitespace-nowrap px-3 py-2">Claim from</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Amount</th>
                  <th className="whitespace-nowrap px-3 py-2">Status</th>
                  <th className="whitespace-nowrap px-3 py-2">Receipt</th>
                  <th className="whitespace-nowrap px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const isPaid = c.payment_status === "paid";
                  return (
                    <tr key={c.id} className="border-t border-border align-top text-[13px]">
                      <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{formatMalaysiaDate(c.transaction_date)}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-text">{c.description || "—"}</div>
                        {c.category && <div className="text-[11.5px] text-text-muted">{c.category}</div>}
                        <div className="text-[11.5px] text-text-muted">{companyLabel(c)}</div>
                        {c.remarks && <div className="text-[11.5px] text-text-secondary">{`Remarks: ${c.remarks}`}</div>}
                        {c.payment_method && <div className="text-[11.5px] text-text-secondary">{`You paid by: ${paymentMethodLabel(c.payment_method)}`}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{short(c.person_name) || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-text">{formatPrice(Number(c.amount))}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <StatusBadge tone={isPaid ? "success" : "warning"}>
                          {isPaid ? "🟢 " : "🟡 "}
                          {PETTY_CASH_PAYMENT_STATUS_LABEL[c.payment_status] ?? c.payment_status}
                        </StatusBadge>
                        {isPaid && c.payment_date && <div className="mt-1 text-[11px] text-text-muted">{formatMalaysiaDate(c.payment_date)}</div>}
                        {isPaid && c.payment_reference && <div className="text-[11px] text-text-muted">{`Reference ID: ${c.payment_reference}`}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {receiptIds(c).length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {receiptIds(c).map((id, i, ids) => (
                              <DocumentViewLink key={id} documentId={id} label={ids.length > 1 ? `📷 View ${i + 1}` : "📷 View"} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <MyClaimActions
                          claim={{ id: c.id, companyId: c.company_id, date: c.transaction_date, amount: String(c.amount), amountText: Number(c.amount).toFixed(2), payer: c.person_name ?? "", paymentMethod: c.payment_method ?? "", category: c.category ?? "", description: c.description ?? "", remarks: c.remarks ?? "", hasReceipt: receiptIds(c).length > 0 }}
                          companies={companies}
                          payers={payerList}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </SoftPage>
  );
}
