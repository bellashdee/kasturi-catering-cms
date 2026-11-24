"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { todayInMalaysia } from "@/lib/format";

export type MileageTripInput = { id?: string; employeeId: string; tripDate: string; from: string; to: string; purpose: string; startKm: number; endKm: number; purposeCode: number };

async function ownEmployee(employeeId: string) {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("id, company_id").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("The staff record was not found.");
  return { supabase, session, emp };
}

/** Adds (or corrects) one trip of the Mileage Log. */
export async function saveMileageTrip(input: MileageTripInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, session, emp } = await ownEmployee(input.employeeId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.tripDate)) throw new Error("Choose the date of the trip.");
    if (input.tripDate > todayInMalaysia()) throw new Error("The date cannot be in the future.");
    const from = input.from.trim();
    const to = input.to.trim();
    if (!from || !to) throw new Error("Write where the trip started (From) and where it went (To).");
    if (!Number.isFinite(input.startKm) || input.startKm < 0) throw new Error("Enter the start mileage (the odometer reading when you started).");
    if (!Number.isFinite(input.endKm) || input.endKm < input.startKm) throw new Error("The end mileage must be the same as or more than the start mileage.");
    if (input.endKm - input.startKm > 3000) throw new Error("One trip cannot be more than 3,000 km. Check the readings.");
    if (![1, 2, 3, 4, 5].includes(input.purposeCode)) throw new Error("Choose the purpose code.");
    const row = {
      trip_date: input.tripDate,
      from_place: from.slice(0, 120),
      to_place: to.slice(0, 120),
      purpose: input.purpose.trim().slice(0, 300) || null,
      start_km: Math.round(input.startKm * 10) / 10,
      end_km: Math.round(input.endKm * 10) / 10,
      purpose_code: input.purposeCode,
    };
    const db = untyped(supabase);
    const { error } = input.id
      ? await db.from("mileage_logs").update({ ...row, updated_at: new Date().toISOString() }).eq("id", input.id).eq("employee_id", emp.id)
      : await db.from("mileage_logs").insert({ ...row, employee_id: emp.id, company_id: emp.company_id, created_by: session.userId });
    if (error) throw error;
    revalidatePath("/profile/mileage");
    return {};
  }, "Could not save the trip.");
}

export async function deleteMileageTrip(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const supabase = await createClient();
    const { data, error } = await untyped(supabase).from("mileage_logs").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("The trip was not found.");
    revalidatePath("/profile/mileage");
    return {};
  }, "Could not delete the trip.");
}

/** The note of the month (the NOTES box of the Mileage Log). */
export async function saveMileageNotes(employeeId: string, month: string, notes: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, emp } = await ownEmployee(employeeId);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("The month is not valid.");
    const { error } = await untyped(supabase)
      .from("mileage_log_months")
      .upsert({ employee_id: emp.id, company_id: emp.company_id, month: `${month}-01`, notes: notes.trim().slice(0, 1000) || null, updated_at: new Date().toISOString() }, { onConflict: "employee_id,month" });
    if (error) throw error;
    revalidatePath("/profile/mileage");
    return {};
  }, "Could not save the notes.");
}
