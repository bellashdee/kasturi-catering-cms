import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listProductionOrders, orderMenuItems } from "@/lib/kitchen/queries";
import { PRODUCTION_STATUS_LABEL } from "@/lib/kitchen/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { ProductionOrderRowActions } from "@/components/kitchen/ProductionOrderRowActions";
import { RecordUndoBanner } from "@/components/driver/RecordUndoBanner";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Planned Date", event: "Event", pax: "Pax", status: "Status" };

function statusTone(status: string): "success" | "warning" | "info" {
  if (status === "completed") return "success";
  if (status === "preparing" || status === "ready") return "info";
  return "warning";
}

export default async function KitchenPage({
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
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  type Order = Awaited<ReturnType<typeof listProductionOrders>>[number];
  const menuText = (o: Order) => o.recipes?.name ?? o.menu_plan_dishes?.name ?? orderMenuItems(o).join(" ");
  const orders = sortBy(
    filterByMonth(await listProductionOrders(supabase, targetCompanyIds), month, (o) => o.planned_date).filter(
      (o) => (!status || o.status === status) && (!q || `${o.catering_events?.event_name ?? ""} ${menuText(o)}`.toLowerCase().includes(q)),
    ),
    sort,
    dir,
    {
      date: (o) => o.planned_date,
      event: [(o) => o.catering_events?.event_name, (o) => o.planned_date],
      pax: [(o) => o.pax_count, (o) => o.planned_date],
      status: [(o) => Object.keys(PRODUCTION_STATUS_LABEL).indexOf(o.status), (o) => o.planned_date],
    },
  );
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{orders.length} production order{orders.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/kitchen/event-ingredients${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Generate Ingredient List
          </Link>
          <Link href={`/kitchen/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Production Order
          </Link>
        </div>
      </div>

      <KitchenSubNav />

      <RecordUndoBanner />

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/kitchen${query}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Event or menu" className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={status ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All statuses</option>
            {Object.entries(PRODUCTION_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {orders.length === 0 ? (
          <EmptyRow text={q || status ? "No production orders match these filters." : monthLabel ? "No production orders in this month." : "No production orders yet. Confirming a catering event, or creating one manually, will list it here."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_1.4fr_0.8fr_0.8fr_1.4fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Planned Date</div>
              <div>Menu</div>
              <div>Pax</div>
              <div>Company</div>
              <div>Linked Event</div>
              <div>Status</div>
            </div>
            {orders.map((o) => (
              <div key={o.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/kitchen/${o.id}${query}`}
                className="grid grid-cols-[1fr_1.4fr_0.8fr_0.8fr_1.4fr_1fr] px-5 py-3.5 text-[13.5px] hover:bg-surface-alt"
              >
                <div className="text-text-secondary">{o.planned_date}</div>
                <div className="font-semibold text-text">
                  {o.recipes?.name ?? o.menu_plan_dishes?.name ?? (
                    // an event's order has no recipe of its own: show the menu entered in Catering
                    (() => {
                      const menu = orderMenuItems(o);
                      return menu.length ? menu.map((m, i) => <div key={i}>{m}</div>) : "—";
                    })()
                  )}
                </div>
                <div className="text-text-secondary">{o.pax_count ?? "—"}</div>
                <div className="text-text-secondary">{o.companies?.name}</div>
                <div className="text-text-secondary">{o.catering_events?.event_name ?? "—"}</div>
                <div>
                  <StatusBadge tone={statusTone(o.status)}>{PRODUCTION_STATUS_LABEL[o.status] ?? o.status}</StatusBadge>
                </div>
              </Link>
              <div className="px-5 pb-3">
                <ProductionOrderRowActions
                  id={o.id}
                  detailHref={`/kitchen/${o.id}${query}`}
                  initial={{ plannedDate: o.planned_date ?? "", paxCount: o.pax_count !== null ? String(o.pax_count) : "", assignedStaff: o.assigned_staff ?? "", prepTimeMinutes: o.prep_time_minutes !== null ? String(o.prep_time_minutes) : "", notes: o.notes ?? "" }}
                />
              </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
