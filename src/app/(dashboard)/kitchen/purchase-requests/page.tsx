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
import { MonthFilter } from "@/components/MonthFilter";
import { isRestaurantScope } from "@/lib/restaurantView";
import { filterByMonth, monthLabelOf, monthRange } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";
import { STATUS_LABEL, type RequestStatus } from "@/lib/kitchenPurchase/shared";

const SORTS = { created: "Date requested", date: "Event date", request: "Request No.", event: "Event", status: "Status" };
/** O2 Life (the restaurant) has no events */
const SORTS_RESTAURANT = { created: "Date requested", request: "Request No.", status: "Status" };

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "completed") return "success";
  if (status === "rejected") return "danger";
  if (status === "approved" || status === "ordered") return "info";
  return "warning";
}

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month, status } = sp;
  const q = (sp.q ?? "").trim().toLowerCase();
  const { sort, dir } = readSort(sp, SORTS, "created", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  const restaurant = isRestaurantScope(companies, targetCompanyIds);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const monthLabel = monthLabelOf(month);
  const range = monthRange(month);
  // the date shown on a request row is the event date (the request date when the event has none)
  const requests = filterByMonth(await listPurchaseRequests(supabase, targetCompanyIds), month, (r) => r.created_at);
  const kitchenRequests = sortBy(
    filterByMonth(await listKitchenRequests(supabase, targetCompanyIds), month, (r) => r.event_date ?? r.created_at).filter(
      (r) => (!status || r.status === status) && (!q || r.request_no.toLowerCase().includes(q) || r.event_name.toLowerCase().includes(q)),
    ),
    sort,
    dir,
    {
      created: (r) => r.created_at,
      date: [(r) => r.event_date, (r) => r.created_at],
      request: (r) => r.request_no,
      event: [(r) => r.event_name, (r) => r.event_date],
      status: [(r) => STATUS_LABEL[r.status as RequestStatus] ?? r.status, (r) => r.created_at],
    },
  );
  let menuOrdersQuery = supabase
    .from("purchase_orders")
    .select("id, po_number, order_date, status, total_amount, source_events, suppliers(name), companies(name), purchase_order_items(id)")
    .in("company_id", targetCompanyIds)
    .not("source_events", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);
  // O2 Life is the restaurant: no event menus, so no purchase orders made from them
  if (restaurant) menuOrdersQuery = menuOrdersQuery.limit(0);
  if (range) menuOrdersQuery = menuOrdersQuery.gte("order_date", range.start).lte("order_date", range.end);
  const { data: menuOrders } = await menuOrdersQuery;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{kitchenRequests.length} purchase request{kitchenRequests.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {/* one button: the next page offers the event menu or keying in the menu */}
          <Link href={`/kitchen/purchase-requests/from-menu${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Purchase Request
          </Link>
        </div>
      </div>

      <KitchenSubNav />

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={restaurant ? SORTS_RESTAURANT : SORTS} sort={sort} dir={dir} clearHref={`/kitchen/purchase-requests${query}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder={restaurant ? "Request No." : "Request No. or event"} className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={status ?? ""} className={`${FILTER_INPUT} w-48`}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[17px] font-extrabold text-text">Purchase Request History</h2>
          <p className="text-[13px] text-text-secondary">{restaurant ? "Choose the recipes and how many portions (pax) of each: the ingredients and quantities are worked out from the recipes, and one purchase order is made for each supplier at its latest price." : "Choose the event (or key in the menu) and the pax: the ingredients and quantities are worked out from the recipes, and one purchase order is made for each supplier at its latest price."}</p>
        </div>
        <RequestList rows={kitchenRequests} hrefBase="/kitchen/purchase-requests" query={query} kitchenActions={canAccessModule(session.allowedModules, "kitchen")} empty={q || status ? "No purchase requests match these filters." : monthLabel ? "No purchase requests in this month." : "No purchase requests yet."} />
      </section>

      {!restaurant && (
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">Purchase Orders Made from Event Menus</div>
        {(menuOrders ?? []).length === 0 ? (
          <EmptyRow text={monthLabel ? "No purchase orders made from event menus in this month." : "No purchase orders made from event menus yet."} />
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
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {requests.length === 0 ? (
          <EmptyRow text={monthLabel ? "No single-item purchase requests in this month." : "No single-item purchase requests yet."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1.3fr_0.8fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_1.3fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Ingredient</div>
              <div>Quantity</div>
              <div>Supplier</div>
              <div>Company</div>
              <div>Request Date</div>
              <div>Required Date</div>
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
