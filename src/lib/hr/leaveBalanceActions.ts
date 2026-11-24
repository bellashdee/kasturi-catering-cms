"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { untyped } from "@/lib/kitchenPurchase/shared";

export type LeaveBalanceInput = { employeeId: string; year: number; alEntitled: string; alTakenBefore: string; mcEntitled: string; mcTakenBefore: string; notes: string };

const days = (v: string, label: string, allowBlank: boolean): number | null => {
  const t = v.trim();
  if (!t) {
    if (allowBlank) return null;
    return 0;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 365) throw new Error(`${label} must be a number of days from 0 to 365.`);
  if (Math.round(n * 2) !== n * 2) throw new Error(`${label} can only be in whole or half days.`);
  return n;
};

/** HR keys in a staff member's leave for one year by hand: days taken before the system, and the company's own entitlement (blank = Employment Act). */
export async function saveLeaveBalance(input: LeaveBalanceInput): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) throw new Error("The year is not valid.");
    const supabase = await createClient();
    const { data: emp } = await supabase.from("employees").select("id, company_id").eq("id", input.employeeId).maybeSingle();
    if (!emp) throw new Error("Staff record not found.");
    const row = {
      employee_id: emp.id,
      company_id: emp.company_id,
      year: input.year,
      al_entitled: days(input.alEntitled, "AL entitlement", true),
      al_taken_before: days(input.alTakenBefore, "AL taken before", false) ?? 0,
      mc_entitled: days(input.mcEntitled, "MC entitlement", true),
      mc_taken_before: days(input.mcTakenBefore, "MC taken before", false) ?? 0,
      notes: input.notes.trim().slice(0, 300) || null,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await untyped(supabase).from("leave_balance_adjustments").upsert(row, { onConflict: "employee_id,year" }).select("employee_id");
    if (error) {
      if (/row-level security/i.test(error.message)) throw new Error("Only HR (leave editors) and company admins can change a leave balance.");
      throw error;
    }
    if (!data?.length) throw new Error("Only HR (leave editors) and company admins can change a leave balance.");
    revalidatePath("/profile");
    revalidatePath(`/hr/${emp.id}`);
    revalidatePath("/hr/leave");
    return {};
  }, "Could not save the leave balance.");
}
