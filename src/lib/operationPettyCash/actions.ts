"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { todayInMalaysia } from "@/lib/format";
import { assertOwnPerson } from "@/lib/pettyCash/access";
import { addReceipts } from "@/lib/documents/receipts";
import type { EntryType, OperationPettyCashRow } from "./constants";
import { checkCategoryShares, checkSplitShares, type SplitShare } from "@/lib/categorySplit";

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
  /** what it was for, e.g. the event the things were bought for */
  remarks?: string;
  amount: number;
  documentId?: string;
  /** more receipts / photos, after documentId */
  extraDocumentIds?: string[];
  personName?: string;
  personPosition?: string;
  /** the other companies the entry is also for (keyed in once, counted once) */
  alsoCompanyIds?: string[];
  /** cash or online transfer: how the money was received (a top-up) or paid (spent); required for both */
  paymentMethod?: string;
  /** money spent on more than one category: how much of the amount is for each (each part is saved as its own entry) */
  categoryShares?: { category: string; amount: number }[];
  /** money spent split between companies (and categories): how much is for each company; each part is its own entry */
  shares?: { companyId: string; category?: string; amount: number }[];
};

/** The entries to save: one for each company (and category) or each category the amount is split between, otherwise the one entry. */
function parts(input: PettyCashEntryInput): SplitShare[] {
  if (input.entryType !== "expense") {
    // money received has no category (one chosen before the Type was changed to Received is not kept)
    return [{ companyId: input.companyId, category: "", amount: input.amount }];
  }
  const byCompany = checkSplitShares(input.amount, input.shares, input.category ?? "");
  if (byCompany) return byCompany;
  const byCategory = checkCategoryShares(input.amount, input.categoryShares);
  return byCategory ? byCategory.map((s) => ({ ...s, companyId: input.companyId })) : [{ companyId: input.companyId, category: input.category?.trim() ?? "", amount: input.amount }];
}

function validate(input: PettyCashEntryInput) {
  if (!input.personName?.trim()) throw new Error("Choose whose petty cash this is: the name.");
  if (input.entryType !== "top_up" && input.entryType !== "expense") throw new Error("Choose whether the money was received or spent.");
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "online_transfer") throw new Error(input.entryType === "top_up" ? "Choose how the money was received: cash or online transfer." : "Choose how the money was paid: cash or online transfer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) throw new Error("Select the date.");
  if (input.entryDate > todayInMalaysia()) throw new Error("The date cannot be in the future.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
}

const label = (r: { entry_type: string; amount: number | string; entry_date: string; description: string | null }) =>
  `${r.entry_type === "top_up" ? "Received" : "Spent"} RM ${Number(r.amount).toFixed(2)} · ${r.entry_date}${r.description ? ` · ${r.description}` : ""}`;

function refresh() {
  revalidatePath("/spending/petty-cash");
}

export async function createPettyCashEntry(input: PettyCashEntryInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireHolder();
    validate(input);
    const split = parts(input);
    await assertOwnPerson(supabase, userId, input.personName);
    // money spent on more than one category: one entry for each category, with its own part of the amount (same receipt and details)
    const { data, error } = await supabase
      .from("operation_petty_cash")
      .insert(
        split.map((part) => ({
          company_id: part.companyId,
          entry_type: input.entryType,
          entry_date: input.entryDate,
          category: part.category || null,
          description: input.description?.trim() || null,
          remarks: input.remarks?.trim().slice(0, 500) || null,
          amount: part.amount,
          document_id: input.documentId || null,
          extra_document_ids: input.extraDocumentIds ?? [],
          person_name: input.personName?.trim().slice(0, 200) || null,
          person_position: input.personPosition?.trim().slice(0, 200) || null,
          // split between the companies: each part is only for its company; otherwise for all the companies chosen (counted once)
          shared_company_ids: input.shares && input.shares.length > 1 ? [] : (input.alsoCompanyIds ?? []).filter((id) => id !== part.companyId),
          payment_method: input.paymentMethod,
          created_by: userId,
        })),
      )
      .select("id, amount");
    if (error) throw error;
    for (const row of data ?? []) {
      await recordAudit({ companyId: input.companyId, relatedTable: "operation_petty_cash", relatedId: row.id, action: "petty_cash_added", newValue: label({ entry_type: input.entryType, amount: row.amount, entry_date: input.entryDate, description: input.description ?? null }) });
    }
    refresh();
    return { id: data?.[0]?.id ?? "" };
  }, "Could not save the entry. Please try again.");
}

export async function updatePettyCashEntry(id: string, input: PettyCashEntryInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireHolder();
    validate(input);
    const [first, ...rest] = parts(input);
    const { data: before } = await supabase.from("operation_petty_cash").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This entry was not found (it may have been deleted).");
    await assertOwnPerson(supabase, userId, before.person_name);
    await assertOwnPerson(supabase, userId, input.personName);
    const { data: updated, error } = await supabase
      .from("operation_petty_cash")
      .update({
        company_id: input.companyId,
        entry_type: input.entryType,
        entry_date: input.entryDate,
        category: first.category || null,
        description: input.description?.trim() || null,
        remarks: input.remarks?.trim().slice(0, 500) || null,
        amount: first.amount,
        // files added here join the receipts already attached (nothing is replaced)
        ...addReceipts(before, [input.documentId, ...(input.extraDocumentIds ?? [])].filter((id): id is string => !!id)),
        person_name: input.personName?.trim().slice(0, 200) || null,
        person_position: input.personPosition?.trim().slice(0, 200) || null,
        payment_method: input.paymentMethod,
        // the other companies are only changed when they are sent
        ...(input.alsoCompanyIds ? { shared_company_ids: input.alsoCompanyIds.filter((id) => id !== input.companyId) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length !== 1) throw new Error("The change was not saved. You may not have permission.");
    await recordAudit({ companyId: input.companyId, relatedTable: "operation_petty_cash", relatedId: id, action: "petty_cash_edited", previousValue: label(before), newValue: label({ entry_type: input.entryType, amount: first.amount, entry_date: input.entryDate, description: input.description ?? null }) });
    // split between more categories: this entry keeps the first category, the others are added as their own entries
    if (rest.length > 0) {
      const { data: added, error: addError } = await supabase
        .from("operation_petty_cash")
        .insert(
          rest.map((part) => ({
            company_id: input.companyId,
            entry_type: input.entryType,
            entry_date: input.entryDate,
            category: part.category,
            description: input.description?.trim() || null,
            remarks: input.remarks?.trim().slice(0, 500) || null,
            amount: part.amount,
            ...addReceipts(before, [input.documentId, ...(input.extraDocumentIds ?? [])].filter((id): id is string => !!id)),
            person_name: input.personName?.trim().slice(0, 200) || null,
            person_position: input.personPosition?.trim().slice(0, 200) || null,
            shared_company_ids: (input.alsoCompanyIds ?? before.shared_company_ids ?? []).filter((c) => c !== input.companyId),
            payment_method: input.paymentMethod,
            created_by: userId,
          })),
        )
        .select("id, amount");
      if (addError) throw addError;
      for (const row of added ?? []) {
        await recordAudit({ companyId: input.companyId, relatedTable: "operation_petty_cash", relatedId: row.id, action: "petty_cash_added", newValue: `${label({ entry_type: input.entryType, amount: row.amount, entry_date: input.entryDate, description: input.description ?? null })} (split by category)` });
      }
    }
    refresh();
    return {};
  }, "Could not save the change. Please try again.");
}

/** Deletes an entry and returns it, so the person can Undo (restorePettyCashEntry). */
export async function deletePettyCashEntry(id: string): Promise<ActionResult<{ row: OperationPettyCashRow }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireHolder();
    const { data: before } = await supabase.from("operation_petty_cash").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This entry was not found (it may already be deleted).");
    await assertOwnPerson(supabase, userId, before.person_name);
    const { data: removed, error } = await supabase.from("operation_petty_cash").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!removed || removed.length !== 1) throw new Error("The entry was not deleted. You may not have permission.");
    await recordAudit({ companyId: before.company_id, relatedTable: "operation_petty_cash", relatedId: id, action: "petty_cash_deleted", previousValue: label(before) });
    refresh();
    const row: OperationPettyCashRow = { id: before.id, company_id: before.company_id, entry_type: before.entry_type as EntryType, entry_date: before.entry_date, category: before.category, description: before.description, amount: Number(before.amount), document_id: before.document_id, extra_document_ids: before.extra_document_ids ?? [], created_by: before.created_by, person_name: before.person_name, person_position: before.person_position, payment_method: before.payment_method, remarks: before.remarks, shared_company_ids: before.shared_company_ids ?? [] };
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
      extra_document_ids: row.extra_document_ids ?? [],
      created_by: row.created_by,
      person_name: row.person_name,
      person_position: row.person_position,
      shared_company_ids: row.shared_company_ids ?? [],
      payment_method: row.payment_method,
      remarks: row.remarks ?? null,
    });
    if (error) throw error;
    await recordAudit({ companyId: row.company_id, relatedTable: "operation_petty_cash", relatedId: row.id, action: "petty_cash_restored", newValue: label({ entry_type: row.entry_type, amount: row.amount, entry_date: row.entry_date, description: row.description }) });
    refresh();
    return {};
  }, "Could not undo the delete. Please try again.");
}
