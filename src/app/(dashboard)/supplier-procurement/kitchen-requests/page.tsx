import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { RequestList } from "@/components/kitchenPurchase/RequestList";
import { listKitchenRequests } from "@/lib/kitchenPurchase/queries";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";

/** The Purchaser's incoming purchase requests from Kitchen (a draft is Kitchen's own and is not shown here). */
export default async function IncomingKitchenRequestsPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId, month } = await searchParams;
  const monthLabel = monthLabelOf(month);
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  // by month: the date of the event the request is for (the day it was made when the event has no date)
  const rows = filterByMonth(
    await listKitchenRequests(supabase, targetCompanyIds, ["submitted", "under_review", "revision_required", "pending_approval", "approved", "purchased", "completed", "rejected"]),
    month,
    (r) => r.event_date ?? r.created_at,
  );
  const open = rows.filter((r) => ["submitted", "under_review", "pending_approval", "approved", "purchased"].includes(r.status));
  const rest = rows.filter((r) => !open.includes(r));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-extrabold text-text">Supplier &amp; Procurement</h1>
      <SupplierProcurementSubNav />
      <MonthFilter />
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[17px] font-extrabold text-text">
            Incoming Purchase Requests from Kitchen
            {monthLabel ? <span className="text-text-secondary"> · {monthLabel}</span> : null}
          </h2>
          <p className="text-[13px] text-text-secondary">Open a request, check the items and quantities, add the price each supplier offers, choose one for every item, then send it for approval.</p>
        </div>
        <RequestList rows={open} hrefBase="/supplier-procurement/kitchen-requests" query={query} empty={monthLabel ? "No purchase requests in this month." : "No purchase request is waiting. When Kitchen submits one, it appears here."} />
      </section>
      {rest.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-text-secondary">Returned, completed and rejected</h2>
          <RequestList rows={rest} hrefBase="/supplier-procurement/kitchen-requests" query={query} empty="" />
        </section>
      )}
    </div>
  );
}
