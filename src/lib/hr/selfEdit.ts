"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { changeFieldByKey } from "@/lib/hr/changeFields";
import { recordEditHistory } from "@/lib/hr/editHistory";
import { dobFromIc } from "@/lib/hr/ic";
import type { Database } from "@/lib/supabase/types";

/**
 * A staff member changes one detail of their own record (never anybody else's). The change is made straight away and written in the
 * edit history with their name. The staff record is reached with the service role, so every check is made here.
 */

function cleanValue(field: string, raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) throw new Error("Write the new value.");
  if (value.length > 200) throw new Error("The new value is too long.");
  if (field === "gender" && value !== "Male" && value !== "Female") throw new Error("Write Male or Female.");
  if (field === "date_of_birth" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Write the date as year-month-day, for example 1990-05-21.");
  if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Write a valid email address.");
  return value;
}

export async function updateMyDetail(input: { employeeId: string; field: string; newValue: string }): Promise<ActionResult> {
  return runAction(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    const def = changeFieldByKey(input.field);
    if (!def) throw new Error("Choose the detail you want to change.");
    const admin = createAdminClient();
    const { data: employee } = await admin.from("employees").select("*").eq("id", input.employeeId).maybeSingle();
    if (!employee || employee.user_id !== user.id) throw new Error("You can only change your own details.");
    const value = cleanValue(input.field, input.newValue);

    let oldValue: string | null;
    if (def.source === "private") {
      const { data: existing } = await admin.from("employee_private_details").select("*").eq("employee_id", employee.id).maybeSingle();
      oldValue = ((existing as Record<string, unknown> | null)?.[def.column] as string | null | undefined) ?? null;
      if ((oldValue ?? "").trim().toUpperCase() === value.toUpperCase()) throw new Error("That is already what is on your record.");
      const next: Database["public"]["Tables"]["employee_private_details"]["Insert"] = {
        employee_id: employee.id,
        company_id: employee.company_id,
        bank_name: existing?.bank_name ?? null,
        bank_account_no: existing?.bank_account_no ?? null,
        epf_no: existing?.epf_no ?? null,
        updated_at: new Date().toISOString(),
      };
      (next as Record<string, unknown>)[def.column] = value;
      const { error } = await admin.from("employee_private_details").upsert(next);
      if (error) throw error;
    } else {
      const row = employee as Record<string, unknown>;
      oldValue = def.column === "date_of_birth" ? ((row.date_of_birth as string | null) ?? dobFromIc(row.ic_passport_no as string | null) ?? null) : ((row[def.column] as string | null | undefined) ?? null);
      if ((oldValue ?? "").trim().toUpperCase() === value.toUpperCase()) throw new Error("That is already what is on your record.");
      const stored = def.column === "short_name" ? value.toUpperCase() : value;
      const patch: Record<string, string> = { [def.column]: stored };
      const { error } = await admin.from("employees").update(patch as Database["public"]["Tables"]["employees"]["Update"]).eq("id", employee.id);
      if (error) {
        if (error.code === "23505") throw new Error("That value is already used.");
        throw error;
      }
    }
    await recordEditHistory({ employeeId: employee.id, companyId: employee.company_id, editorId: user.id, changes: [{ field: input.field, oldValue, newValue: value }] });
    revalidatePath("/profile");
    revalidatePath("/hr");
    revalidatePath(`/hr/${employee.id}`);
    return {};
  }, "Could not save the change. Please try again.");
}
