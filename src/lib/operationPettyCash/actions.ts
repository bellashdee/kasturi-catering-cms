"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { todayInMalaysia } from "@/lib/format";
import type { EntryType, OperationPettyCashRow } from "./constants";

async function requireHolder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data } = await supabase.rpc("user_can_use_operation_petty_cash");
  if (data !== true) throw new Error("The Operation petty cash is private. Only the person who holds it and the Director of Finance can use it.");
  return { supabase, userId: user.id };
}

/** Whether the signed-in person may open the Operation petty cash (used to show or hide the tab). */
export async function canUseOperationPettyCash(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("user_can_use_operation_petty_cash");
  return data === true;
}

export type PettyCashEntryInput = {
  companyId: string;
  entryType: EntryType;
  entryDate: string;
  category?: string;
  description?: string;
  amount: number;
  documentId?: string;
};

function validate(input: PettyCashEntryInput) {
  if (input.entryType !== "top_up" && input.entryType !== "expense") throw new Error("Choose whether the money was received or spent.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) throw new Error("Select the date.");
  if (input.entryDate > todayInMalaysia()) throw new Error("The date cannot be in the future.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
  if (input.entryType === "expense" && !input.description?.trim()) throw new Error("Write what the money was spent on.");
}

const label = (r: { entry_type: string; amount: number | string; entry_date: string; description: string | null }) =>
  `${r.entry_type === "top_up" ? "Received" : "Spent"} RM ${Number(r.amount).toFixed(2)} · ${r.entry_date}${r.description ? ` · ${r.description}` : ""}`;

function refresh() {
  revalidatePath("/driver-logistics/petty-cash");
}

export async function createPettyCashEntry(input: PettyCashEntryInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireHolder();
    validate(input);
    const { data, error } = await supabase
      .from("operation_petty_cash")
      .insert({
        company_id: input.companyId,
        entry_type: input.entryType,
        entry_date: input.entryDate,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        amount: input.amount,
        document_id: input.documentId || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    await recordAudit({ companyId: input.companyId, relatedTable: "operation_petty_cash", relatedId: data.id, action: "petty_cash_added", newValue: label({ entry_type: input.entryType, amount: input.amount, entry_date: input.entryDate, description: input.description ?? null }) });
    refresh();
    return { id: data.id };
  }, "Could not save the entry. Please try again.");
}

export async function updatePettyCashEntry(id: string, input: PettyCashEntryInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireHolder();
    validate(input);
    const { data: before } = await supabase.from("operation_petty_cash").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This entry was not found (it may have been deleted).");
    const { data: updated, error } = await supabase
      .from("operation_petty_cash")
      .update({
        company_id: input.companyId,
        entry_type: input.entryType,
        entry_date: input.entryDate,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        amount: input.amount,
        document_id: input.documentId ?? before.document_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length !== 1) throw new Error("The change was not saved. You may not have permission.");
    await recordAudit({ companyId: input.companyId, relatedTable: "operation_petty_cash", relatedId: id, action: "petty_cash_edited", previousValue: label(before), newValue: label({ entry_type: input.entryType, amount: input.amount, entry_date: input.entryDate, description: input.description ?? null }) });
    refresh();
    return {};
  }, "Could not save the change. Please try again.");
}

/** Deletes an entry and returns it, so the person can Undo (restorePettyCashEntry). */
export async function deletePettyCashEntry(id: string): Promise<ActionResult<{ row: OperationPettyCashRow }>> {
  return runAction(async () => {
    const { supabase } = await requireHolder();
    const { data: before } = await supabase.from("operation_petty_cash").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This entry was not found (it may already be deleted).");
    const { data: removed, error } = await supabase.from("operation_petty_cash").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!removed || removed.length !== 1) throw new Error("The entry was not deleted. You may not have permission.");
    await recordAudit({ companyId: before.company_id, relatedTable: "operation_petty_cash", relatedId: id, action: "petty_cash_deleted", previousValue: label(before) });
    refresh();
    const row: OperationPettyCashRow = { id: before.id, company_id: before.company_id, entry_type: before.entry_type as EntryType, entry_date: before.entry_date, category: before.category, description: before.description, amount: Number(before.amount), document_id: before.document_id, created_by: before.created_by };
    return { row };
  }, "Could not delete the entry. Please try again.");
}

/** Undo a delete: the same entry (same id) is put back. */
export async function restorePettyCashEntry(row: OperationPettyCashRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireHolder();
    const { error } = await supabase.from("operation_petty_cash").insert({
      id: row.id,
      company_id: row.company_id,
      entry_type: row.entry_type,
      entry_date: row.entry_date,
      category: row.category,
      description: row.description,
      amount: row.amount,
      document_id: row.document_id,
      created_by: row.created_by,
    });
    if (error) throw error;
    await recordAudit({ companyId: row.company_id, relatedTable: "operation_petty_cash", relatedId: row.id, action: "petty_cash_restored", newValue: label({ entry_type: row.entry_type, amount: row.amount, entry_date: row.entry_date, description: row.description }) });
    refresh();
    return {};
  }, "Could not undo the delete. Please try again.");
}
