"use server";

import { fromMalaysiaInputValue, toMalaysiaInputValue } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { assertValidAssignee } from "@/lib/driver/assignee";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type DriverInput = {
  companyId: string;
  employeeId?: string;
  fullName?: string;
  phone?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  availabilityStatus?: string;
  notes?: string;
  approvedLatitude?: number;
  approvedLongitude?: number;
  /** Login account allowed to clock in/out as this driver; null clears the link. */
  userId?: string | null;
};

async function requireCompanyAdmin(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], companyId: string) {
  const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: companyId });
  if (data !== true) throw new Error("Only an admin can manage the driver list.");
}

/**
 * Drivers are HR employees — if this person already exists in HR, this just
 * adds the driver-specific extras. If not, it creates a minimal employee row
 * first (position "Driver") so HR and Operation Management share one record.
 */
export async function createDriver(input: DriverInput) {
  const { supabase } = await requireUser();
  await requireCompanyAdmin(supabase, input.companyId);

  let employeeId = input.employeeId;
  if (!employeeId) {
    if (!input.fullName) throw new Error("Provide either an existing employee or a name for a new one.");
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .insert({
        company_id: input.companyId,
        full_name: input.fullName,
        phone: input.phone || null,
        position: "Driver",
        status: "active",
      })
      .select("id")
      .single();
    if (employeeError) throw employeeError;
    employeeId = employee.id;
  }

  const { data, error } = await supabase
    .from("driver_profiles")
    .insert({
      company_id: input.companyId,
      employee_id: employeeId,
      license_number: input.licenseNumber || null,
      license_expiry: input.licenseExpiry || null,
      availability_status: input.availabilityStatus || "available",
      notes: input.notes || null,
      approved_latitude: input.approvedLatitude ?? null,
      approved_longitude: input.approvedLongitude ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/driver-logistics/drivers");
  return data;
}

export async function updateDriver(driverId: string, input: Partial<DriverInput>) {
  const { supabase } = await requireUser();
  const { data: driver, error: driverError } = await supabase.from("driver_profiles").select("company_id").eq("id", driverId).single();
  if (driverError) throw driverError;
  await requireCompanyAdmin(supabase, driver.company_id);

  const { error } = await supabase
    .from("driver_profiles")
    .update({
      license_number: input.licenseNumber || null,
      license_expiry: input.licenseExpiry || null,
      notes: input.notes || null,
      approved_latitude: input.approvedLatitude ?? null,
      approved_longitude: input.approvedLongitude ?? null,
      ...(input.userId !== undefined ? { user_id: input.userId } : {}),
    })
    .eq("id", driverId);
  if (error) {
    if (error.code === "23505") throw new Error("That login is already linked to another driver in this company.");
    throw error;
  }
  revalidatePath("/driver-logistics/drivers");
  revalidatePath(`/driver-logistics/drivers/${driverId}`);
}

export async function updateDriverAvailability(driverId: string, status: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("driver_profiles").update({ availability_status: status }).eq("id", driverId);
  if (error) throw error;
  revalidatePath("/driver-logistics/drivers");
  revalidatePath(`/driver-logistics/drivers/${driverId}`);
  revalidatePath("/");
}

export type VehicleInput = {
  companyId: string;
  plateNumber: string;
  vehicleType?: string;
  status?: string;
  insuranceExpiry?: string;
  roadTaxExpiry?: string;
  nextMaintenanceDue?: string;
};

export async function createVehicle(input: VehicleInput) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      company_id: input.companyId,
      plate_number: input.plateNumber,
      vehicle_type: input.vehicleType || null,
      status: input.status || "active",
      insurance_expiry: input.insuranceExpiry || null,
      road_tax_expiry: input.roadTaxExpiry || null,
      next_maintenance_due: input.nextMaintenanceDue || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/driver-logistics/vehicles");
  return data;
}

export async function updateVehicle(vehicleId: string, input: Partial<VehicleInput>) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("vehicles")
    .update({
      plate_number: input.plateNumber,
      vehicle_type: input.vehicleType || null,
      status: input.status || "active",
      insurance_expiry: input.insuranceExpiry || null,
      road_tax_expiry: input.roadTaxExpiry || null,
    })
    .eq("id", vehicleId);
  if (error) throw error;
  revalidatePath("/driver-logistics/vehicles");
  revalidatePath(`/driver-logistics/vehicles/${vehicleId}`);
}

export type BulkVehicleRow = {
  plateNumber: string;
  vehicleType?: string;
  insuranceExpiry?: string;
  roadTaxExpiry?: string;
};

export async function bulkImportVehicles(companyId: string, rows: BulkVehicleRow[]) {
  const { supabase } = await requireUser();
  const payload = rows
    .filter((r) => r.plateNumber?.trim())
    .map((r) => ({
      company_id: companyId,
      plate_number: r.plateNumber.trim(),
      vehicle_type: r.vehicleType || null,
      insurance_expiry: r.insuranceExpiry || null,
      road_tax_expiry: r.roadTaxExpiry || null,
    }));
  if (payload.length === 0) return { inserted: 0 };
  const { error, count } = await supabase.from("vehicles").insert(payload, { count: "exact" });
  if (error) throw error;
  revalidatePath("/driver-logistics/vehicles");
  return { inserted: count ?? payload.length };
}

export type DeliveryInput = {
  companyId: string;
  cateringEventId?: string;
  location?: string;
  itemsDescription?: string;
  vehicleId?: string;
  /** Internal driver (employee id) - or vendorId for an external service such as Lalamove, never both. */
  driverId?: string;
  vendorId?: string;
  notes?: string;
  /** Scheduled time as typed in a datetime-local field (Malaysia time, "YYYY-MM-DDTHH:mm"); the time of creation when left out. */
  scheduledTime?: string;
};

export async function createDelivery(input: DeliveryInput) {
  const { supabase } = await requireUser();
  await assertValidAssignee(supabase, input.companyId, input.driverId, input.vendorId);
  const { data, error } = await supabase
    .from("deliveries")
    .insert({
      company_id: input.companyId,
      catering_event_id: input.cateringEventId || null,
      scheduled_time: fromMalaysiaInputValue(input.scheduledTime) ?? new Date().toISOString(),
      location: input.location || null,
      items_description: input.itemsDescription || null,
      vehicle_id: input.vehicleId || null,
      driver_id: input.driverId || null,
      delivery_vendor_id: input.vendorId || null,
      notes: input.notes || null,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error) throw error;

  await logTaskAudit({ companyId: input.companyId, relatedTable: "deliveries", relatedId: data.id, action: "task_created" });
  if (input.driverId || input.vendorId) {
    await logTaskAudit({ companyId: input.companyId, relatedTable: "deliveries", relatedId: data.id, action: "task_assigned", newValue: input.driverId ?? input.vendorId });
  }

  revalidatePath("/driver-logistics");
  return data;
}

export async function updateDeliveryDetails(deliveryId: string, input: Partial<DeliveryInput>) {
  const { supabase } = await requireUser();
  const { data: existing } = await supabase.from("deliveries").select("company_id, driver_id, delivery_vendor_id, scheduled_time").eq("id", deliveryId).single();
  if (existing) await assertValidAssignee(supabase, existing.company_id, input.driverId, input.vendorId);
  const newTime = input.scheduledTime ? fromMalaysiaInputValue(input.scheduledTime) : null;
  if (input.scheduledTime && !newTime) throw new Error("Enter a valid scheduled date and time.");

  const { error } = await supabase
    .from("deliveries")
    .update({
      ...(newTime ? { scheduled_time: newTime } : {}),
      location: input.location || null,
      items_description: input.itemsDescription || null,
      vehicle_id: input.vehicleId || null,
      driver_id: input.driverId || null,
      delivery_vendor_id: input.vendorId || null,
      notes: input.notes || null,
    })
    .eq("id", deliveryId);
  if (error) throw error;

  if (existing && newTime && toMalaysiaInputValue(existing.scheduled_time) !== toMalaysiaInputValue(newTime)) {
    await logTaskAudit({
      companyId: existing.company_id,
      relatedTable: "deliveries",
      relatedId: deliveryId,
      action: "schedule_changed",
      previousValue: existing.scheduled_time ?? undefined,
      newValue: newTime,
    });
  }

  const previousAssignee = existing?.driver_id ?? existing?.delivery_vendor_id ?? undefined;
  const nextAssignee = input.driverId ?? input.vendorId;
  if (existing && nextAssignee && nextAssignee !== previousAssignee) {
    await logTaskAudit({
      companyId: existing.company_id,
      relatedTable: "deliveries",
      relatedId: deliveryId,
      action: "task_assigned",
      previousValue: previousAssignee,
      newValue: nextAssignee,
    });
  }

  revalidatePath("/driver-logistics");
  revalidatePath(`/driver-logistics/${deliveryId}`);
}

export async function updateDeliveryStatus(deliveryId: string, status: string) {
  if (status === "delivered") {
    throw new Error("Use 'Complete Task' to mark a delivery as delivered — it requires proof of delivery.");
  }
  const { supabase } = await requireUser();
  const { data: existing } = await supabase.from("deliveries").select("company_id, status").eq("id", deliveryId).single();

  const { error } = await supabase.from("deliveries").update({ status }).eq("id", deliveryId);
  if (error) throw error;

  if (existing) {
    await logTaskAudit({
      companyId: existing.company_id,
      relatedTable: "deliveries",
      relatedId: deliveryId,
      action: status === "in_transit" ? "task_started" : "status_changed",
      previousValue: existing.status,
      newValue: status,
    });
  }

  revalidatePath("/driver-logistics");
  revalidatePath(`/driver-logistics/${deliveryId}`);
  revalidatePath("/");
}

/**
 * Proof uploads are attached generically via task_proofs (see
 * src/lib/taskProofs), so this is the one delivery-specific side effect: the
 * first proof flips the gate from "no_proof" to "proof_uploaded".
 */
export async function markDeliveryProofUploaded(deliveryId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("deliveries").select("proof_status").eq("id", deliveryId).single();
  if (data?.proof_status === "no_proof") {
    await supabase.from("deliveries").update({ proof_status: "proof_uploaded" }).eq("id", deliveryId);
  }
  revalidatePath(`/driver-logistics/${deliveryId}`);
}

export type CompleteDeliveryInput = {
  deliveryId: string;
  companyId: string;
  completionRemarks?: string;
  adminOverride?: boolean;
  overrideReason?: string;
};

/**
 * The proof-of-delivery gate: a delivery can only become "delivered" once
 * proof has been uploaded, unless an authorized Admin/Management user
 * explicitly overrides it with a recorded reason.
 */
export async function completeDeliveryTask(input: CompleteDeliveryInput) {
  const { supabase, userId } = await requireUser();

  const { data: delivery, error: fetchError } = await supabase
    .from("deliveries")
    .select("proof_status, status")
    .eq("id", input.deliveryId)
    .single();
  if (fetchError) throw fetchError;

  const hasProof = delivery.proof_status === "proof_uploaded" || delivery.proof_status === "completed";
  if (!hasProof && !input.adminOverride) {
    throw new Error("This task requires proof of delivery before it can be marked completed — or an authorized override with a reason.");
  }
  if (input.adminOverride && !input.overrideReason?.trim()) {
    throw new Error("A reason is required for an admin override.");
  }

  const { error } = await supabase
    .from("deliveries")
    .update({
      status: "delivered",
      proof_status: "completed",
      completion_remarks: input.completionRemarks || null,
      completed_at: new Date().toISOString(),
      admin_override: !!input.adminOverride,
      admin_override_by: input.adminOverride ? userId : null,
      admin_override_reason: input.adminOverride ? input.overrideReason || null : null,
    })
    .eq("id", input.deliveryId);
  if (error) throw error;

  await logTaskAudit({
    companyId: input.companyId,
    relatedTable: "deliveries",
    relatedId: input.deliveryId,
    action: input.adminOverride ? "admin_override" : "task_completed",
    previousValue: delivery.status,
    newValue: "delivered",
    reason: input.adminOverride ? input.overrideReason : undefined,
  });

  revalidatePath("/driver-logistics");
  revalidatePath(`/driver-logistics/${input.deliveryId}`);
  revalidatePath("/");
}

export type MaintenanceInput = {
  companyId: string;
  vehicleId: string;
  serviceDate: string;
  nextServiceDate?: string;
  cost: number;
  notes?: string;
  documentId?: string;
};

/**
 * Logging a service record also updates vehicles.next_maintenance_due — the one
 * value the dashboard's "due soon" alert reads — so it always reflects the most
 * recent service instead of drifting from this history.
 */
export async function createMaintenanceRecord(input: MaintenanceInput) {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("vehicle_maintenance_records")
    .insert({
      company_id: input.companyId,
      vehicle_id: input.vehicleId,
      service_date: input.serviceDate,
      next_service_date: input.nextServiceDate || null,
      cost: input.cost,
      notes: input.notes || null,
      document_id: input.documentId || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.nextServiceDate) {
    await supabase.from("vehicles").update({ next_maintenance_due: input.nextServiceDate }).eq("id", input.vehicleId);
  }

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.documentId);
  }

  revalidatePath("/driver-logistics/maintenance");
  revalidatePath(`/driver-logistics/vehicles/${input.vehicleId}`);
  revalidatePath("/");
  return data;
}

export type DriverExpenseInput = {
  companyId: string;
  deliveryId?: string;
  vehicleId?: string;
  driverId?: string;
  category: string;
  distanceKm?: number;
  amount: number;
  expenseDate: string;
  notes?: string;
  documentId?: string;
};

export async function createDriverExpense(input: DriverExpenseInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("driver_expenses").insert({
    company_id: input.companyId,
    delivery_id: input.deliveryId || null,
    vehicle_id: input.vehicleId || null,
    driver_id: input.driverId || null,
    category: input.category,
    distance_km: input.distanceKm || null,
    amount: input.amount,
    expense_date: input.expenseDate,
    notes: input.notes || null,
    document_id: input.documentId || null,
    created_by: userId,
  });
  if (error) throw error;

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.documentId);
  }

  revalidatePath("/driver-logistics/expenses");
  revalidatePath("/");
}
