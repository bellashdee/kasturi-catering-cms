import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listMaintenanceForCompanies } from "@/lib/driver/queries";
import { formatCurrency } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { OperationRowActions } from "@/components/driver/OperationRowActions";
import { RecordUndoBanner } from "@/components/driver/RecordUndoBanner";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Service Date", vehicle: "Vehicle", next: "Next Service", cost: "Cost" };

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; vehicle?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const vehicle = sp.vehicle?.trim().toLowerCase() ?? "";
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const records = sortBy(
    filterByMonth(await listMaintenanceForCompanies(supabase, targetCompanyIds), month, (m) => m.service_date).filter(
      (m) => !vehicle || (m.vehicles?.plate_number ?? "").toLowerCase().includes(vehicle),
    ),
    sort,
    dir,
    {
      date: (m) => m.service_date,
      vehicle: [(m) => m.vehicles?.plate_number, (m) => m.service_date],
      next: [(m) => m.next_service_date, (m) => m.service_date],
      cost: (m) => Number(m.cost),
    },
  );
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{records.length} service record{records.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <Link href={`/driver-logistics/maintenance/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + Log Service
        </Link>
      </div>

      <DriverLogisticsSubNav />

      <RecordUndoBanner />

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/driver-logistics/maintenance${query}${month ? `${query ? "&" : "?"}month=${month}` : ""}`}>
        <FilterField label="Plate Number">
          <input name="vehicle" defaultValue={sp.vehicle ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {records.length === 0 ? (
          <EmptyRow text={monthLabel ? "No service record in this month." : "No service records yet."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.4fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Vehicle</div>
              <div>Service Date</div>
              <div>Next Service</div>
              <div>Cost</div>
              <div>Company / Notes</div>
            </div>
            {records.map((m) => (
              <div key={m.id} className="border-b border-border last:border-b-0">
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.4fr] px-5 py-3.5 text-[13.5px]">
                <div className="font-semibold text-text">{m.vehicles?.plate_number ?? "—"}</div>
                <div className="text-text-secondary">{m.service_date}</div>
                <div className="text-text-secondary">{m.next_service_date ?? "—"}</div>
                <div className="text-text-secondary">{formatCurrency(Number(m.cost))}</div>
                <div className="truncate text-text-muted">{m.companies?.name}{m.notes ? ` · ${m.notes}` : ""}</div>
              </div>
              <div className="px-5 pb-3">
                <OperationRowActions
                  kind="maintenance"
                  id={m.id}
                  initial={{ serviceDate: m.service_date, nextServiceDate: m.next_service_date ?? "", cost: String(m.cost ?? 0), notes: m.notes ?? "" }}
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
