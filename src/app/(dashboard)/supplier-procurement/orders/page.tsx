import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listProcurementRequests } from "@/lib/procurement/queries";
import { PROCUREMENT_REQUEST_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { ProcurementRequestActions } from "@/components/procurement/ProcurementRequestActions";
import { PurchaseOrdersBoard, type BoardSupplier } from "@/components/procurement/PurchaseOrdersBoard";

/**
 * Purchase Requests and Purchase Orders in one place. The orders made from the menu of the events (one for each supplier) are listed by
 * supplier with the events, the items and the quantities, and can be edited, deleted or sent to the supplier on WhatsApp. The item requests
 * of the staff that are still waiting (or approved, not yet ordered) are listed above them.
 */
export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
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

  const [{ data: orders, error }, requests] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*, suppliers(id, name, phone, contact_person), companies(name), purchase_order_items(*)")
      .in("company_id", targetCompanyIds)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false }),
    listProcurementRequests(supabase, targetCompanyIds),
  ]);
  if (error) throw error;

  // the orders of each supplier, the suppliers A to Z
  const bySupplier = new Map<string, BoardSupplier>();
  for (const o of orders ?? []) {
    const key = o.supplier_id;
    const entry = bySupplier.get(key) ?? { id: key, name: o.suppliers?.name ?? "—", phone: o.suppliers?.phone ?? null, contactPerson: o.suppliers?.contact_person ?? null, orders: [] };
    entry.orders.push({
      id: o.id,
      poNumber: o.po_number,
      orderDate: o.order_date,
      status: o.status,
      total: Number(o.total_amount ?? 0),
      sourceEvents: o.source_events,
      companyName: o.companies?.name ?? "",
      items: [...o.purchase_order_items]
        .sort((a, b) => a.item_name.localeCompare(b.item_name))
        .map((i) => ({ id: i.id, itemName: i.item_name, quantity: Number(i.quantity), unit: i.unit, unitPrice: Number(i.unit_price) })),
    });
    bySupplier.set(key, entry);
  }
  const suppliers = Array.from(bySupplier.values()).sort((a, b) => a.name.localeCompare(b.name));

  const waiting = requests.filter((r) => r.status === "pending" || r.status === "approved");
  const count = orders?.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{`${count} purchase order${count === 1 ? "" : "s"} · ${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/supplier-procurement/requests/new${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            + Item request
          </Link>
          <Link href={`/supplier-procurement/orders/new${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            + New Purchase Order
          </Link>
          <Link href={`/kitchen/purchase-requests/from-menu${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + Make orders from an event menu
          </Link>
        </div>
      </div>

      <SupplierProcurementSubNav />

      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[14px] text-text-secondary shadow-sm">
        <b className="text-text">How it works:</b> 1. Make the orders from an event menu (the ingredient list of the menu, one order for each supplier) · 2. Check the items and quantities here, edit them if needed · 3. Press Send to supplier on WhatsApp: the chat of the supplier opens with the event, its date and the list of items typed in.
      </div>

      {waiting.length > 0 && (
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">{`Item requests waiting: ${waiting.length}`}</div>
          <div className="divide-y divide-border">
            {waiting.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                <div className="min-w-0">
                  <Link href={`/supplier-procurement/requests/${r.id}${query}`} className="font-semibold text-text hover:underline">
                    {r.item_name} <span className="font-normal text-text-muted">× {r.quantity}</span>
                  </Link>
                  <div className="text-[12px] text-text-muted">
                    {`${r.companies?.name ?? ""} · ${formatMalaysiaDate(r.created_at)}${r.profiles?.full_name ? ` · ${r.profiles.full_name}` : ""}${r.department ? ` · ${r.department}` : ""}${r.estimated_cost != null ? ` · ${formatCurrency(Number(r.estimated_cost))}` : ""}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={r.status === "approved" ? "success" : "warning"}>{PROCUREMENT_REQUEST_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                  <ProcurementRequestActions requestId={r.id} status={r.status} />
                  {r.status === "approved" && (
                    <Link
                      href={`/supplier-procurement/orders/new?request=${r.id}&item=${encodeURIComponent(r.item_name)}&qty=${r.quantity}&company=${r.company_id}`}
                      className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text hover:border-primary hover:text-primary"
                    >
                      Make an order
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PurchaseOrdersBoard suppliers={suppliers} query={query} />
    </div>
  );
}
