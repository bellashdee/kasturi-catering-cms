import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getVehicle } from "@/lib/driver/queries";
import { VEHICLE_STATUS_LABEL, isExpiringSoon } from "@/lib/driver/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleConditionBoard, type RepairRow } from "@/components/driver/VehicleConditionBoard";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { nextDue, withDefaults, type FuelLog, type VehicleProfile } from "@/lib/driver/vehicleCondition";
import { todayInMalaysia } from "@/lib/format";

const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${d}T00:00:00Z`)) : "—");

/** One vehicle: what needs attention first, then its full condition & maintenance record (details, schedule, fuel, tyres, battery, repairs, checklist). */
export default async function VehicleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
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
  const plate = vehicle.plate_number;
  const db = untyped(supabase);
  // the same van has a record per company: its condition, fuel and service history are shown together
  const { data: sameVan } = await supabase.from("vehicles").select("id").eq("plate_number", plate);
  const vanIds = (sameVan ?? []).map((v) => v.id);
  const [{ data: profileRow }, { data: fuelRows }, { data: repairRows }] = await Promise.all([
    db.from("vehicle_profiles").select("*").eq("plate_number", plate).maybeSingle(),
    db.from("vehicle_fuel_logs").select("id, fill_date, odometer_km, litres, cost, station, notes").eq("plate_number", plate).order("fill_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    db.from("vehicle_maintenance_records").select("id, service_date, odometer_km, service_type, cost, workshop, notes, next_service_date").in("vehicle_id", vanIds.length > 0 ? vanIds : [id]).order("service_date", { ascending: false }),
  ]);
  const profile = withDefaults(plate, profileRow as Partial<VehicleProfile> | null);
  const today = todayInMalaysia();
  const dueItems = profile.schedule.map((s) => ({ s, due: nextDue(s, profile.odometer_km, today) }));
  const overdue = dueItems.filter((d) => d.due.state === "overdue");
  const soon = dueItems.filter((d) => d.due.state === "soon");

  const cards: { label: string; value: string; warn: boolean; danger?: boolean }[] = [
    { label: "Insurance expiry", value: fmt(vehicle.insurance_expiry), warn: isExpiringSoon(vehicle.insurance_expiry), danger: !!vehicle.insurance_expiry && vehicle.insurance_expiry < today },
    { label: "Road tax expiry", value: fmt(vehicle.road_tax_expiry), warn: isExpiringSoon(vehicle.road_tax_expiry), danger: !!vehicle.road_tax_expiry && vehicle.road_tax_expiry < today },
    { label: "Next maintenance due", value: fmt(vehicle.next_maintenance_due), warn: isExpiringSoon(vehicle.next_maintenance_due), danger: !!vehicle.next_maintenance_due && vehicle.next_maintenance_due < today },
    { label: "Odometer now", value: profile.odometer_km !== null ? `${Math.round(profile.odometer_km).toLocaleString("en-MY")} km` : "—", warn: false },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/driver-logistics/vehicles${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Vehicles
          </Link>
          <div className="mt-1 text-[22px] font-extrabold text-text">{`${plate}${profile.nickname ? ` · ${profile.nickname}` : ""}`}</div>
          <div className="text-[13px] text-text-secondary">{[vehicle.vehicle_type, [profile.make, profile.model].filter(Boolean).join(" "), profile.year ? String(profile.year) : ""].filter(Boolean).join(" · ") || "Vehicle Maintenance & Records"}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={vehicle.status === "active" ? "success" : "neutral"}>{VEHICLE_STATUS_LABEL[vehicle.status] ?? vehicle.status}</StatusBadge>
          <Link href={`/driver-logistics/vehicles/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Edit plate / type / status
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border p-4 shadow-sm ${c.danger ? "border-danger/40 bg-danger-bg" : c.warn ? "border-yellow-500 bg-yellow-50" : "border-border bg-surface"}`}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{c.label}</div>
            <div className={`mt-1 text-[17px] font-extrabold ${c.danger ? "text-danger" : "text-text"}`}>{c.value}</div>
            {c.danger ? <div className="text-[11.5px] font-bold text-danger">Expired / overdue</div> : c.warn ? <div className="text-[11.5px] font-bold text-yellow-900">Soon</div> : null}
          </div>
        ))}
      </div>

      {(overdue.length > 0 || soon.length > 0) && (
        <div className={`rounded-xl border px-4 py-3 text-[13px] ${overdue.length > 0 ? "border-danger/40 bg-danger-bg text-danger" : "border-yellow-500 bg-yellow-50 text-yellow-900"}`}>
          <b>{overdue.length > 0 ? "Maintenance overdue: " : "Maintenance due soon: "}</b>
          {[...overdue, ...soon].map((d) => d.s.item).join(", ")}
        </div>
      )}

      <VehicleConditionBoard
        vehicleId={id}
        plate={plate}
        profile={profile}
        fuel={(fuelRows ?? []) as FuelLog[]}
        repairs={(repairRows ?? []) as RepairRow[]}
        insuranceExpiry={vehicle.insurance_expiry}
        roadTaxExpiry={vehicle.road_tax_expiry}
      />
    </div>
  );
}
