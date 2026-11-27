"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { FUEL_TYPES, TYRE_POSITIONS, type BatteryInfo, type ScheduleItem, type TyreRow } from "@/lib/driver/vehicleCondition";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const date = (v: unknown) => (typeof v === "string" && DATE_RE.test(v) ? v : null);

/** The vehicle (one of the person's company records of it) and its plate; the database checks the person may see that plate. */
async function requirePlate(vehicleId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: v } = await supabase.from("vehicles").select("id, plate_number, company_id").eq("id", vehicleId).maybeSingle();
  if (!v) throw new Error("This vehicle was not found.");
  return { supabase, db: untyped(supabase), plate: v.plate_number as string, companyId: v.company_id as string, userId: user.id };
}

function refresh(vehicleId: string) {
  revalidatePath(`/driver-logistics/vehicles/${vehicleId}`);
  revalidatePath("/driver-logistics/vehicles");
}

export type ProfileDetails = {
  make?: string;
  model?: string;
  year?: number | null;
  colour?: string;
  nickname?: string;
  chassis_no?: string;
  engine_no?: string;
  fuel_type?: string;
  odometer_km?: number | null;
  insurance_company?: string;
  policy_number?: string;
  insurance_expiry?: string;
  road_tax_expiry?: string;
  notes?: string;
};

/** Saves the vehicle's details. Insurance / road tax expiry go on every company's record of the same plate (they are the same van). */
export async function saveVehicleDetails(vehicleId: string, d: ProfileDetails): Promise<ActionResult> {
  return runAction(async () => {
    const { db, supabase, plate, companyId } = await requirePlate(vehicleId);
    if (d.fuel_type && !FUEL_TYPES[d.fuel_type]) throw new Error("Choose the fuel type.");
    const row: Record<string, unknown> = {
      plate_number: plate,
      make: txt(d.make, 80),
      model: txt(d.model, 80),
      year: typeof d.year === "number" && d.year >= 1950 && d.year <= 2100 ? Math.round(d.year) : null,
      colour: txt(d.colour, 40),
      nickname: txt(d.nickname, 80),
      chassis_no: txt(d.chassis_no, 60),
      engine_no: txt(d.engine_no, 60),
      fuel_type: d.fuel_type || null,
      insurance_company: txt(d.insurance_company, 120),
      policy_number: txt(d.policy_number, 80),
      notes: txt(d.notes, 4000),
    };
    if (d.odometer_km !== undefined) {
      row.odometer_km = num(d.odometer_km);
      row.odometer_date = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    }
    const { error } = await db.from("vehicle_profiles").upsert(row, { onConflict: "plate_number" });
    if (error) throw error;
    if (d.insurance_expiry !== undefined || d.road_tax_expiry !== undefined) {
      const patch: { insurance_expiry?: string | null; road_tax_expiry?: string | null } = {};
      if (d.insurance_expiry !== undefined) patch.insurance_expiry = date(d.insurance_expiry);
      if (d.road_tax_expiry !== undefined) patch.road_tax_expiry = date(d.road_tax_expiry);
      await supabase.from("vehicles").update(patch).eq("plate_number", plate);
    }
    await recordAudit({ companyId, relatedTable: "vehicle_profiles", relatedId: vehicleId, action: "updated", newValue: `${plate} details` });
    refresh(vehicleId);
    return {};
  }, "Could not save the vehicle details.");
}

/** Saves one part of the condition record: the maintenance schedule, the tyres, the battery or the annual checklist. */
export async function saveVehiclePart(
  vehicleId: string,
  part: { schedule?: ScheduleItem[]; tyres?: TyreRow[]; battery?: BatteryInfo; annual_checklist?: Record<string, string>; odometer_km?: number | null },
): Promise<ActionResult> {
  return runAction(async () => {
    const { db, plate } = await requirePlate(vehicleId);
    const row: Record<string, unknown> = { plate_number: plate };
    if (part.schedule) {
      row.schedule = part.schedule
        .filter((s) => txt(s.item, 120))
        .slice(0, 60)
        .map((s) => ({ item: txt(s.item, 120), interval_km: num(s.interval_km), interval_months: num(s.interval_months), last_done_date: date(s.last_done_date), last_done_km: num(s.last_done_km), notes: txt(s.notes, 300) }));
    }
    if (part.tyres) {
      row.tyres = part.tyres
        .filter((t) => TYRE_POSITIONS.includes(t.position))
        .map((t) => ({ position: t.position, brand: txt(t.brand, 80), size: txt(t.size, 40), purchase_date: date(t.purchase_date), odometer_km: num(t.odometer_km), notes: txt(t.notes, 300) }));
    }
    if (part.battery) {
      const b = part.battery;
      row.battery = { brand: txt(b.brand, 80), purchase_date: date(b.purchase_date), voltage: txt(b.voltage, 20), warranty: txt(b.warranty, 60), replacement_date: date(b.replacement_date), notes: txt(b.notes, 300) };
    }
    if (part.annual_checklist) {
      row.annual_checklist = Object.fromEntries(Object.entries(part.annual_checklist).filter(([k, v]) => /^[a-z_]{1,40}$/.test(k) && date(v)));
    }
    if (part.odometer_km !== undefined && num(part.odometer_km) !== null) {
      row.odometer_km = num(part.odometer_km);
      row.odometer_date = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    }
    const { error } = await db.from("vehicle_profiles").upsert(row, { onConflict: "plate_number" });
    if (error) throw error;
    refresh(vehicleId);
    return {};
  }, "Could not save. Please try again.");
}

export type FuelInput = { fillDate: string; odometerKm?: number | null; litres?: number | null; cost?: number | null; station?: string; notes?: string };

/** Records a fill-up; a higher odometer reading also becomes the van's current odometer. */
export async function addFuelLog(vehicleId: string, f: FuelInput): Promise<ActionResult> {
  return runAction(async () => {
    const { db, plate } = await requirePlate(vehicleId);
    if (!DATE_RE.test(f.fillDate)) throw new Error("Enter the date.");
    if (!num(f.litres) && !num(f.cost)) throw new Error("Enter the litres or the cost.");
    const { error } = await db.from("vehicle_fuel_logs").insert({ plate_number: plate, fill_date: f.fillDate, odometer_km: num(f.odometerKm), litres: num(f.litres) || null, cost: num(f.cost), station: txt(f.station, 120), notes: txt(f.notes, 300) });
    if (error) throw error;
    const odo = num(f.odometerKm);
    if (odo !== null) {
      const { data: p } = await db.from("vehicle_profiles").select("odometer_km").eq("plate_number", plate).maybeSingle();
      if (!p || p.odometer_km === null || Number(p.odometer_km) < odo) await db.from("vehicle_profiles").upsert({ plate_number: plate, odometer_km: odo, odometer_date: f.fillDate }, { onConflict: "plate_number" });
    }
    refresh(vehicleId);
    return {};
  }, "Could not save the fuel record.");
}

export async function deleteFuelLog(vehicleId: string, id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db, plate, companyId } = await requirePlate(vehicleId);
    const { data: row } = await db.from("vehicle_fuel_logs").select("fill_date, cost").eq("id", id).eq("plate_number", plate).maybeSingle();
    if (!row) throw new Error("This fuel record was not found.");
    const { error } = await db.from("vehicle_fuel_logs").delete().eq("id", id).eq("plate_number", plate);
    if (error) throw error;
    await recordAudit({ companyId, relatedTable: "vehicle_fuel_logs", relatedId: vehicleId, action: "deleted", previousValue: `${plate} · ${row.fill_date} · RM ${row.cost ?? 0}` });
    refresh(vehicleId);
    return {};
  }, "Could not remove the fuel record.");
}

export type RepairInput = { serviceDate: string; odometerKm?: number | null; serviceType: string; cost?: number | null; workshop?: string; notes?: string; nextServiceDate?: string };

/** Records a repair / service (with the odometer and the workshop) in the vehicle's service history. */
export async function addRepair(vehicleId: string, r: RepairInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, db, plate, companyId, userId } = await requirePlate(vehicleId);
    if (!DATE_RE.test(r.serviceDate)) throw new Error("Enter the date.");
    if (!txt(r.serviceType)) throw new Error("Write what was serviced or repaired.");
    const { error } = await db.from("vehicle_maintenance_records").insert({
      company_id: companyId,
      vehicle_id: vehicleId,
      service_date: r.serviceDate,
      next_service_date: date(r.nextServiceDate),
      cost: num(r.cost) ?? 0,
      odometer_km: num(r.odometerKm),
      service_type: txt(r.serviceType, 200),
      workshop: txt(r.workshop, 120),
      notes: txt(r.notes, 1000),
      created_by: userId,
    });
    if (error) throw error;
    if (date(r.nextServiceDate)) await supabase.from("vehicles").update({ next_maintenance_due: r.nextServiceDate! }).eq("id", vehicleId);
    const odo = num(r.odometerKm);
    if (odo !== null) {
      const { data: p } = await db.from("vehicle_profiles").select("odometer_km").eq("plate_number", plate).maybeSingle();
      if (!p || p.odometer_km === null || Number(p.odometer_km) < odo) await db.from("vehicle_profiles").upsert({ plate_number: plate, odometer_km: odo, odometer_date: r.serviceDate }, { onConflict: "plate_number" });
    }
    await recordAudit({ companyId, relatedTable: "vehicle_maintenance_records", relatedId: vehicleId, action: "created", newValue: `${plate} · ${r.serviceDate} · ${r.serviceType}` });
    refresh(vehicleId);
    revalidatePath("/driver-logistics/maintenance");
    return {};
  }, "Could not save the repair / service.");
}
