"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { haversineKm, GEOFENCE_RADIUS_KM } from "@/lib/driverAttendance/geo";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Best-effort link to a real employee record when the typed name matches one exactly (case-insensitive) — never required. */
async function resolveDriverId(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], companyId: string, driverName: string) {
  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .ilike("full_name", driverName.trim())
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export type GeofenceResult = { distanceKm: number | null; blocked: boolean; message?: string };

/**
 * Re-checks distance server-side against the driver's stored approved
 * location — never trusts a client-computed distance alone. Returns
 * distanceKm: null (not blocked) when the driver has no approved location
 * set yet, so nobody is locked out before an admin sets it up.
 */
async function checkGeofence(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  driverId: string | null,
  latitude: number,
  longitude: number,
): Promise<GeofenceResult> {
  if (!driverId) return { distanceKm: null, blocked: false };

  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("approved_latitude, approved_longitude")
    .eq("employee_id", driverId)
    .maybeSingle();

  if (!profile || profile.approved_latitude == null || profile.approved_longitude == null) {
    return { distanceKm: null, blocked: false };
  }

  const distanceKm = haversineKm(
    { latitude, longitude },
    { latitude: profile.approved_latitude, longitude: profile.approved_longitude },
  );

  if (distanceKm > GEOFENCE_RADIUS_KM) {
    return { distanceKm, blocked: true, message: "You are outside the permitted 5 km clock-in/out area." };
  }
  return { distanceKm, blocked: false };
}

export type ClockInInput = {
  companyId: string;
  driverName: string;
  documentId: string;
  remarks?: string;
  latitude: number;
  longitude: number;
};

export async function clockIn(input: ClockInInput) {
  const { supabase } = await requireUser();
  const today = todayIso();
  const now = new Date().toISOString();
  const driverName = input.driverName.trim();

  const { data: existing, error: fetchError } = await supabase
    .from("driver_attendance")
    .select("id, clock_in_time")
    .eq("company_id", input.companyId)
    .eq("driver_name", driverName)
    .eq("attendance_date", today)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing?.clock_in_time) throw new Error("Already clocked in today.");

  const driverId = await resolveDriverId(supabase, input.companyId, driverName);
  const geofence = await checkGeofence(supabase, driverId, input.latitude, input.longitude);
  if (geofence.blocked) throw new Error(geofence.message);

  let attendanceId: string;
  if (existing) {
    const { error } = await supabase
      .from("driver_attendance")
      .update({
        clock_in_time: now,
        clock_in_document_id: input.documentId,
        clock_in_remarks: input.remarks || null,
        driver_id: driverId,
        clock_in_latitude: input.latitude,
        clock_in_longitude: input.longitude,
        clock_in_distance_km: geofence.distanceKm,
      })
      .eq("id", existing.id);
    if (error) throw error;
    attendanceId = existing.id;
  } else {
    const { data, error } = await supabase
      .from("driver_attendance")
      .insert({
        company_id: input.companyId,
        driver_id: driverId,
        driver_name: driverName,
        attendance_date: today,
        clock_in_time: now,
        clock_in_document_id: input.documentId,
        clock_in_remarks: input.remarks || null,
        clock_in_latitude: input.latitude,
        clock_in_longitude: input.longitude,
        clock_in_distance_km: geofence.distanceKm,
      })
      .select("id")
      .single();
    if (error) throw error;
    attendanceId = data.id;
  }

  await logTaskAudit({
    companyId: input.companyId,
    relatedTable: "driver_attendance",
    relatedId: attendanceId,
    action: "clock_in",
    newValue: now,
  });

  revalidatePath("/driver-logistics/attendance");
  revalidatePath("/driver-logistics");
  revalidatePath("/");
  return { attendanceId };
}

export type ClockOutInput = {
  companyId: string;
  driverName: string;
  documentId: string;
  remarks?: string;
  latitude: number;
  longitude: number;
};

export async function clockOut(input: ClockOutInput) {
  const { supabase } = await requireUser();
  const today = todayIso();
  const now = new Date().toISOString();
  const driverName = input.driverName.trim();

  const { data: existing, error: fetchError } = await supabase
    .from("driver_attendance")
    .select("id, clock_in_time, clock_out_time")
    .eq("company_id", input.companyId)
    .eq("driver_name", driverName)
    .eq("attendance_date", today)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing || !existing.clock_in_time) throw new Error("Clock in first before clocking out.");
  if (existing.clock_out_time) throw new Error("Already clocked out today.");

  const driverId = await resolveDriverId(supabase, input.companyId, driverName);
  const geofence = await checkGeofence(supabase, driverId, input.latitude, input.longitude);
  if (geofence.blocked) throw new Error(geofence.message);

  const { error } = await supabase
    .from("driver_attendance")
    .update({
      clock_out_time: now,
      clock_out_document_id: input.documentId,
      clock_out_remarks: input.remarks || null,
      clock_out_latitude: input.latitude,
      clock_out_longitude: input.longitude,
      clock_out_distance_km: geofence.distanceKm,
    })
    .eq("id", existing.id);
  if (error) throw error;

  await logTaskAudit({
    companyId: input.companyId,
    relatedTable: "driver_attendance",
    relatedId: existing.id,
    action: "clock_out",
    newValue: now,
  });

  revalidatePath("/driver-logistics/attendance");
  revalidatePath("/driver-logistics");
  revalidatePath("/");
}

export type CorrectAttendanceInput = {
  attendanceId: string;
  companyId: string;
  clockInTime?: string | null;
  clockOutTime?: string | null;
  reason: string;
};

/**
 * Manual correction — the original clock-in/out values are preserved in
 * task_audit_log (previous_value) rather than overwritten silently, so the
 * real history is always recoverable even after a correction.
 */
export async function correctAttendance(input: CorrectAttendanceInput) {
  const { supabase, userId } = await requireUser();
  if (!input.reason?.trim()) throw new Error("A reason is required to correct attendance.");

  const { data: existing, error: fetchError } = await supabase
    .from("driver_attendance")
    .select("clock_in_time, clock_out_time")
    .eq("id", input.attendanceId)
    .single();
  if (fetchError) throw fetchError;

  const nextClockIn = input.clockInTime !== undefined ? input.clockInTime : existing.clock_in_time;
  const nextClockOut = input.clockOutTime !== undefined ? input.clockOutTime : existing.clock_out_time;

  const { error } = await supabase
    .from("driver_attendance")
    .update({
      clock_in_time: nextClockIn,
      clock_out_time: nextClockOut,
      is_corrected: true,
      correction_reason: input.reason,
      corrected_by: userId,
      corrected_at: new Date().toISOString(),
    })
    .eq("id", input.attendanceId);
  if (error) throw error;

  await logTaskAudit({
    companyId: input.companyId,
    relatedTable: "driver_attendance",
    relatedId: input.attendanceId,
    action: "corrected",
    previousValue: JSON.stringify({ clock_in_time: existing.clock_in_time, clock_out_time: existing.clock_out_time }),
    newValue: JSON.stringify({ clock_in_time: nextClockIn, clock_out_time: nextClockOut }),
    reason: input.reason,
  });

  revalidatePath("/driver-logistics/attendance");
  revalidatePath("/");
}

export async function markOffDay(input: { companyId: string; driverName: string; date: string; reason?: string }) {
  const { supabase } = await requireUser();
  const driverName = input.driverName.trim();
  const { data: existing } = await supabase
    .from("driver_attendance")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("driver_name", driverName)
    .eq("attendance_date", input.date)
    .maybeSingle();

  let attendanceId: string;
  if (existing) {
    const { error } = await supabase.from("driver_attendance").update({ is_off_day: true }).eq("id", existing.id);
    if (error) throw error;
    attendanceId = existing.id;
  } else {
    const driverId = await resolveDriverId(supabase, input.companyId, driverName);
    const { data, error } = await supabase
      .from("driver_attendance")
      .insert({ company_id: input.companyId, driver_id: driverId, driver_name: driverName, attendance_date: input.date, is_off_day: true })
      .select("id")
      .single();
    if (error) throw error;
    attendanceId = data.id;
  }

  await logTaskAudit({
    companyId: input.companyId,
    relatedTable: "driver_attendance",
    relatedId: attendanceId,
    action: "marked_off_day",
    reason: input.reason,
  });
  revalidatePath("/driver-logistics/attendance");
}
