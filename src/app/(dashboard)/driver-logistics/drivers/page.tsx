import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listDrivers } from "@/lib/driver/queries";
import { AVAILABILITY_LABEL, isExpiringSoon } from "@/lib/driver/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { OperationRowActions } from "@/components/driver/OperationRowActions";
import { RecordUndoBanner } from "@/components/driver/RecordUndoBanner";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { added: "Date added", name: "Name", expiry: "License Expiry", availability: "Availability" };

function availabilityTone(status: string): "success" | "warning" | "neutral" | "info" {
  if (status === "available") return "success";
  if (status === "on_delivery") return "info";
  if (status === "on_leave") return "warning";
  return "neutral";
}

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string; availability?: string; sort?: string; dir?: string }>;
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

  const q = sp.q?.trim().toLowerCase() ?? "";
  const records = (await listDrivers(supabase, targetCompanyIds)).filter(
    (d) => (!q || (d.employees?.full_name ?? "").toLowerCase().includes(q)) && (!sp.availability || d.availability_status === sp.availability),
  );
  const { sort, dir } = readSort(sp, SORTS, "added", "desc");

  // The same driver who works for several companies has one driver record per company (deliveries and expenses stay separate per
  // company). The list shows each person once, with the companies he works for.
  type DriverRecord = (typeof records)[number];
  const byName = new Map<string, DriverRecord[]>();
  for (const d of records) {
    const key = (d.employees?.full_name ?? d.id).toUpperCase().replace(/\s+/g, " ").trim();
    byName.set(key, [...(byName.get(key) ?? []), d]);
  }
  const drivers = sortBy(Array.from(byName.values()), sort, dir, {
    added: (g) => g[0].created_at,
    name: (g) => g[0].employees?.full_name,
    expiry: [(g) => g.map((x) => x.license_expiry).filter((v): v is string => !!v).sort()[0], (g) => g[0].employees?.full_name],
    availability: [(g) => AVAILABILITY_LABEL[g[0].availability_status] ?? g[0].availability_status, (g) => g[0].employees?.full_name],
  });
  const joined = (values: (string | null | undefined)[]) => Array.from(new Set(values.filter((v): v is string => !!v))).join(" / ") || "—";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{drivers.length} driver{drivers.length === 1 ? "" : "s"}{records.length !== drivers.length ? ` (${records.length} company records)` : ""}</p>
        </div>
        <Link href={`/driver-logistics/drivers/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Driver
        </Link>
      </div>

      <DriverLogisticsSubNav />

      <RecordUndoBanner />

      <ListFilters keep={{ company: requestedId }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/driver-logistics/drivers${query}`}>
        <FilterField label="Name">
          <input name="q" defaultValue={sp.q ?? ""} className={`${FILTER_INPUT} w-48`} />
        </FilterField>
        <FilterField label="Availability">
          <Select name="availability" defaultValue={sp.availability ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All</option>
            {Object.entries(AVAILABILITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {drivers.length === 0 ? (
          <EmptyRow text="No drivers yet. Add one from an existing HR employee or create a new person." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.6fr_1.2fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Name</div>
              <div>Contact</div>
              <div>Company</div>
              <div>License Expiry</div>
              <div>Availability</div>
            </div>
            {drivers.map((group) => {
              const d = group[0];
              const expiry = group.map((g) => g.license_expiry).filter((v): v is string => !!v).sort()[0] ?? null;
              const statuses = Array.from(new Set(group.map((g) => g.availability_status)));
              return (
                <div key={d.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/driver-logistics/drivers/${d.id}${query}`}
                  className="grid grid-cols-[1.6fr_1.2fr_1fr_1fr_1fr] px-5 py-3.5 text-[13.5px] hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">{d.employees?.full_name}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.employees?.phone ?? g.employees?.email))}</div>
                  <div className="text-text-secondary">{new Set(group.map((g) => g.company_id)).size >= companies.length ? "All companies" : joined(group.map((g) => g.companies?.name))}</div>
                  <div className="flex items-center gap-2 text-text-secondary">
                    {expiry ?? "—"}
                    {isExpiringSoon(expiry) && <StatusBadge tone="warning">Expiring</StatusBadge>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {statuses.map((st) => (
                      <StatusBadge key={st} tone={availabilityTone(st)}>{AVAILABILITY_LABEL[st] ?? st}</StatusBadge>
                    ))}
                  </div>
                </Link>
                <div className="px-5 pb-3">
                  <OperationRowActions kind="driver" ids={group.map((g) => g.id)} editHref={`/driver-logistics/drivers/${d.id}/edit${query}`} />
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
