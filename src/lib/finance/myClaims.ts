"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { claimPayers } from "@/lib/pettyCash/access";
import { todayInMalaysia } from "@/lib/format";
import type { PettyCashTransactionRow } from "@/lib/finance/actions";

/**
 * My Claims: any staff member claims back what they bought with their own money, from Ms. Penny or Ms. Nabilah. The staff have no
 * access to the petty cash tables, so these actions use the service role and do the checking themselves: a person can only work on
 * a claim they made, and only while it is not paid yet.
 */

export type MyClaimInput = {
  companyId: string;
  date: string;
  amount: number;
  /** the person the claim is claimed from (Penny Chan or Nabilah) */
  payer: string;
  category?: string;
  description?: string;
  documentId?: string;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

async function whoAmI() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const admin = createAdminClient();
  const { data: records } = await admin.from("employees").select("id, full_name, department, company_id").eq("user_id", user.id).eq("status", "active");
  if (!records?.length) throw new Error("Your staff record is not linked to your login yet. Please ask the HR admin to link it.");
  return { admin, userId: user.id, records };
}

async function checked(input: MyClaimInput, records: { full_name: string; department: string | null; company_id: string }[]) {
  const record = records.find((r) => r.company_id === input.companyId);
  if (!record) throw new Error("Choose the company you work for.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Choose the date you bought it.");
  if (input.date > todayInMalaysia()) throw new Error("The date cannot be in the future.");
  const payer = (await claimPayers()).find((p) => norm(p.name) === norm(input.payer));
  if (!payer) throw new Error("Choose who you claim from: Penny Chan or Nabilah.");
  return { record, payer };
}

function revalidate() {
  revalidatePath("/claims");
  revalidatePath("/spending/petty-cash");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function submitMyClaim(input: MyClaimInput): Promise<ActionResult> {
  return runAction(async () => {
    const { admin, userId, records } = await whoAmI();
    const { record, payer } = await checked(input, records);
    const { data: created, error } = await admin
      .from("petty_cash_transactions")
      .insert({
        company_id: input.companyId,
        type: "expense",
        claimant_name: record.full_name,
        claimant_department: record.department,
        payment_status: "pending_payment",
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        amount: input.amount,
        transaction_date: input.date,
        document_id: input.documentId || null,
        person_name: payer.name,
        person_position: payer.position || null,
        shared_company_ids: [],
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    await recordAudit({ companyId: input.companyId, relatedTable: "petty_cash_transactions", relatedId: created.id, action: "claim_submitted", newValue: `RM ${input.amount.toFixed(2)} · ${record.full_name} · claimed from ${payer.name}` });
    revalidate();
    return {};
  }, "Could not send the claim. Please try again.");
}

async function ownPending(admin: Awaited<ReturnType<typeof whoAmI>>["admin"], userId: string, id: string) {
  const { data: row } = await admin.from("petty_cash_transactions").select("*").eq("id", id).maybeSingle();
  if (!row || row.created_by !== userId || row.type !== "expense") throw new Error("This claim was not found.");
  if (row.payment_status === "paid") throw new Error("This claim is already paid, so it can no longer be changed.");
  return row;
}

export async function updateMyClaim(id: string, input: MyClaimInput): Promise<ActionResult> {
  return runAction(async () => {
    const { admin, userId, records } = await whoAmI();
    const before = await ownPending(admin, userId, id);
    const { record, payer } = await checked(input, records);
    const { error } = await admin
      .from("petty_cash_transactions")
      .update({
        company_id: input.companyId,
        claimant_name: record.full_name,
        claimant_department: record.department,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        amount: input.amount,
        transaction_date: input.date,
        person_name: payer.name,
        person_position: payer.position || null,
        ...(input.documentId ? { document_id: input.documentId } : {}),
      })
      .eq("id", id)
      .eq("created_by", userId)
      .neq("payment_status", "paid");
    if (error) throw error;
    await recordAudit({ companyId: before.company_id, relatedTable: "petty_cash_transactions", relatedId: id, action: "edited", previousValue: `RM ${before.amount} · ${before.transaction_date}`, newValue: `RM ${input.amount} · ${input.date}` });
    revalidate();
    return {};
  }, "Could not save. Please try again.");
}

export async function deleteMyClaim(id: string): Promise<ActionResult<{ row: PettyCashTransactionRow }>> {
  return runAction(async () => {
    const { admin, userId } = await whoAmI();
    const before = await ownPending(admin, userId, id);
    const { data: removed, error } = await admin.from("petty_cash_transactions").delete().eq("id", id).eq("created_by", userId).neq("payment_status", "paid").select("id");
    if (error || !removed?.length) throw new Error("Could not delete the claim.");
    await recordAudit({ companyId: before.company_id, relatedTable: "petty_cash_transactions", relatedId: id, action: "deleted", previousValue: `RM ${before.amount} · ${before.transaction_date} · ${before.claimant_name ?? ""} (${before.payment_status})`, newValue: "Deleted" });
    revalidate();
    return { row: before };
  }, "Could not delete the claim. Please try again.");
}

/** Undo of a delete: the claim comes back as it was (only what the staff keyed in is put back; it is a claim of theirs that is not paid). */
export async function restoreMyClaim(row: PettyCashTransactionRow): Promise<ActionResult> {
  return runAction(async () => {
    const { admin, userId, records } = await whoAmI();
    if (!row?.id || row.created_by !== userId || row.type !== "expense" || !records.some((r) => r.company_id === row.company_id)) throw new Error("There is nothing to put back.");
    const { error } = await admin.from("petty_cash_transactions").insert({
      id: row.id,
      company_id: row.company_id,
      type: "expense",
      claimant_name: row.claimant_name,
      claimant_department: row.claimant_department,
      payment_status: "pending_payment",
      category: row.category,
      description: row.description,
      amount: row.amount,
      transaction_date: row.transaction_date,
      document_id: row.document_id,
      person_name: row.person_name,
      person_position: row.person_position,
      shared_company_ids: [],
      created_by: userId,
    });
    if (error) throw new Error("Could not put the claim back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "petty_cash_transactions", relatedId: row.id, action: "restored", newValue: `RM ${row.amount} put back after it was deleted` });
    revalidate();
    return {};
  }, "Could not put the claim back.");
}
