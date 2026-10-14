import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getPurchaseOrder } from "@/lib/procurement/queries";
import { PO_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency } from "@/lib/format";
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
        <div className="-mx-5 -mb-5 divide-y divide-border">
          {po.purchase_order_items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
              <span className="font-semibold text-text">{item.item_name}</span>
              <span className="text-text-secondary">{item.quantity} × {formatCurrency(Number(item.unit_price))} = {formatCurrency(Number(item.line_total))}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
