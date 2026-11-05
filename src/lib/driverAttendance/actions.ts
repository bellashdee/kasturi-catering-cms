"use server";

import { isModuleEditor } from "@/lib/moduleAccess";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { haversineKm, GEOFENCE_RADIUS_KM } from "@/lib/driverAttendance/geo";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { runAction, type ActionResult } from "@/lib/actionResult";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

type DB = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function isCompanyAdmin(supabase: DB, companyId: string): Promise<boolean> {
  return isModuleEditor(supabase, companyId, "driver-logistics");
}

/**
 * The driver is always chosen from the central staff list (a driver record), never typed.
 * The name stored on the attendance row comes from that record, not from the client. A driver
 * may only act as the record linked to their own login account; Super Admin / Company Admin may
 * act for any driver in the company.
 */
async function resolveDriver(supabase: DB, userId: string, companyId: string, driverProfileId: string) {
  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("company_id, employee_id, user_id, employees(full_name, status, user_id)")
    .eq("id", driverProfileId)
    .maybeSingle();

  if (!profile || profile.company_id !== companyId) throw new Error("Select a driver from the list.");
  if (profile.employees?.status !== "active") throw new Error("This driver is not active.");

  // "Yourself" = the driver record linked to your login, or the staff record (Staff Database) linked to your login
  const isSelf = profile.user_id === userId || profile.employees?.user_id === userId;
  if (!isSelf && !(await isCompanyAdmin(supabase, companyId))) {
    throw new Error("You can only clock in or out as yourself. Ask an admin to link your login to your name in the Staff Database.");
  }
  return { driverId: profile.employee_id, driverName: profile.employees.full_name };
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
  driverProfileId: string;
  documentId: string;
  remarks?: string;
  latitude: number;
  longitude: number;
};

async function clockInImpl(input: ClockInInput) {
  const { supabase, userId } = await requireUser();
  const today = todayInMalaysia();
  const now = new Date().toISOString();
  const { driverId, driverName } = await resolveDriver(supabase, userId, input.companyId, input.driverProfileId);

  const { data: existing, error: fetchError } = await supabase
    .from("driver_attendance")
    .select("id, clock_in_time")
    .eq("company_id", input.companyId)
    .eq("driver_id", driverId)
    .eq("attendance_date", today)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing?.clock_in_time) throw new Error("Already clocked in today.");

  const geofence = await checkGeofence(supabase, driverId, input.latitude, input.longitude);
  if (geofence.blocked) throw new Error(geofence.message);

  let attendanceId: string;
  if (existing) {
    // a row that only marked the day (e.g. off day) gets its clock-in; the database must confirm that one row changed
    const { data: updated, error } = await supabase
      .from("driver_attendance")
      .update({
        clock_in_time: now,
        clock_in_document_id: input.documentId,
        clock_in_remarks: input.remarks || null,
        driver_id: driverId,
        driver_name: driverName,
        clock_in_latitude: input.latitude,
        clock_in_longitude: input.longitude,
        clock_in_distance_km: geofence.distanceKm,
      })
      .eq("id", existing.id)
      .is("clock_in_time", null)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length !== 1) throw new Error("The clock-in was not saved. You may already be clocked in, or you do not have permission.");
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
    if (error) {
      if (error.code === "23505") throw new Error("Already clocked in today.");
      throw error;
    }
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
  return { attendanceId, at: now };
}

/** Clock in. A problem the person can fix comes back as `{ ok: false, error }` (a thrown message would be hidden in production). */
export async function clockIn(input: ClockInInput): Promise<ActionResult<{ attendanceId: string; at: string }>> {
  return runAction(() => clockInImpl(input), "Could not save the clock-in. Please try again.");
}

export type ClockOutInput = {
  companyId: string;
  driverProfileId: string;
  documentId: string;
  remarks?: string;
  latitude: number;
  longitude: number;
};

async function clockOutImpl(input: ClockOutInput) {
  const { supabase, userId } = await requireUser();
  const today = todayInMalaysia();
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const { driverId } = await resolveDriver(supabase, userId, input.companyId, input.driverProfileId);

  // the open clock-in of this person: today's, or yesterday's when the shift runs past midnight
  const { data: open, error: fetchError } = await supabase
    .from("driver_attendance")
    .select("id, clock_in_time, clock_out_time, attendance_date")
    .eq("company_id", input.companyId)
    .eq("driver_id", driverId)
    .in("attendance_date", [yesterday, today])
    .not("clock_in_time", "is", null)
    .order("clock_in_time", { ascending: false });
  if (fetchError) throw fetchError;
  const existing = (open ?? []).find((r) => !r.clock_out_time);
  if (!existing) {
    if ((open ?? []).some((r) => r.attendance_date === today && r.clock_out_time)) throw new Error("Already clocked out today.");
    throw new Error("Clock in first before clocking out.");
  }

  const geofence = await checkGeofence(supabase, driverId, input.latitude, input.longitude);
  if (geofence.blocked) throw new Error(geofence.message);

  const { data: updated, error } = await supabase
    .from("driver_attendance")
    .update({
      clock_out_time: now,
      clock_out_document_id: input.documentId,
      clock_out_remarks: input.remarks || null,
      clock_out_latitude: input.latitude,
      clock_out_longitude: input.longitude,
      clock_out_distance_km: geofence.distanceKm,
    })
    .eq("id", existing.id)
    .is("clock_out_time", null)
    .select("id");
  if (error) throw error;
  if (!updated || updated.length !== 1) throw new Error("The clock-out was not saved. You may already be clocked out, or you do not have permission.");

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
  return { attendanceId: existing.id, at: now };
}

/** Clock out of the open clock-in of this person. Returns `{ ok: false, error }` instead of throwing. */
export async function clockOut(input: ClockOutInput): Promise<ActionResult<{ attendanceId: string; at: string }>> {
  return runAction(() => clockOutImpl(input), "Could not save the clock-out. Please try again.");
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
async function correctAttendanceImpl(input: CorrectAttendanceInput) {
  const { supabase, userId } = await requireUser();
  if (!input.reason?.trim()) throw new Error("A reason is required to correct attendance.");
  if (!(await isCompanyAdmin(supabase, input.companyId))) throw new Error("Only an admin can correct attendance.");

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

async function markOffDayImpl(input: { companyId: string; driverProfileId: string; date: string; reason?: string }) {
  const { supabase, userId } = await requireUser();
  if (!(await isCompanyAdmin(supabase, input.companyId))) throw new Error("Only an admin can mark an off day.");
  const { driverId, driverName } = await resolveDriver(supabase, userId, input.companyId, input.driverProfileId);
  const { data: existing } = await supabase
    .from("driver_attendance")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("driver_id", driverId)
    .eq("attendance_date", input.date)
    .maybeSingle();

  let attendanceId: string;
  if (existing) {
    const { error } = await supabase.from("driver_attendance").update({ is_off_day: true }).eq("id", existing.id);
    if (error) throw error;
    attendanceId = existing.id;
  } else {
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

export async function correctAttendance(input: CorrectAttendanceInput): Promise<ActionResult> {
  return runAction(async () => { await correctAttendanceImpl(input); return {}; }, "Could not save the correction. Please try again.");
}

export async function markOffDay(input: { companyId: string; driverProfileId: string; date: string; reason?: string }): Promise<ActionResult> {
  return runAction(async () => { await markOffDayImpl(input); return {}; }, "Could not mark the off day. Please try again.");
}
