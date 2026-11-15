import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listVehicles } from "@/lib/driver/queries";
import { VEHICLE_STATUS_LABEL, isExpiringSoon } from "@/lib/driver/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { OperationRowActions } from "@/components/driver/OperationRowActions";
import { RecordUndoBanner } from "@/components/driver/RecordUndoBanner";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { plate: "Plate Number", type: "Type", insurance: "Insurance", roadTax: "Road Tax", status: "Status" };

function statusTone(status: string): "success" | "warning" | "neutral" | "danger" {
  if (status === "active") return "success";
  if (status === "maintenance") return "warning";
  if (status === "retired") return "danger";
  return "neutral";
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const q = sp.q?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const records = (await listVehicles(supabase, targetCompanyIds)).filter(
    (r) => (!q || r.plate_number.toLowerCase().replace(/[^a-z0-9]/g, "").includes(q)) && (!sp.status || r.status === sp.status),
  );
  const { sort, dir } = readSort(sp, SORTS, "plate", "asc");
  const earliest = (values: (string | null)[]) => values.filter((x): x is string => !!x).sort()[0] ?? null;

  // The same vehicle used by several companies has one record per company (maintenance and expenses stay separate per company).
  // The list shows each plate number once, with every company that uses it.
  type VehicleRecord = (typeof records)[number];
  const byPlate = new Map<string, VehicleRecord[]>();
  for (const r of records) {
    const key = r.plate_number.toUpperCase().replace(/[^A-Z0-9]/g, "");
    byPlate.set(key, [...(byPlate.get(key) ?? []), r]);
  }
  const joined = (values: (string | null | undefined)[]) => Array.from(new Set(values.filter((v): v is string => !!v))).join(" / ") || "—";
  const vehicles = sortBy(Array.from(byPlate.values()), sort, dir, {
    plate: (g) => g[0].plate_number,
    type: [(g) => joined(g.map((x) => x.vehicle_type)).replace("—", ""), (g) => g[0].plate_number],
    insurance: [(g) => earliest(g.map((x) => x.insurance_expiry)), (g) => g[0].plate_number],
    roadTax: [(g) => earliest(g.map((x) => x.road_tax_expiry)), (g) => g[0].plate_number],
    status: [(g) => VEHICLE_STATUS_LABEL[g[0].status] ?? g[0].status, (g) => g[0].plate_number],
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}
            {records.length !== vehicles.length ? ` (${records.length} company records)` : ""}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link href={`/driver-logistics/vehicles/import${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Import Excel/CSV
          </Link>
          <Link href={`/driver-logistics/vehicles/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Vehicle
          </Link>
        </div>
      </div>

      <DriverLogisticsSubNav />

      <RecordUndoBanner />

      <ListFilters keep={{ company: requestedId }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/driver-logistics/vehicles${query}`}>
        <FilterField label="Plate Number">
          <input name="q" defaultValue={sp.q ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All statuses</option>
            {Object.entries(VEHICLE_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {vehicles.length === 0 ? (
          <EmptyRow text="No vehicles yet. Add one manually or import from Excel/CSV." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Plate Number</div>
              <div>Type</div>
              <div>Company</div>
              <div>Insurance</div>
              <div>Road Tax</div>
              <div>Status</div>
            </div>
            {vehicles.map((group) => {
              const v = group[0];
              const insurance = earliest(group.map((g) => g.insurance_expiry));
              const roadTax = earliest(group.map((g) => g.road_tax_expiry));
              const statuses = Array.from(new Set(group.map((g) => g.status)));
              return (
                <div key={v.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/driver-logistics/vehicles/${v.id}${query}`}
                  className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] px-5 py-3.5 text-[13.5px] hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">{v.plate_number}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.vehicle_type))}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.companies?.name))}</div>
                  <div className="flex items-center gap-2 text-text-secondary">
                    {insurance ?? "—"}
                    {isExpiringSoon(insurance) && <StatusBadge tone="warning">Soon</StatusBadge>}
                  </div>
                  <div className="flex items-center gap-2 text-text-secondary">
                    {roadTax ?? "—"}
                    {isExpiringSoon(roadTax) && <StatusBadge tone="warning">Soon</StatusBadge>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {statuses.map((st) => (
                      <StatusBadge key={st} tone={statusTone(st)}>{VEHICLE_STATUS_LABEL[st] ?? st}</StatusBadge>
                    ))}
                  </div>
                </Link>
                <div className="px-5 pb-3">
                  <OperationRowActions kind="vehicle" ids={group.map((g) => g.id)} editHref={`/driver-logistics/vehicles/${v.id}/edit${query}`} />
                </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
