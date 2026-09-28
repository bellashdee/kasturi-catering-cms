"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
};

/**
 * Drivers are HR employees — if this person already exists in HR, this just
 * adds the driver-specific extras. If not, it creates a minimal employee row
 * first (position "Driver") so HR and Driver & Logistics share one record.
 */
export async function createDriver(input: DriverInput) {
  const { supabase } = await requireUser();

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
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/driver-logistics/drivers");
  return data;
}

export async function updateDriver(driverId: string, input: Partial<DriverInput>) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("driver_profiles")
    .update({
      license_number: input.licenseNumber || null,
      license_expiry: input.licenseExpiry || null,
      notes: input.notes || null,
    })
    .eq("id", driverId);
  if (error) throw error;
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
  scheduledTime: string;
  location?: string;
  itemsDescription?: string;
  vehicleId?: string;
  driverId?: string;
  notes?: string;
};

export async function createDelivery(input: DeliveryInput) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("deliveries")
    .insert({
      company_id: input.companyId,
      catering_event_id: input.cateringEventId || null,
      scheduled_time: input.scheduledTime,
      location: input.location || null,
      items_description: input.itemsDescription || null,
      vehicle_id: input.vehicleId || null,
      driver_id: input.driverId || null,
      notes: input.notes || null,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/driver-logistics");
  return data;
}

export async function updateDeliveryDetails(deliveryId: string, input: Partial<DeliveryInput>) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("deliveries")
    .update({
      scheduled_time: input.scheduledTime,
      location: input.location || null,
      items_description: input.itemsDescription || null,
      vehicle_id: input.vehicleId || null,
      driver_id: input.driverId || null,
      notes: input.notes || null,
    })
    .eq("id", deliveryId);
  if (error) throw error;
  revalidatePath("/driver-logistics");
  revalidatePath(`/driver-logistics/${deliveryId}`);
}

export async function updateDeliveryStatus(deliveryId: string, status: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("deliveries").update({ status }).eq("id", deliveryId);
  if (error) throw error;
  revalidatePath("/driver-logistics");
  revalidatePath(`/driver-logistics/${deliveryId}`);
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
