"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { WASTAGE_PATH, cleanWastageInput as clean, describeWastage as describe, type WastageInput, type WastageRow } from "@/lib/kitchen/wastage";

export type { WastageInput };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

function refresh() {
  revalidatePath(WASTAGE_PATH);
  revalidatePath("/reports/monthly-breakdown");
}

/** Records food that was thrown away. Information only: nothing is added to any cost or taken from the stock. */
export async function createWastage(input: WastageInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const values = clean(input);
    const { supabase, userId } = await requireUser();
    const clientId = input.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id) ? { id: input.id } : {};
    const { data, error } = await supabase.from("wastage_log").insert({ ...clientId, ...values, company_id: input.companyId, created_by: userId }).select("id").single();
    if (error || !data) throw error ?? new Error("Could not save the entry.");
    await recordAudit({ companyId: input.companyId, relatedTable: "wastage_log", relatedId: data.id, action: "created", newValue: describe(values) });
    refresh();
    return { id: data.id };
  }, "Could not save the entry. Please try again.");
}

/** Changes an entry (the person who recorded it, or an admin of the company). */
export async function updateWastage(id: string, input: WastageInput): Promise<ActionResult> {
  return runAction(async () => {
    const values = clean(input);
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("wastage_log").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This entry was not found (it may have been deleted).");
    const { data: changed, error } = await supabase.from("wastage_log").update({ ...values }).eq("id", id).select("id");
    if (error) throw error;
    if (!changed?.length) throw new Error("Only the person who recorded this entry, or an admin of the company, can change it.");
    await recordAudit({ companyId: before.company_id, relatedTable: "wastage_log", relatedId: id, action: "updated", previousValue: describe(before), newValue: describe(values) });
    refresh();
    return {};
  }, "Could not save the changes. Please try again.");
}

/** Deletes an entry; returns it so the delete can be undone. */
export async function deleteWastage(id: string): Promise<ActionResult<{ row: WastageRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("wastage_log").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This entry was not found (it may already be deleted).");
    const { data: removed, error } = await supabase.from("wastage_log").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!removed?.length) throw new Error("Only the person who recorded this entry, or an admin of the company, can delete it.");
    await recordAudit({ companyId: before.company_id, relatedTable: "wastage_log", relatedId: id, action: "deleted", previousValue: describe(before), newValue: "Deleted" });
    refresh();
    return { row: before };
  }, "Could not delete the entry. Please try again.");
}

/** Undo of a delete: the entry comes back as it was. */
export async function restoreWastage(row: WastageRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    const { error } = await supabase.from("wastage_log").insert(row);
    if (error) throw new Error("Could not put the entry back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "wastage_log", relatedId: row.id, action: "restored", newValue: "Put back after it was deleted" });
    refresh();
    return {};
  }, "Could not put the entry back.");
}
