import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPurchaseOrders } from "@/lib/procurement/queries";
import { PO_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  if (status === "sent" || status === "acknowledged") return "info";
  return "neutral";
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const orders = await listPurchaseOrders(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{orders.length} purchase order{orders.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/supplier-procurement/orders/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Purchase Order
        </Link>
      </div>

      <SupplierProcurementSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {orders.length === 0 ? (
          <EmptyRow text="No purchase orders yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>PO Number</div>
              <div>Supplier</div>
              <div>Date</div>
              <div>Items</div>
              <div>Total</div>
              <div>Status</div>
            </div>
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/supplier-procurement/orders/${o.id}${query}`}
                className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">{o.po_number}</div>
                <div className="text-text-secondary">{o.suppliers?.name}</div>
                <div className="text-text-secondary">{o.order_date}</div>
                <div className="text-text-secondary">{o.purchase_order_items?.length ?? 0}</div>
                <div className="text-text-secondary">{formatCurrency(Number(o.total_amount))}</div>
                <div>
                  <StatusBadge tone={statusTone(o.status)}>{PO_STATUS_LABEL[o.status] ?? o.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
