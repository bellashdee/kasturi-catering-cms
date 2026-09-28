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

function statusTone(status: string): "success" | "warning" | "neutral" | "danger" {
  if (status === "active") return "success";
  if (status === "maintenance") return "warning";
  if (status === "retired") return "danger";
  return "neutral";
}

export default async function VehiclesPage({
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

  const vehicles = await listVehicles(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Driver & Logistics</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}</p>
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
            {vehicles.map((v) => (
              <Link
                key={v.id}
                href={`/driver-logistics/vehicles/${v.id}${query}`}
                className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">{v.plate_number}</div>
                <div className="text-text-secondary">{v.vehicle_type ?? "—"}</div>
                <div className="text-text-secondary">{v.companies?.name}</div>
                <div className="flex items-center gap-2 text-text-secondary">
                  {v.insurance_expiry ?? "—"}
                  {isExpiringSoon(v.insurance_expiry) && <StatusBadge tone="warning">Soon</StatusBadge>}
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                  {v.road_tax_expiry ?? "—"}
                  {isExpiringSoon(v.road_tax_expiry) && <StatusBadge tone="warning">Soon</StatusBadge>}
                </div>
                <div>
                  <StatusBadge tone={statusTone(v.status)}>{VEHICLE_STATUS_LABEL[v.status] ?? v.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
