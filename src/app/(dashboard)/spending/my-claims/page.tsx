import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { canAccessModule } from "@/lib/modules";
import { pettyCashAccess } from "@/lib/pettyCash/access";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";
import { SpendingSubNav } from "@/components/spending/SpendingSubNav";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimPayers } from "@/lib/pettyCash/access";
import { loadPersonOptions } from "@/lib/pettyCash/people";
import { createClient } from "@/lib/supabase/server";
import { formatMalaysiaDate, formatPrice } from "@/lib/format";
import { PETTY_CASH_PAYMENT_STATUS_LABEL } from "@/lib/finance/constants";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { MyClaimActions, MyClaimForm } from "@/components/claims/MyClaims";


/**
 * My Claims: any staff member claims back, from Penny Chan or Nabilah, what they bought with their own money. A person sees and works on
 * only their own claims (the staff have no access to the petty cash records themselves, so this page reads them with the service role
 * and keeps to the claims the person made).
 */
export default async function MyClaimsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

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
  const companies = (companyRows ?? []).filter((c) => ownCompanyIds.includes(c.id));
  // the position shown for Penny Chan / Nabilah is the one on the list of petty cash holders
  const payerList = payers.map((p) => ({ name: p.name, position: people.find((x) => x.name === p.name)?.position ?? p.position }));

  const { data: claims } = await admin.from("petty_cash_transactions").select("*").eq("created_by", session.userId).eq("type", "expense").order("transaction_date", { ascending: false }).order("created_at", { ascending: false });

  const pending = (claims ?? []).filter((c) => c.payment_status !== "paid");
  const pendingTotal = pending.reduce((t, c) => t + Number(c.amount), 0);

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

      <SectionCard
        title="My claims"
        action={pending.length > 0 ? <span className="text-[12.5px] font-semibold text-text-secondary">{`Waiting for payment: ${pending.length} (${formatPrice(pendingTotal)})`}</span> : undefined}
      >
        {(claims ?? []).length === 0 ? (
          <EmptyRow text="You have not sent any claim yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="text-[11.5px] font-semibold uppercase text-text-muted">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">What you bought</th>
                  <th className="px-3 py-2">Claim from</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Receipt</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(claims ?? []).map((c) => {
                  const paid = c.payment_status === "paid";
                  return (
                    <tr key={c.id} className="border-t border-border align-top text-[13px]">
                      <td className="px-3 py-2.5 text-text-secondary">{formatMalaysiaDate(c.transaction_date)}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-text">{c.description || "—"}</div>
                        {c.category && <div className="text-[11.5px] text-text-muted">{c.category}</div>}
                        <div className="text-[11.5px] text-text-muted">{companies.find((x) => x.id === c.company_id)?.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">{c.person_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-text">{formatPrice(Number(c.amount))}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={paid ? "success" : "warning"}>
                          {paid ? "🟢 " : "🟡 "}
                          {PETTY_CASH_PAYMENT_STATUS_LABEL[c.payment_status] ?? c.payment_status}
                        </StatusBadge>
                        {paid && c.payment_date && <div className="mt-1 text-[11px] text-text-muted">{formatMalaysiaDate(c.payment_date)}</div>}
                        {paid && c.payment_reference && <div className="text-[11px] text-text-muted">{`Reference ID: ${c.payment_reference}`}</div>}
                      </td>
                      <td className="px-3 py-2.5">{c.document_id ? <DocumentViewLink documentId={c.document_id} /> : <span className="text-text-muted">—</span>}</td>
                      <td className="px-3 py-2.5">
                        {paid ? (
                          <span className="text-[12px] text-text-muted">—</span>
                        ) : (
                          <MyClaimActions
                            claim={{ id: c.id, companyId: c.company_id, date: c.transaction_date, amount: String(c.amount), amountText: Number(c.amount).toFixed(2), payer: c.person_name ?? "", category: c.category ?? "", description: c.description ?? "", hasReceipt: !!c.document_id }}
                            companies={companies}
                            payers={payerList}
                          />
                        )}
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
