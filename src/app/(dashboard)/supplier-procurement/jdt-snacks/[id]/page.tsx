import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { StatusBadge } from "@/components/StatusBadge";
import { AddSnackItem, DeletePurchaseButton, ReceiptButton, RecordPurchaseForm, SnackItemRowEditor, SnackRequestDetails, SnackStatusSelect, UnitsList } from "@/components/snack/SnackControls";
import { SNACK_STATUS_LABEL, SNACK_STATUS_TONE } from "@/lib/snack/constants";
import { canHandleSnacks, listSnackPurchases, loadSnackRequest } from "@/lib/snack/queries";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { formatMalaysiaDate, formatMalaysiaDateTime, formatTime12 } from "@/lib/format";

const d = (iso: string | null) => (iso ? formatMalaysiaDate(`${iso}T12:00:00+08:00`) : "Pending");

/** One JDT training snack request: the items JDT asked for, what Purchasing bought (with receipts), and its status. */
export default async function JdtSnackRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { id } = await params;
  const { company } = await searchParams;
  const query = company ? `?company=${company}` : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const r = await loadSnackRequest(supabase, id);
  if (!r) notFound();
  const handler = await canHandleSnacks(supabase);
  const purchases = handler ? await listSnackPurchases(supabase, id) : [];
  // the original WhatsApp message (readable by Admin / Management only)
  const wa = r.whatsapp_import_id ? ((await untyped(supabase).from("whatsapp_imports").select("id, original_message, imported_at").eq("id", r.whatsapp_import_id).maybeSingle()).data as { id: string; original_message: string; imported_at: string } | null) : null;
  const spent = purchases.reduce((t, p) => t + Number(p.total_price), 0);
  const items = r.jdt_snack_items.map((i) => {
    const mine = purchases.filter((p) => p.item_id === i.id);
    return { ...i, purchasedQty: mine.reduce((t, p) => t + Number(p.quantity ?? 0), 0), spent: handler ? mine.reduce((t, p) => t + Number(p.total_price), 0) : null };
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/supplier-procurement/jdt-snacks${query}`} className="text-[12.5px] font-semibold text-text-secondary">
          ← JDT Training &amp; Snack Requests
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-extrabold text-text">{`${r.team} · training ${d(r.training_date)}`}</h1>
          <StatusBadge tone={SNACK_STATUS_TONE[r.status] ?? "neutral"}>{SNACK_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
          {handler && <SnackStatusSelect id={r.id} status={r.status} />}
        </div>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {[r.request_code, "Signature Solution Sdn Bhd", "Training Snack / Refreshment", r.date_text ? `written as "${r.date_text}"` : "", r.delivery_time ? `delivery ${formatTime12(r.delivery_time.slice(0, 5))}` : "delivery time not provided", r.delivery_location ?? "", r.delivered_at ? `delivered ${formatMalaysiaDateTime(r.delivered_at)}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <SupplierProcurementSubNav />
      <UnitsList />

      {wa && (
        <details className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <summary className="cursor-pointer text-[13px] font-extrabold uppercase tracking-wide text-text-muted">{`Original WhatsApp message (imported ${formatMalaysiaDateTime(wa.imported_at)})`}</summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 text-[13px] text-text">{wa.original_message}</pre>
        </details>
      )}

      {handler ? (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-2 text-[15px] font-extrabold text-text">Training &amp; delivery</h2>
          <SnackRequestDetails id={r.id} trainingDate={r.training_date} needsCheck={r.date_needs_check} deliveryTime={r.delivery_time} deliveryLocation={r.delivery_location} remarks={r.remarks} />
        </section>
      ) : (
        r.remarks && <div className="rounded-xl border border-border bg-surface p-4 text-[13px] text-text shadow-sm">{r.remarks}</div>
      )}

      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-extrabold text-text">Items requested</h2>
          <span className="text-[12.5px] text-text-secondary">Names as JDT wrote them. A quantity not given stays Pending.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Bought</th>
                {handler && <th className="px-3 py-2">Spent</th>}
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => (
                <SnackItemRowEditor key={i.id} requestId={r.id} item={i} canEdit={handler} showMoney={handler} />
              ))}
            </tbody>
          </table>
        </div>
        {handler && (
          <div className="border-t border-border px-4 py-3">
            <AddSnackItem requestId={r.id} />
          </div>
        )}
      </section>

      {handler && (
        <section className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[15px] font-extrabold text-text">Purchases</h2>
              <p className="text-[12px] text-text-secondary">{`RM${spent.toFixed(2)} spent on this request · taken off the JDT II Snack Fund, never added to an event P&L.`}</p>
            </div>
            <RecordPurchaseForm requestId={r.id} trainingDate={r.training_date} items={r.jdt_snack_items.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))} />
          </div>
          {purchases.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-text-muted">Nothing recorded yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {purchases.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <div>
                    <div className="font-semibold text-text">{`${p.description}${p.quantity ? ` · ${p.quantity} ${p.unit ?? ""}` : ""}`}</div>
                    <div className="text-[12px] text-text-muted">{[d(p.purchase_date), p.supplier, p.unit_price !== null ? `RM${Number(p.unit_price).toFixed(2)} each` : "", p.payment_method, p.remarks].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-text">{`RM${Number(p.total_price).toFixed(2)}`}</span>
                    {p.receipt_path ? <ReceiptButton purchaseId={p.id} /> : <span className="text-[12px] text-text-muted">no receipt</span>}
                    <DeletePurchaseButton id={p.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
