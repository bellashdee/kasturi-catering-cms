import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getPurchaseOrder } from "@/lib/procurement/queries";
import { PO_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency, formatPrice } from "@/lib/format";
import { PurchaseOrderStatusSelect } from "@/components/procurement/PurchaseOrderStatusSelect";
import { DeletePurchaseOrderButton } from "@/components/procurement/DeletePurchaseOrderButton";
import { SectionCard } from "@/components/dashboard/SectionCard";

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();

  let po;
  try {
    po = await getPurchaseOrder(supabase, id);
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/supplier-procurement/orders${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Purchase Orders
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{po.po_number}</div>
          <div className="text-[13px] text-text-secondary">
            {po.companies?.name} · {po.suppliers?.name} · {po.order_date}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <PurchaseOrderStatusSelect poId={id} status={po.status} />
          <DeletePurchaseOrderButton poId={id} poNumber={po.po_number} listHref={`/supplier-procurement/orders${query}`} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(Number(po.total_amount))}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Items</div>
          <div className="mt-1 text-xl font-extrabold text-text">{po.purchase_order_items?.length ?? 0}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</div>
          <div className="mt-1 text-xl font-extrabold text-text">{PO_STATUS_LABEL[po.status] ?? po.status}</div>
        </div>
      </div>

      <SectionCard title="Items" action={<Link href={`/supplier-procurement/invoices/new?po=${id}${query.replace("?", "&")}`} className="text-[12.5px] font-semibold text-primary">+ Record Invoice for this PO</Link>}>
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12.5px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3">Item</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3">Unit</th>
                <th className="px-3 py-3 text-right">Unit price (RM)</th>
                <th className="px-5 py-3 text-right">Total price (RM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {po.purchase_order_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 font-semibold text-text">{item.item_name}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-text">{Number(item.quantity)}</td>
                  <td className="px-3 py-3 text-text-secondary">{item.unit ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{Number(item.unit_price).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums text-text">{Number(item.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-alt">
                <td colSpan={4} className="px-5 py-3 text-right font-bold text-text">Total</td>
                <td className="px-5 py-3 text-right text-[15px] font-extrabold tabular-nums text-text">{formatPrice(Number(po.total_amount ?? 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
