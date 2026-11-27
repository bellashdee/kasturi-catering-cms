import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { SnackFundCard } from "@/components/snack/SnackFundCard";
import { RecordPurchaseForm, ReceiptButton, DeletePurchaseButton, UnitsList } from "@/components/snack/SnackControls";
import { SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";
import { SNACK_OPEN_STATUSES, SNACK_STATUS_LABEL, SNACK_STATUS_TONE } from "@/lib/snack/constants";
import { canHandleSnacks, listSnackPurchases, listSnackRequests, loadSnackFund } from "@/lib/snack/queries";
import { formatMalaysiaDate, formatTime12 } from "@/lib/format";

const d = (iso: string | null) => (iso ? formatMalaysiaDate(`${iso}T12:00:00+08:00`) : "Pending");

/** JDT TRAINING & SNACK REQUESTS (Signature Solution): what JDT II asked for, what Purchasing bought, and the JDT II Snack Fund. */
export default async function JdtSnacksPage({ searchParams }: { searchParams: Promise<{ company?: string; show?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name");
  const sp = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies ?? [], sp.company);
  const query = sp.company ? `?company=${sp.company}` : "";
  const header = (
    <>
      <div>
        <h1 className="text-[22px] font-extrabold text-text">JDT Training &amp; Snack Requests</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Signature Solution Sdn Bhd · JDT II training snacks and refreshments, what was bought, and the JDT II Snack Fund (RM500, one time only).</p>
      </div>
      <SupplierProcurementSubNav />
    </>
  );
  if (!accessibleIds.includes(SIGNATURE_COMPANY_ID)) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="This is for Signature Solution Sdn Bhd, and you do not have access to it." />
      </div>
    );
  }

  const handler = await canHandleSnacks(supabase);
  const { data: isMgmt } = await supabase.rpc("user_is_company_admin", { target_company_id: SIGNATURE_COMPANY_ID });
  const [requests, fund, purchases] = await Promise.all([listSnackRequests(supabase), handler ? loadSnackFund(supabase) : null, handler ? listSnackPurchases(supabase) : []]);
  const showAll = sp.show === "all";
  const shown = showAll ? requests : requests.filter((r) => SNACK_OPEN_STATUSES.includes(r.status) || r.status === "delivered");
  const spentBy = new Map<string, number>();
  for (const p of purchases) if (p.request_id) spentBy.set(p.request_id, (spentBy.get(p.request_id) ?? 0) + Number(p.total_price));

  return (
    <div className="flex flex-col gap-5">
      {header}
      <UnitsList />

      {fund && <SnackFundCard fund={fund} canManage={handler} isManagement={isMgmt === true} />}

      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-[15px] font-extrabold text-text">Requests</h2>
            <p className="text-[12px] text-text-secondary">New requests come from the WhatsApp import (Catering → Quotation Request Inbox → Import from WhatsApp).</p>
          </div>
          <Link href={`/supplier-procurement/jdt-snacks${showAll ? query : `${query ? `${query}&` : "?"}show=all`}`} className="text-[13px] font-semibold text-primary hover:underline">
            {showAll ? "Show open requests only" : "Show all (incl. completed / cancelled)"}
          </Link>
        </div>
        {shown.length === 0 ? (
          <div className="px-4 py-4 text-[13px] text-text-muted">No open snack request.</div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((r) => {
              const items = r.jdt_snack_items;
              const bought = items.filter((i) => i.item_status === "purchased" || i.item_status === "substituted").length;
              const pendingQty = items.filter((i) => !i.requested_qty).length;
              return (
                <li key={r.id}>
                  <Link href={`/supplier-procurement/jdt-snacks/${r.id}${query}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-alt">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-bold text-text">{`${r.team} · training ${d(r.training_date)}`}</span>
                        {r.date_needs_check && <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-[11px] font-bold text-yellow-900">! check the year</span>}
                        <StatusBadge tone={SNACK_STATUS_TONE[r.status] ?? "neutral"}>{SNACK_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px] text-text-secondary">
                        {`${r.request_code ?? ""} · ${items.length} item(s): ${items.map((i) => i.name).join(", ")}`}
                      </div>
                      <div className="text-[12px] text-text-muted">
                        {[`${bought}/${items.length} bought`, pendingQty > 0 ? `${pendingQty} quantity pending` : "", r.delivery_time ? `deliver ${formatTime12(r.delivery_time.slice(0, 5))}` : "", r.delivery_location ?? ""].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {handler && <div className="text-[13px] font-bold text-text">{spentBy.get(r.id) ? `RM${spentBy.get(r.id)!.toFixed(2)}` : ""}</div>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {handler && (
        <section className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[15px] font-extrabold text-text">All snack purchases (fund expenses)</h2>
              <p className="text-[12px] text-text-secondary">Each purchase is taken off the JDT II Snack Fund. Record one here when it is not for a particular request.</p>
            </div>
            <RecordPurchaseForm requestId={null} trainingDate={null} items={[]} />
          </div>
          {purchases.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-text-muted">No purchase recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Payment</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-3 py-2">{d(p.purchase_date)}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-text">{p.description}</div>
                        {p.remarks && <div className="text-[12px] text-text-muted">{p.remarks}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{p.quantity ? `${p.quantity} ${p.unit ?? ""}` : "—"}</td>
                      <td className="px-3 py-2">{p.supplier ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{p.unit_price !== null ? `RM${Number(p.unit_price).toFixed(2)}` : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold">{`RM${Number(p.total_price).toFixed(2)}`}</td>
                      <td className="px-3 py-2">{p.payment_method ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="flex gap-2">
                          {p.receipt_path && <ReceiptButton purchaseId={p.id} />}
                          {p.request_id && (
                            <Link href={`/supplier-procurement/jdt-snacks/${p.request_id}${query}`} className="text-[12.5px] font-semibold text-primary hover:underline">
                              Request
                            </Link>
                          )}
                          <DeletePurchaseButton id={p.id} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
