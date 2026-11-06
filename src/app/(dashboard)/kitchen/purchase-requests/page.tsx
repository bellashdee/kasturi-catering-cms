import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPurchaseRequests } from "@/lib/kitchen/queries";
import { PURCHASE_REQUEST_STATUS_LABEL } from "@/lib/kitchen/constants";
import { formatMalaysiaDate, formatPrice } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { PurchaseRequestActions } from "@/components/kitchen/PurchaseRequestActions";
import { PurchaseRequestRecordActions } from "@/components/kitchen/KitchenRecordActions";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { DeletePurchaseOrderButton } from "@/components/procurement/DeletePurchaseOrderButton";
import { RequestList } from "@/components/kitchenPurchase/RequestList";
import { listKitchenRequests } from "@/lib/kitchenPurchase/queries";
import { canAccessModule } from "@/lib/modules";

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "completed") return "success";
  if (status === "rejected") return "danger";
  if (status === "approved" || status === "ordered") return "info";
  return "warning";
}

export default async function PurchaseRequestsPage({
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

  const requests = await listPurchaseRequests(supabase, targetCompanyIds);
  const kitchenRequests = await listKitchenRequests(supabase, targetCompanyIds);
  const { data: menuOrders } = await supabase
    .from("purchase_orders")
    .select("id, po_number, order_date, status, total_amount, source_events, suppliers(name), companies(name), purchase_order_items(id)")
    .in("company_id", targetCompanyIds)
    .not("source_events", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{kitchenRequests.length} purchase request{kitchenRequests.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/kitchen/purchase-requests/event${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Purchase Request (event menu)
          </Link>
          <Link href={`/kitchen/purchase-requests/new${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            + Single item
          </Link>
        </div>
      </div>

      <KitchenSubNav />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[17px] font-extrabold text-text">Purchase Request History</h2>
          <p className="text-[13px] text-text-secondary">Choose the event menu, check the ingredient list, write the quantities and submit it to the Purchaser. The Purchaser adds the supplier prices.</p>
        </div>
        <RequestList rows={kitchenRequests} hrefBase="/kitchen/purchase-requests" query={query} kitchenActions={canAccessModule(session.allowedModules, "kitchen")} empty="No purchase request yet. Press + New Purchase Request (event menu) to make one." />
      </section>

      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[14px] text-text-secondary shadow-sm">
        <b className="text-text">From an event menu or from recipes (older way, quantities worked out from the pax):</b> 1. Choose the event(s), or choose the recipes and their pax · 2. The menu gives the ingredients and quantities (from the recipes and the pax) · 3. Choose the supplier item of each ingredient, at the latest price of that supplier · 4. One purchase order is made for each supplier.{" "}
        <Link href={`/kitchen/purchase-requests/from-menu${query}`} className="font-semibold text-primary underline">
          Open the older planner
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">Purchase orders made from event menus</div>
        {(menuOrders ?? []).length === 0 ? (
          <EmptyRow text="No purchase order made from an event menu yet." />
        ) : (
          (menuOrders ?? []).map((po) => (
            <div key={po.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 text-[13.5px] last:border-b-0">
              <div className="min-w-0">
                <div className="font-semibold text-text">{`${po.po_number} · ${po.suppliers?.name ?? "—"}`}</div>
                <div className="truncate text-[12px] text-text-muted">{`${po.companies?.name ?? ""} · ${po.order_date} · ${po.purchase_order_items?.length ?? 0} item(s) · ${formatPrice(Number(po.total_amount))} · ${po.source_events}`}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={po.status === "draft" ? "warning" : "info"}>{po.status}</StatusBadge>
                <Link href={`/supplier-procurement/orders/${po.id}${query}`} className="rounded-md border border-border-strong bg-white px-2.5 py-1 text-[12px] font-semibold text-text hover:border-primary hover:text-primary">
                  Open / Edit
                </Link>
                <DeletePurchaseOrderButton poId={po.id} poNumber={po.po_number} listHref={`/kitchen/purchase-requests${query}`} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {requests.length === 0 ? (
          <EmptyRow text="No purchase requests yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.3fr_0.8fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_1.3fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Ingredient</div>
              <div>Quantity</div>
              <div>Supplier</div>
              <div>Company</div>
              <div>Request date</div>
              <div>Required</div>
              <div>Status</div>
              <div></div>
            </div>
            {requests.map((r) => (
              <div key={r.id} className="grid grid-cols-[1.3fr_0.8fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_1.3fr] items-center border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                <div className="font-semibold text-text">
                  {r.ingredients?.name ?? "—"}
                  {r.document_id && <DocumentViewLink documentId={r.document_id} className="ml-2 text-xs" />}
                </div>
                <div className="text-text-secondary">{r.quantity_requested} {r.unit ?? r.ingredients?.unit_of_measure ?? ""}</div>
                <div className="text-text-secondary">{r.suppliers?.name ?? "—"}</div>
                <div className="text-text-secondary">{r.companies?.name}</div>
                <div className="text-text-secondary">{formatMalaysiaDate(r.created_at)}</div>
                <div className="text-text-secondary">{r.required_date ?? "—"}</div>
                <div><StatusBadge tone={statusTone(r.status)}>{PURCHASE_REQUEST_STATUS_LABEL[r.status] ?? r.status}</StatusBadge></div>
                <div className="flex flex-col items-end gap-1.5">
                  <PurchaseRequestActions requestId={r.id} status={r.status} />
                  <PurchaseRequestRecordActions id={r.id} name={r.ingredients?.name ?? "this item"} quantity={String(r.quantity_requested)} unit={r.unit ?? r.ingredients?.unit_of_measure ?? ""} requiredDate={r.required_date ?? ""} notes={r.notes ?? ""} status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
