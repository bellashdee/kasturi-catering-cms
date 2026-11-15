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
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";
import { STATUS_LABEL, type RequestStatus } from "@/lib/kitchenPurchase/shared";

const SORTS = { created: "Date requested", date: "Event date", request: "Request No.", event: "Event", status: "Status" };
const SHOWN: RequestStatus[] = ["submitted", "under_review", "revision_required", "pending_approval", "approved", "purchased", "completed", "rejected"];

/** The Purchaser's incoming purchase requests from Kitchen (a draft is Kitchen's own and is not shown here). */
export default async function IncomingKitchenRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const sp = await searchParams;
  const { company: requestedId, month, status } = sp;
  const q = (sp.q ?? "").trim().toLowerCase();
  const { sort, dir } = readSort(sp, SORTS, "created", "desc");
  const monthLabel = monthLabelOf(month);
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  // by month: the date of the event the request is for (the day it was made when the event has no date)
  const inMonth = filterByMonth(await listKitchenRequests(supabase, targetCompanyIds, SHOWN), month, (r) => r.event_date ?? r.created_at);
  const rows = sortBy(
    inMonth.filter((r) => (!status || r.status === status) && (!q || r.request_no.toLowerCase().includes(q) || r.event_name.toLowerCase().includes(q))),
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
  const filtered = !!(q || status);
  const open = rows.filter((r) => ["submitted", "under_review", "pending_approval", "approved", "purchased"].includes(r.status));
  const rest = rows.filter((r) => !open.includes(r));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-extrabold text-text">Supplier &amp; Procurement</h1>
      <SupplierProcurementSubNav />
      <MonthFilter />
      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/supplier-procurement/kitchen-requests${query}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Request No. or event" className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={status ?? ""} className={`${FILTER_INPUT} w-48`}>
            <option value="">All statuses</option>
            {SHOWN.map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
          </Select>
        </FilterField>
      </ListFilters>
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[17px] font-extrabold text-text">
            Incoming Purchase Requests from Kitchen
            {monthLabel ? <span className="text-text-secondary"> · {monthLabel}</span> : null}
          </h2>
          <p className="text-[13px] text-text-secondary">Open a request, check the items and quantities, add the price each supplier offers, choose one for every item, then send it for approval.</p>
        </div>
        <RequestList rows={open} hrefBase="/supplier-procurement/kitchen-requests" query={query} empty={filtered ? "No purchase requests match these filters." : monthLabel ? "No purchase requests in this month." : "No purchase request is waiting. When Kitchen submits one, it appears here."} />
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
