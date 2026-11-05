"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { claimPayers } from "@/lib/pettyCash/access";
import { todayInMalaysia } from "@/lib/format";
import type { PettyCashTransactionRow } from "@/lib/finance/actions";
import { isPaymentMethod } from "@/lib/operationPettyCash/constants";
import { checkCategoryShares, type CategoryShare } from "@/lib/categorySplit";
import { addReceipts } from "@/lib/documents/receipts";

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
  /** cash or online transfer: how the staff member paid */
  paymentMethod?: string;
  category?: string;
  description?: string;
  documentId?: string;
  /** more receipts / photos, after documentId (on Edit they are added to the ones attached) */
  extraDocumentIds?: string[];
  /** bought for more than one category: how much is for each (each part is saved as its own claim, same receipt) */
  categoryShares?: CategoryShare[];
  /** a bill for more than one company: how much is for each company (and category); each part is saved as its own claim */
  shares?: { companyId: string; amount: number; category?: string }[];
  /** a bill for more than one company, not split: the other companies the one claim is also for (counted once) */
  alsoCompanyIds?: string[];
};

/** The claims to save: one for each category the amount is split between, otherwise the one claim as it is. */
const claimParts = (input: MyClaimInput): CategoryShare[] =>
  checkCategoryShares(input.amount, input.categoryShares) ?? [{ category: input.category?.trim() ?? "", amount: input.amount }];

/** A new claim split between companies (and categories): each part checked, together the whole amount, every company real. */
async function companyParts(input: MyClaimInput): Promise<{ companyId: string; category: string; amount: number }[] | null> {
  const shares = input.shares ?? [];
  if (shares.length < 2) return null;
  const parts = shares.map((s) => ({ companyId: s.companyId, category: (s.category ?? input.category ?? "").trim(), amount: Math.round(Number(s.amount) * 100) / 100 }));
  if (parts.some((p) => !Number.isFinite(p.amount) || p.amount <= 0)) throw new Error("Enter an amount more than 0 for each part.");
  if (new Set(parts.map((p) => `${p.companyId}|${p.category.toUpperCase()}`)).size !== parts.length) throw new Error("Each company and category can only be chosen once.");
  if (parts.reduce((t, p) => t + Math.round(p.amount * 100), 0) !== Math.round(input.amount * 100)) throw new Error("The parts must add up to the amount you paid.");
  const ids = Array.from(new Set(parts.map((p) => p.companyId)));
  const { data: found } = await createAdminClient().from("companies").select("id").in("id", ids);
  if ((found ?? []).length !== ids.length) throw new Error("Choose the company the bill is for.");
  return parts;
}

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
  // the bill can be for any of the companies; the name and department come from the staff record (of that company when there is one)
  const { data: company } = await createAdminClient().from("companies").select("id").eq("id", input.companyId).maybeSingle();
  if (!company) throw new Error("Choose the company the bill is for.");
  const record = records.find((r) => r.company_id === input.companyId) ?? records[0];
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Choose the date you bought it.");
  if (input.date > todayInMalaysia()) throw new Error("The date cannot be in the future.");
  if (!isPaymentMethod(input.paymentMethod)) throw new Error("Choose how you paid: cash or online transfer.");
  const payer = (await claimPayers()).find((p) => norm(p.name) === norm(input.payer));
  if (!payer) throw new Error("Choose who you claim from: Penny Chan or Nabilah.");
  return { record, payer };
}

function revalidate() {
  revalidatePath("/spending/my-claims");
  revalidatePath("/spending/petty-cash");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function submitMyClaim(input: MyClaimInput): Promise<ActionResult> {
  return runAction(async () => {
    const { admin, userId, records } = await whoAmI();
    const { record, payer } = await checked(input, records);
    const parts = (await companyParts(input)) ?? claimParts(input).map((part) => ({ ...part, companyId: input.companyId }));
    const { data: created, error } = await admin
      .from("petty_cash_transactions")
      .insert(
        parts.map((part) => ({
          company_id: part.companyId,
          type: "expense",
          claimant_name: record.full_name,
          claimant_department: record.department,
          payment_status: "pending_payment",
          category: part.category || null,
          description: input.description?.trim() || null,
          amount: part.amount,
          transaction_date: input.date,
          document_id: input.documentId || null,
          extra_document_ids: input.extraDocumentIds ?? [],
          person_name: payer.name,
          person_position: null,
          shared_company_ids: input.shares && input.shares.length > 1 ? [] : (input.alsoCompanyIds ?? []).filter((id) => id !== part.companyId),
          payment_method: input.paymentMethod,
          created_by: userId,
        })),
      )
      .select("id, amount, company_id");
    if (error) throw error;
    for (const row of created ?? []) {
      await recordAudit({ companyId: row.company_id, relatedTable: "petty_cash_transactions", relatedId: row.id, action: "claim_submitted", newValue: `RM ${Number(row.amount).toFixed(2)} · ${record.full_name} · claimed from ${payer.name}` });
    }
    revalidate();
    return {};
  }, "Could not send the claim. Please try again.");
}

async function ownClaim(admin: Awaited<ReturnType<typeof whoAmI>>["admin"], userId: string, id: string, { paidToo = false } = {}) {
  const { data: row } = await admin.from("petty_cash_transactions").select("*").eq("id", id).maybeSingle();
  if (!row || row.created_by !== userId || row.type !== "expense") throw new Error("This claim was not found.");
  if (!paidToo && row.payment_status === "paid") throw new Error("This claim is already paid, so it can no longer be deleted.");
  return row;
}

export async function updateMyClaim(id: string, input: MyClaimInput): Promise<ActionResult> {
  return runAction(async () => {
    const { admin, userId, records } = await whoAmI();
    const before = await ownClaim(admin, userId, id, { paidToo: true });
    const { record, payer } = await checked(input, records);
    // split between more categories: this claim keeps the first category, the others are added as their own claims
    const [first, ...rest] = claimParts(input);
    const { error } = await admin
      .from("petty_cash_transactions")
      .update({
        company_id: input.companyId,
        claimant_name: record.full_name,
        claimant_department: record.department,
        category: first.category || null,
        description: input.description?.trim() || null,
        amount: first.amount,
        transaction_date: input.date,
        person_name: payer.name,
        person_position: null,
        payment_method: input.paymentMethod,
        // files added here join the receipts already attached (nothing is replaced)
        ...(input.documentId ? addReceipts(before, [input.documentId, ...(input.extraDocumentIds ?? [])]) : {}),
      })
      .eq("id", id)
      .eq("created_by", userId);
    if (error) throw error;
    await recordAudit({ companyId: before.company_id, relatedTable: "petty_cash_transactions", relatedId: id, action: "edited", previousValue: `RM ${before.amount} · ${before.transaction_date}`, newValue: `RM ${first.amount} · ${input.date}` });
    if (rest.length > 0) {
      const { data: added, error: addError } = await admin
        .from("petty_cash_transactions")
        .insert(
          rest.map((part) => ({
            company_id: input.companyId,
            type: "expense",
            claimant_name: record.full_name,
            claimant_department: record.department,
            payment_status: "pending_payment",
            category: part.category,
            description: input.description?.trim() || null,
            amount: part.amount,
            transaction_date: input.date,
            ...addReceipts(before, [input.documentId, ...(input.extraDocumentIds ?? [])].filter((id): id is string => !!id)),
            person_name: payer.name,
            person_position: null,
            shared_company_ids: [],
            payment_method: input.paymentMethod,
            created_by: userId,
          })),
        )
        .select("id, amount");
      if (addError) throw addError;
      for (const row of added ?? []) {
        await recordAudit({ companyId: input.companyId, relatedTable: "petty_cash_transactions", relatedId: row.id, action: "claim_submitted", newValue: `RM ${Number(row.amount).toFixed(2)} (split by category) · ${record.full_name} · claimed from ${payer.name}` });
      }
    }
    revalidate();
    return {};
  }, "Could not save. Please try again.");
}

export async function deleteMyClaim(id: string): Promise<ActionResult<{ row: PettyCashTransactionRow }>> {
  return runAction(async () => {
    const { admin, userId } = await whoAmI();
    const before = await ownClaim(admin, userId, id);
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
    if (!row?.id || row.created_by !== userId || row.type !== "expense" || records.length === 0) throw new Error("There is nothing to put back.");
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
      extra_document_ids: row.extra_document_ids ?? [],
      person_name: row.person_name,
      person_position: row.person_position,
      shared_company_ids: [],
      payment_method: row.payment_method,
      created_by: userId,
    });
    if (error) throw new Error("Could not put the claim back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "petty_cash_transactions", relatedId: row.id, action: "restored", newValue: `RM ${row.amount} put back after it was deleted` });
    revalidate();
    return {};
  }, "Could not put the claim back.");
}
