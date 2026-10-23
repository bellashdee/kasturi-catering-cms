"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { fromMalaysiaInputValue } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";

type Tables = Database["public"]["Tables"];

/** What an Undo needs to put a deleted record back (the rows as they were, with the same ids). */
export type RecordUndo = {
  kind: "delivery" | "maintenance" | "vehicle" | "driver";
  label: string;
  rows: Record<string, unknown>[];
  /** rows that were removed together with the main rows (a vehicle's service records) */
  children?: Record<string, unknown>[];
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

function refresh() {
  revalidatePath("/driver-logistics");
  revalidatePath("/driver-logistics/maintenance");
  revalidatePath("/driver-logistics/vehicles");
  revalidatePath("/driver-logistics/drivers");
  revalidatePath("/driver-logistics/dashboard");
  revalidatePath("/");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- deliveries

export type DeliveryQuickEdit = { id: string; scheduledTime: string; location: string; itemsDescription: string; notes: string };

/** Quick edit of a delivery from the list: only the fields shown there (the driver, vehicle and status stay as they are). */
export async function updateDeliveryQuick(input: DeliveryQuickEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const time = fromMalaysiaInputValue(input.scheduledTime);
    if (!time) throw new Error("Enter a valid scheduled date and time.");
    const { data, error } = await supabase
      .from("deliveries")
      .update({ scheduled_time: time, location: input.location.trim() || null, items_description: input.itemsDescription.trim() || null, notes: input.notes.trim() || null })
      .eq("id", input.id)
      .select("id, company_id");
    if (error) throw error;
    if (!data || data.length !== 1) throw new Error("The change was not saved. The delivery may have been deleted, or you may not have permission.");
    await recordAudit({ companyId: data[0].company_id, relatedTable: "deliveries", relatedId: input.id, action: "delivery_edited", newValue: `${time} · ${input.location.trim()}` });
    refresh();
    return {};
  }, "Could not save the delivery. Please try again.");
}

/**
 * Deletes a delivery that has not been done: not delivered, no proof of delivery and no expense linked to it (cancel it instead).
 * There is no delete policy for deliveries, so the permission is checked first (the same company access as editing) and the delete
 * itself uses the service role.
 */
export async function deleteDelivery(id: string): Promise<ActionResult<{ undo: RecordUndo }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: row } = await supabase.from("deliveries").select("*").eq("id", id).maybeSingle();
    if (!row) throw new Error("This delivery was not found (it may already be deleted).");
    if (row.status === "delivered") throw new Error("A delivery that was delivered cannot be deleted: it is a record of work done.");
    const [{ count: proofs }, { count: expenses }] = await Promise.all([
      supabase.from("task_proofs").select("id", { count: "exact", head: true }).eq("related_table", "deliveries").eq("related_id", id),
      supabase.from("driver_expenses").select("id", { count: "exact", head: true }).eq("delivery_id", id),
    ]);
    if ((proofs ?? 0) > 0) throw new Error("This delivery has proof of delivery uploaded, so it cannot be deleted. Cancel it instead.");
    if ((expenses ?? 0) > 0) throw new Error("There are expenses linked to this delivery, so it cannot be deleted. Cancel it instead.");
    const { data: touched, error: permError } = await supabase.from("deliveries").update({ status: row.status }).eq("id", id).select("id");
    if (permError) throw permError;
    if (!touched || touched.length !== 1) throw new Error("You do not have permission to delete this delivery.");
    const { error } = await createAdminClient().from("deliveries").delete().eq("id", id).eq("company_id", row.company_id);
    if (error) throw new Error("The delivery could not be deleted. Cancel it instead.");
    await recordAudit({ companyId: row.company_id, relatedTable: "deliveries", relatedId: id, action: "deleted", previousValue: `${row.scheduled_time} · ${row.location ?? ""}` });
    refresh();
    return { undo: { kind: "delivery" as const, label: `Delivery${row.location ? `: ${row.location}` : ""}`, rows: [row] } };
  }, "Could not delete the delivery. Please try again.");
}

// ---- service records

export type MaintenanceQuickEdit = { id: string; serviceDate: string; nextServiceDate: string; cost: number; notes: string };

export async function updateMaintenanceQuick(input: MaintenanceQuickEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!DATE_RE.test(input.serviceDate)) throw new Error("Select the service date.");
    if (input.nextServiceDate && !DATE_RE.test(input.nextServiceDate)) throw new Error("The next service date is not valid.");
    if (!Number.isFinite(input.cost) || input.cost < 0) throw new Error("Enter the cost (0 or more).");
    const { data, error } = await supabase
      .from("vehicle_maintenance_records")
      .update({ service_date: input.serviceDate, next_service_date: input.nextServiceDate || null, cost: input.cost, notes: input.notes.trim() || null })
      .eq("id", input.id)
      .select("id, vehicle_id");
    if (error) throw error;
    if (!data || data.length !== 1) throw new Error("The change was not saved. The record may have been deleted, or you may not have permission.");
    // the vehicle's "next service due" follows its latest next-service date
    const { data: latest } = await supabase.from("vehicle_maintenance_records").select("next_service_date").eq("vehicle_id", data[0].vehicle_id).not("next_service_date", "is", null).order("service_date", { ascending: false }).limit(1);
    await supabase.from("vehicles").update({ next_maintenance_due: latest?.[0]?.next_service_date ?? null }).eq("id", data[0].vehicle_id);
    refresh();
    return {};
  }, "Could not save the service record. Please try again.");
}

export async function deleteMaintenance(id: string): Promise<ActionResult<{ undo: RecordUndo }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: row } = await supabase.from("vehicle_maintenance_records").select("*").eq("id", id).maybeSingle();
    if (!row) throw new Error("This service record was not found (it may already be deleted).");
    const { data: gone, error } = await supabase.from("vehicle_maintenance_records").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!gone || gone.length !== 1) throw new Error("You do not have permission to delete this service record.");
    const { data: latest } = await supabase.from("vehicle_maintenance_records").select("next_service_date").eq("vehicle_id", row.vehicle_id).not("next_service_date", "is", null).order("service_date", { ascending: false }).limit(1);
    await supabase.from("vehicles").update({ next_maintenance_due: latest?.[0]?.next_service_date ?? null }).eq("id", row.vehicle_id);
    await recordAudit({ companyId: row.company_id, relatedTable: "vehicle_maintenance_records", relatedId: id, action: "deleted", previousValue: `${row.service_date} · RM ${row.cost ?? 0}` });
    refresh();
    return { undo: { kind: "maintenance" as const, label: `Service record of ${row.service_date}`, rows: [row] } };
  }, "Could not delete the service record. Please try again.");
}

// ---- vehicles (one plate can have a record per company: the list shows them as one)

export async function deleteVehicles(ids: string[]): Promise<ActionResult<{ undo: RecordUndo }>> {
  return runAction(async () => {
    if (ids.length === 0) throw new Error("Nothing to delete.");
    const { supabase } = await requireUser();
    const { data: rows } = await supabase.from("vehicles").select("*").in("id", ids);
    if (!rows || rows.length === 0) throw new Error("This vehicle was not found (it may already be deleted).");
    const [{ count: deliveries }, { count: expenses }, { data: records }] = await Promise.all([
      supabase.from("deliveries").select("id", { count: "exact", head: true }).in("vehicle_id", ids),
      supabase.from("driver_expenses").select("id", { count: "exact", head: true }).in("vehicle_id", ids),
      supabase.from("vehicle_maintenance_records").select("*").in("vehicle_id", ids),
    ]);
    if ((deliveries ?? 0) > 0 || (expenses ?? 0) > 0) throw new Error("This vehicle is used in deliveries or expenses, so it cannot be deleted. Set its status to inactive instead.");
    for (const r of rows) {
      const { data: touched, error: permError } = await supabase.from("vehicles").update({ status: r.status }).eq("id", r.id).select("id");
      if (permError) throw permError;
      if (!touched || touched.length !== 1) throw new Error("You do not have permission to delete this vehicle.");
    }
    // there is no delete policy for vehicles: access was checked above, the delete uses the service role (its service records go with it)
    const { error } = await createAdminClient().from("vehicles").delete().in("id", rows.map((r) => r.id));
    if (error) throw new Error("The vehicle could not be deleted. Set its status to inactive instead.");
    for (const r of rows) await recordAudit({ companyId: r.company_id, relatedTable: "vehicles", relatedId: r.id, action: "deleted", previousValue: r.plate_number });
    refresh();
    return { undo: { kind: "vehicle" as const, label: `Vehicle ${rows[0].plate_number}`, rows, children: records ?? [] } };
  }, "Could not delete the vehicle. Please try again.");
}

// ---- drivers (removes the driver profile; the person stays in HR)

export async function deleteDrivers(ids: string[]): Promise<ActionResult<{ undo: RecordUndo }>> {
  return runAction(async () => {
    if (ids.length === 0) throw new Error("Nothing to delete.");
    const { supabase } = await requireUser();
    const { data: rows } = await supabase.from("driver_profiles").select("*, employees(full_name)").in("id", ids);
    if (!rows || rows.length === 0) throw new Error("This driver was not found (it may already be removed).");
    const { count: clocked } = await supabase.from("event_attendance").select("id", { count: "exact", head: true }).in("driver_profile_id", ids);
    if ((clocked ?? 0) > 0) throw new Error("This driver has event clock-in records, so the driver profile cannot be removed. Set the driver to unavailable instead.");
    const plain = rows.map((r) => {
      const { employees: _employees, ...profile } = r;
      void _employees;
      return profile;
    });
    const { data: gone, error } = await supabase.from("driver_profiles").delete().in("id", ids).select("id");
    if (error) throw error;
    if (!gone || gone.length === 0) throw new Error("You do not have permission to remove this driver.");
    for (const r of plain) await recordAudit({ companyId: r.company_id, relatedTable: "driver_profiles", relatedId: r.id, action: "deleted", previousValue: rows[0].employees?.full_name ?? undefined });
    refresh();
    return { undo: { kind: "driver" as const, label: `Driver ${rows[0].employees?.full_name ?? ""}`.trim(), rows: plain } };
  }, "Could not remove the driver. Please try again.");
}

// ---- undo

/** A vehicle's "next service due" follows its latest next-service date. */
async function syncNextMaintenance(supabase: Awaited<ReturnType<typeof createClient>>, vehicleIds: string[]) {
  for (const id of new Set(vehicleIds)) {
    const { data: latest } = await supabase.from("vehicle_maintenance_records").select("next_service_date").eq("vehicle_id", id).not("next_service_date", "is", null).order("service_date", { ascending: false }).limit(1);
    await supabase.from("vehicles").update({ next_maintenance_due: latest?.[0]?.next_service_date ?? null }).eq("id", id);
  }
}

/** Puts deleted records back with the same ids (the insert policies of each table keep this inside the person's companies). */
export async function restoreRecords(undo: RecordUndo): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const put = async (table: "deliveries" | "vehicle_maintenance_records" | "vehicles" | "driver_profiles", rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase.from(table).insert(rows as Tables[typeof table]["Insert"][]);
      if (error) {
        if (error.code === "23505") throw new Error("This record was already put back.");
        throw error;
      }
    };
    if (undo.kind === "delivery") await put("deliveries", undo.rows);
    else if (undo.kind === "maintenance") {
      await put("vehicle_maintenance_records", undo.rows);
      await syncNextMaintenance(supabase, undo.rows.map((r) => String(r.vehicle_id)));
    }
    else if (undo.kind === "driver") await put("driver_profiles", undo.rows);
    else {
      await put("vehicles", undo.rows);
      await put("vehicle_maintenance_records", undo.children ?? []);
    }
    refresh();
    return {};
  }, "Could not undo. Please try again.");
}
