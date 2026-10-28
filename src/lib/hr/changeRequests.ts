"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { changeFieldByKey } from "@/lib/hr/changeFields";
import { dobFromIc } from "@/lib/hr/ic";
import type { Database } from "@/lib/supabase/types";

/**
 * A staff member cannot change their own details. They ask for a change here; Madam Penny or Nabilah (the Super Admins) approve
 * or reject it, and only an approval changes the staff record. The table is reached with the service role, so every check is made here.
 */

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: isSuper } = await supabase.rpc("current_user_is_super_admin");
  return { userId: user.id, isSuper: isSuper === true, admin: createAdminClient() };
}

function cleanValue(field: string, raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) throw new Error("Write the new value.");
  if (value.length > 200) throw new Error("The new value is too long.");
  if (field === "gender" && value !== "Male" && value !== "Female") throw new Error("Write Male or Female.");
  if (field === "date_of_birth" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Write the date as year-month-day, for example 1990-05-21.");
  if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Write a valid email address.");
  return value;
}

async function currentValue(admin: ReturnType<typeof createAdminClient>, employeeId: string, field: string): Promise<string | null> {
  const def = changeFieldByKey(field);
  if (!def) return null;
  if (def.source === "private") {
    const { data } = await admin.from("employee_private_details").select("*").eq("employee_id", employeeId).maybeSingle();
    return ((data as Record<string, unknown> | null)?.[def.column] as string | null | undefined) ?? null;
  }
  const { data } = await admin.from("employees").select("*").eq("id", employeeId).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (def.column === "date_of_birth") return ((row?.date_of_birth as string | null) ?? dobFromIc(row?.ic_passport_no as string | null)) ?? null;
  return (row?.[def.column] as string | null | undefined) ?? null;
}

/** A staff member asks to change one detail of their own record. */
export async function requestStaffChange(input: { employeeId: string; field: string; newValue: string; reason?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { userId, admin } = await signedIn();
    const def = changeFieldByKey(input.field);
    if (!def) throw new Error("Choose the detail you want to change.");
    const { data: employee } = await admin.from("employees").select("id, company_id, user_id").eq("id", input.employeeId).maybeSingle();
    if (!employee || employee.user_id !== userId) throw new Error("You can only ask to change your own details.");
    const newValue = cleanValue(input.field, input.newValue);
    const old = await currentValue(admin, employee.id, input.field);
    if ((old ?? "").trim().toUpperCase() === newValue.toUpperCase()) throw new Error("That is already what is on your record.");
    const { data: waiting } = await admin.from("employee_change_requests").select("id").eq("employee_id", employee.id).eq("field", input.field).eq("status", "pending").maybeSingle();
    if (waiting) throw new Error("You already asked to change this detail. Please wait for the answer.");
    const { data: created, error } = await admin
      .from("employee_change_requests")
      .insert({ employee_id: employee.id, company_id: employee.company_id, requested_by: userId, field: input.field, old_value: old, new_value: newValue, reason: input.reason?.trim().slice(0, 500) || null })
      .select("id")
      .single();
    if (error) throw error;
    await recordAudit({ companyId: employee.company_id, relatedTable: "employee_change_requests", relatedId: created.id, action: "requested", newValue: `${def.label}: ${old ?? "—"} → ${newValue}` });
    revalidatePath("/profile");
    revalidatePath("/hr");
    return {};
  }, "Could not send the request. Please try again.");
}

/** A staff member takes back a request that is still waiting. */
export async function cancelStaffChange(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { userId, admin } = await signedIn();
    const { data: row } = await admin.from("employee_change_requests").select("id, requested_by, status").eq("id", id).maybeSingle();
    if (!row || row.requested_by !== userId) throw new Error("This request was not found.");
    if (row.status !== "pending") throw new Error("This request has already been answered.");
    const { error } = await admin.from("employee_change_requests").delete().eq("id", id).eq("status", "pending");
    if (error) throw error;
    revalidatePath("/profile");
    revalidatePath("/hr");
    return {};
  }, "Could not take back the request.");
}

/** Madam Penny or Nabilah approves (the staff record is changed) or rejects a request. */
export async function decideStaffChange(id: string, decision: "approved" | "rejected", note?: string): Promise<ActionResult> {
  return runAction(async () => {
    const { userId, isSuper, admin } = await signedIn();
    if (!isSuper) throw new Error("Only Madam Penny or Nabilah can approve or reject a change.");
    const { data: row } = await admin.from("employee_change_requests").select("*").eq("id", id).maybeSingle();
    if (!row) throw new Error("This request was not found.");
    if (row.status !== "pending") throw new Error("This request has already been answered.");
    const def = changeFieldByKey(row.field);
    if (decision === "approved") {
      if (!def) throw new Error("This detail can no longer be changed.");
      if (def.source === "private") {
        const { data: existing } = await admin.from("employee_private_details").select("*").eq("employee_id", row.employee_id).maybeSingle();
        const next: Database["public"]["Tables"]["employee_private_details"]["Insert"] = {
          employee_id: row.employee_id,
          company_id: row.company_id,
          bank_name: existing?.bank_name ?? null,
          bank_account_no: existing?.bank_account_no ?? null,
          epf_no: existing?.epf_no ?? null,
          updated_at: new Date().toISOString(),
        };
        (next as Record<string, unknown>)[def.column] = row.new_value;
        const { error } = await admin.from("employee_private_details").upsert(next);
        if (error) throw error;
      } else {
        const patch: Record<string, string> = { [def.column]: def.column === "short_name" ? row.new_value.toUpperCase() : row.new_value };
        const { error } = await admin.from("employees").update(patch as Database["public"]["Tables"]["employees"]["Update"]).eq("id", row.employee_id);
        if (error) throw error;
      }
    }
    const { error: markError } = await admin
      .from("employee_change_requests")
      .update({ status: decision, decided_by: userId, decided_at: new Date().toISOString(), decision_note: note?.trim().slice(0, 500) || null })
      .eq("id", id)
      .eq("status", "pending");
    if (markError) throw markError;
    await recordAudit({ companyId: row.company_id, relatedTable: "employee_change_requests", relatedId: id, action: decision, previousValue: `${def?.label ?? row.field}: ${row.old_value ?? "—"}`, newValue: `${row.new_value}${note ? ` · ${note}` : ""}` });
    revalidatePath("/profile");
    revalidatePath("/hr");
    revalidatePath(`/hr/${row.employee_id}`);
    return {};
  }, "Could not save the decision. Please try again.");
}
