"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { calcOtHours } from "@/lib/hr/overtime";
import { todayInMalaysia } from "@/lib/format";
import { untyped } from "@/lib/kitchenPurchase/shared";

export type ClaimHoursInput = { employeeId: string; workDate: string; startTime: string; endTime: string; reason: string };

const refresh = () => {
  revalidatePath("/profile/claim-hours");
  revalidatePath("/hr/claim-hours");
  revalidatePath("/profile");
};

/** A staff member of RM4,000 and above claims the extra hours worked (instead of OT). Every 8 approved hours = 1 day of replacement leave. */
export async function submitClaimHours(input: ClaimHoursInput): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) throw new Error("Choose the date you worked.");
    if (input.workDate > todayInMalaysia()) throw new Error("The date cannot be in the future.");
    const hours = calcOtHours(input.startTime, input.endTime);
    if (hours === null) throw new Error("Enter the start and end time of the extra hours.");
    const reason = input.reason.trim();
    if (reason.length < 3) throw new Error("Write what the extra work was for.");

    const supabase = await createClient();
    const db = untyped(supabase);
    const { data: emp } = await supabase.from("employees").select("id, company_id").eq("id", input.employeeId).maybeSingle();
    if (!emp) throw new Error("Your staff record was not found.");
    const { data: eligible } = await db.rpc("employee_uses_claim_hours", { target_employee_id: emp.id });
    if (eligible !== true) throw new Error("Claim Hours is for staff with a salary of RM4,000 and above. Please use the OT Form instead (or ask Finance to enter your salary first).");

    const { error } = await db.from("claim_hours").insert({
      company_id: emp.company_id,
      employee_id: emp.id,
      work_date: input.workDate,
      start_time: input.startTime,
      end_time: input.endTime,
      hours,
      reason: reason.slice(0, 500),
      status: "pending",
      created_by: session.userId,
    });
    if (error) throw error;
    refresh();
    return {};
  }, "Could not submit the claim hours.");
}

export async function deleteClaimHours(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const supabase = await createClient();
    const { data, error } = await untyped(supabase).from("claim_hours").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("This claim can no longer be deleted (it may already be approved).");
    refresh();
    return {};
  }, "Could not delete the claim.");
}

/** The OT approver approves (optionally fewer hours) or rejects a claim. */
export async function decideClaimHours(input: { id: string; approve: boolean; approvedHours?: number | null; remarks?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    const supabase = await createClient();
    const db = untyped(supabase);
    const { data: claim } = await db.from("claim_hours").select("id, hours, status, employee_id").eq("id", input.id).maybeSingle();
    if (!claim) throw new Error("Claim not found.");
    const own = await supabase.from("employees").select("id").eq("id", (claim as { employee_id: string }).employee_id).eq("user_id", session.userId).maybeSingle();
    if (own.data) throw new Error("You cannot approve your own claim.");
    let approved: number | null = null;
    if (input.approve && input.approvedHours !== undefined && input.approvedHours !== null) {
      if (!Number.isFinite(input.approvedHours) || input.approvedHours <= 0 || input.approvedHours > Number((claim as { hours: number }).hours)) throw new Error("The approved hours must be more than 0 and not more than the hours claimed.");
      approved = Math.round(input.approvedHours * 100) / 100;
    }
    if (!input.approve && !input.remarks?.trim()) throw new Error("Write the reason for rejecting.");
    const { data, error } = await db
      .from("claim_hours")
      .update({ status: input.approve ? "approved" : "rejected", approved_hours: approved, manager_remarks: input.remarks?.trim() || null, reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.id)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("You do not have permission to approve claim hours.");
    refresh();
    return {};
  }, "Could not save the decision.");
}
