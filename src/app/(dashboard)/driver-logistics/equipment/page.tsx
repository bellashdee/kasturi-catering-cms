import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { formatMalaysiaDate, formatTime12 } from "@/lib/format";
import { checklistStatus, type ChecklistItem } from "@/lib/driver/equipmentChecklist";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";

type ChecklistRow = { catering_event_id: string; items: ChecklistItem[]; out_prepared_by: string | null; out_checked_by: string | null; in_received_by: string | null; in_checked_by: string | null };

const thisMonth = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);

/** Operation Management → Equipment Checklist: one checklist per catering event (equipment out to the event, and back in). */
export default async function EquipmentChecklistListPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string; q?: string; status?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], sp.company);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;
  const query = sp.company ? `?company=${sp.company}` : "";
  const month = sp.month === "all" ? undefined : sp.month || thisMonth();
  const q = sp.q?.trim().toLowerCase() ?? "";
  const status = sp.status ?? "";

  const [{ data: events }, { data: lists }] = await Promise.all([
    supabase
      .from("catering_events")
      .select("id, event_name, event_date, event_time, setup_time, pax_count, location, status, companies(name)")
      .in("company_id", targetCompanyIds)
      .neq("status", "cancelled")
      .order("event_date", { ascending: false })
      .limit(2000),
    untyped(supabase).from("equipment_checklists").select("catering_event_id, items, out_prepared_by, out_checked_by, in_received_by, in_checked_by").in("company_id", targetCompanyIds),
  ]);
  const byEvent = new Map(((lists ?? []) as ChecklistRow[]).map((l) => [l.catering_event_id, l]));
  const rows = filterByMonth(events ?? [], month, (e) => e.event_date)
    .map((e) => {
      const l = byEvent.get(e.id);
      const st = checklistStatus(l?.items ?? [], { out_prepared: !!l?.out_prepared_by, out_checked: !!l?.out_checked_by, in_received: !!l?.in_received_by, in_checked: !!l?.in_checked_by });
      return { e, st };
    })
    .filter(({ e, st }) => (!q || [e.event_name, e.location].some((v) => (v ?? "").toLowerCase().includes(q))) && (!status || st.label === status || (status === "missing" && st.tone === "danger")))
    .sort((a, b) => (b.e.event_date ?? "").localeCompare(a.e.event_date ?? ""));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Equipment Checklist · {rows.length} event{rows.length === 1 ? "" : "s"} · <span className="font-semibold text-text">{monthLabelOf(month) ?? "All months"}</span>
        </p>
      </div>
      <DriverLogisticsSubNav />
      <MonthFilter allowAll />
      <ListFilters keep={{ company: sp.company, month: sp.month }} clearHref={`/driver-logistics/equipment${query}`}>
        <FilterField label="Client / venue">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Client or venue" className={`${FILTER_INPUT} w-56`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={status} className={`${FILTER_INPUT} w-44`}>
            <option value="">All statuses</option>
            <option value="Not started">Not started</option>
            <option value="Equipment out">Equipment out</option>
            <option value="missing">Items missing</option>
            <option value="All returned">All returned</option>
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {rows.length === 0 ? (
          <EmptyRow text="No events for this filter." />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1fr_1.8fr_0.6fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <div>Event date</div>
                <div>Client / venue</div>
                <div>Pax</div>
                <div>Company</div>
                <div>Checklist</div>
              </div>
              {rows.map(({ e, st }) => (
                <Link
                  key={e.id}
                  href={`/driver-logistics/equipment/${e.id}${query}`}
                  className="grid grid-cols-[1fr_1.8fr_0.6fr_1fr_1fr] items-start border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="text-text">
                    {e.event_date ? formatMalaysiaDate(`${e.event_date}T12:00:00+08:00`) : "—"}
                    {e.event_time && <div className="text-[12px] text-text-muted">{formatTime12(e.event_time)}</div>}
                  </div>
                  <div>
                    <div className="font-semibold text-text">{e.event_name}</div>
                    {e.location && <div className="text-[12px] text-text-muted">{e.location}</div>}
                  </div>
                  <div className="text-text-secondary">{e.pax_count ?? "—"}</div>
                  <div className="text-text-secondary">{(e.companies as { name?: string } | null)?.name ?? "—"}</div>
                  <div>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
