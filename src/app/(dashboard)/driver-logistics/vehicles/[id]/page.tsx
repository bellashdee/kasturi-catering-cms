import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getVehicle, listMaintenanceForVehicle } from "@/lib/driver/queries";
import { VEHICLE_STATUS_LABEL, isExpiringSoon } from "@/lib/driver/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();

  let vehicle;
  try {
    vehicle = await getVehicle(supabase, id);
  } catch {
    notFound();
  }

  const maintenance = await listMaintenanceForVehicle(supabase, id);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/driver-logistics/vehicles${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Vehicles
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{vehicle.plate_number}</div>
          <div className="text-[13px] text-text-secondary">{vehicle.companies?.name}{vehicle.vehicle_type && ` · ${vehicle.vehicle_type}`}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={vehicle.status === "active" ? "success" : "neutral"}>{VEHICLE_STATUS_LABEL[vehicle.status] ?? vehicle.status}</StatusBadge>
          <Link href={`/driver-logistics/vehicles/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Insurance Expiry</div>
          <div className="mt-1 flex items-center gap-2 text-lg font-extrabold text-text">
            {vehicle.insurance_expiry ?? "—"}
            {isExpiringSoon(vehicle.insurance_expiry) && <StatusBadge tone="warning">Soon</StatusBadge>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Road Tax Expiry</div>
          <div className="mt-1 flex items-center gap-2 text-lg font-extrabold text-text">
            {vehicle.road_tax_expiry ?? "—"}
            {isExpiringSoon(vehicle.road_tax_expiry) && <StatusBadge tone="warning">Soon</StatusBadge>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Next Maintenance Due</div>
          <div className="mt-1 text-lg font-extrabold text-text">{vehicle.next_maintenance_due ?? "—"}</div>
        </div>
      </div>

      <SectionCard title="Service History" action={<Link href={`/driver-logistics/maintenance/new?vehicle=${id}${requestedId ? `&company=${requestedId}` : ""}`} className="text-[12.5px] font-semibold text-primary">+ Log Service</Link>}>
        {maintenance.length === 0 ? (
          <EmptyRow text="No service records yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {maintenance.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <span className="font-semibold text-text">{m.service_date}</span>
                  {m.notes && <span className="ml-2 text-text-muted">{m.notes}</span>}
                </div>
                <div className="flex items-center gap-3 text-text-secondary">
                  {m.next_service_date && <span>Next: {m.next_service_date}</span>}
                  <span className="font-semibold text-text">{formatCurrency(Number(m.cost))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
