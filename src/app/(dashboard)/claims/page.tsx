import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
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

const STEPS = [
  "Buy what the company needs with your own money first, and keep the receipt (or take a photo of it).",
  "Open My Claims on the left (this page). Choose the company you work for, the date you bought it and the amount you paid, exactly as on the receipt.",
  "Under Claim from, choose Penny Chan or Nabilah: the one who will pay you back.",
  "Choose the category and write what you bought (for example: cooking gas for the Ahmad wedding). You can choose more than one category.",
  "Attach the photo of the receipt, then press Send claim.",
  "Your claim shows below as Pending Payment. Penny Chan or Nabilah is told, checks it and pays you. When it is paid, the status changes to Paid with the payment date and the Reference ID.",
  "Made a mistake? Press Edit or Delete on your claim while it is still Pending Payment. A claim that is already paid cannot be changed.",
];

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
  const [{ data: records }, { data: companyRows }, payers, people] = await Promise.all([
    admin.from("employees").select("company_id").eq("user_id", session.userId).eq("status", "active"),
    admin.from("companies").select("id, name").order("name"),
    claimPayers(),
    loadPersonOptions(supabase),
  ]);
  const ownCompanyIds = Array.from(new Set((records ?? []).map((r) => r.company_id)));
  const companies = (companyRows ?? []).filter((c) => ownCompanyIds.includes(c.id));
  // the position shown for Penny Chan / Nabilah is the one on the list of petty cash holders
  const payerList = payers.map((p) => ({ name: p.name, position: people.find((x) => x.name === p.name)?.position ?? p.position }));

  const { data: claims } = await admin.from("petty_cash_transactions").select("*").eq("created_by", session.userId).eq("type", "expense").order("transaction_date", { ascending: false }).order("created_at", { ascending: false });

  const pending = (claims ?? []).filter((c) => c.payment_status !== "paid");
  const pendingTotal = pending.reduce((t, c) => t + Number(c.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-[20px] font-extrabold text-text">My Claims</div>
        <div className="mt-0.5 text-[13px] text-text-secondary">Claim back what you bought for the company with your own money.</div>
      </div>

      <details open className="rounded-2xl border border-border bg-surface shadow-sm">
        <summary className="cursor-pointer px-5 py-3.5 text-[15px] font-bold text-text">How to claim (step by step)</summary>
        <ol className="flex flex-col gap-2 border-t border-border px-5 py-4 text-[13.5px] text-text-secondary">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-white">{i + 1}</span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </details>

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
    </div>
  );
}
