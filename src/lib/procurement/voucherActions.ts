"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { todayInMalaysia } from "@/lib/format";
import { buildVoucherLines, monthLabel, nextMonthStart } from "@/lib/procurement/vouchers";
import type { Json } from "@/lib/supabase/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])-01$/;

/** PV-202610-001: the month of the voucher and a running number inside the company. */
async function nextVoucherNumber(supabase: Client, companyId: string, monthStart: string): Promise<string> {
  const prefix = `PV-${monthStart.slice(0, 4)}${monthStart.slice(5, 7)}-`;
  const { data } = await supabase.from("supplier_payment_vouchers").select("voucher_number").eq("company_id", companyId).like("voucher_number", `${prefix}%`);
  const highest = (data ?? []).reduce((max, v) => Math.max(max, Number(v.voucher_number.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

async function issue(supabase: Client, userId: string, companyId: string, supplierId: string, monthStart: string): Promise<{ id: string } | null> {
  const figures = await buildVoucherLines(supabase, companyId, supplierId, monthStart);
  if (figures.lines.length === 0) return null;
  const { data: existing } = await supabase.from("supplier_payment_vouchers").select("id").eq("company_id", companyId).eq("supplier_id", supplierId).eq("period_month", monthStart).maybeSingle();
  if (existing) return { id: existing.id };
  const { data, error } = await supabase
    .from("supplier_payment_vouchers")
    .insert({
      company_id: companyId,
      supplier_id: supplierId,
      period_month: monthStart,
      voucher_number: await nextVoucherNumber(supabase, companyId, monthStart),
      voucher_date: todayInMalaysia(),
      lines: figures.lines as unknown as Json,
      invoices_total: figures.invoicesTotal,
      credit_total: figures.creditTotal,
      debit_total: figures.debitTotal,
      net_amount: figures.net,
      created_by: userId,
    })
    .select("id, voucher_number")
    .single();
  if (error) throw error;
  await recordAudit({ companyId, relatedTable: "supplier_payment_vouchers", relatedId: data.id, action: "created", newValue: `${data.voucher_number} · ${monthLabel(monthStart)} · RM ${figures.net.toFixed(2)}` });
  return { id: data.id };
}

/** One voucher for one supplier and month (an existing one is opened, never doubled). */
export async function createVoucher(companyId: string, supplierId: string, monthStart: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    if (!MONTH_RE.test(monthStart)) throw new Error("Choose a month.");
    const { supabase, userId } = await requireUser();
    const made = await issue(supabase, userId, companyId, supplierId, monthStart);
    if (!made) throw new Error("This supplier has no invoice or note in that month.");
    revalidatePath("/supplier-procurement/vouchers");
    return made;
  }, "Could not create the voucher. Please try again.");
}

/** A voucher for every supplier of the company that has an invoice or note in the month and none yet. */
export async function createAllVouchers(companyId: string, monthStart: string): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    if (!MONTH_RE.test(monthStart)) throw new Error("Choose a month.");
    const { supabase, userId } = await requireUser();
    const end = nextMonthStart(monthStart);
    const [{ data: inv }, { data: notes }, { data: have }] = await Promise.all([
      supabase.from("supplier_invoices").select("supplier_id").eq("company_id", companyId).gte("invoice_date", monthStart).lt("invoice_date", end),
      supabase.from("supplier_notes").select("supplier_id").eq("company_id", companyId).gte("note_date", monthStart).lt("note_date", end),
      supabase.from("supplier_payment_vouchers").select("supplier_id").eq("company_id", companyId).eq("period_month", monthStart),
    ]);
    const done = new Set((have ?? []).map((v) => v.supplier_id));
    const suppliers = [...new Set([...(inv ?? []), ...(notes ?? [])].map((r) => r.supplier_id))].filter((id) => !done.has(id));
    let created = 0;
    // one after another so the running numbers do not clash
    for (const supplierId of suppliers) {
      if (await issue(supabase, userId, companyId, supplierId, monthStart)) created += 1;
    }
    revalidatePath("/supplier-procurement/vouchers");
    return { created };
  }, "Could not create the vouchers. Please try again.");
}

/** Takes the invoices and notes of the month again (after an invoice was added or corrected). A paid voucher stays as it was. */
export async function refreshVoucher(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: v } = await supabase.from("supplier_payment_vouchers").select("*").eq("id", id).maybeSingle();
    if (!v) throw new Error("This voucher was not found (it may have been deleted).");
    if (v.status === "paid") throw new Error("A paid voucher cannot be refreshed. Mark it as not paid first.");
    const figures = await buildVoucherLines(supabase, v.company_id, v.supplier_id, v.period_month);
    if (figures.lines.length === 0) throw new Error("There is no invoice or note left in that month. Delete the voucher instead.");
    const { error } = await supabase
      .from("supplier_payment_vouchers")
      .update({ lines: figures.lines as unknown as Json, invoices_total: figures.invoicesTotal, credit_total: figures.creditTotal, debit_total: figures.debitTotal, net_amount: figures.net, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await recordAudit({ companyId: v.company_id, relatedTable: "supplier_payment_vouchers", relatedId: id, action: "refreshed", previousValue: `RM ${Number(v.net_amount).toFixed(2)}`, newValue: `RM ${figures.net.toFixed(2)}` });
    revalidatePath(`/supplier-procurement/vouchers/${id}`);
    revalidatePath("/supplier-procurement/vouchers");
    return {};
  }, "Could not refresh the voucher. Please try again.");
}

/** The voucher's own details: its date and notes. */
export async function updateVoucher(id: string, input: { voucherDate: string; notes: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.voucherDate)) throw new Error("Enter the voucher date.");
    const { error } = await supabase.from("supplier_payment_vouchers").update({ voucher_date: input.voucherDate, notes: input.notes.trim() || null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    revalidatePath(`/supplier-procurement/vouchers/${id}`);
    return {};
  }, "Could not save the voucher. Please try again.");
}

/** Marks the voucher paid (with the date and the payment reference), or back to issued. */
export async function setVoucherPaid(id: string, paid: boolean, input?: { paidDate: string; reference: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (paid && !/^\d{4}-\d{2}-\d{2}$/.test(input?.paidDate ?? "")) throw new Error("Enter the date it was paid.");
    const { data: v } = await supabase.from("supplier_payment_vouchers").select("company_id, voucher_number, net_amount").eq("id", id).maybeSingle();
    if (!v) throw new Error("This voucher was not found (it may have been deleted).");
    const { error } = await supabase
      .from("supplier_payment_vouchers")
      .update(paid ? { status: "paid", paid_date: input!.paidDate, payment_reference: input!.reference.trim() || null, updated_at: new Date().toISOString() } : { status: "issued", paid_date: null, payment_reference: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await recordAudit({ companyId: v.company_id, relatedTable: "supplier_payment_vouchers", relatedId: id, action: paid ? "marked_paid" : "marked_not_paid", newValue: `${v.voucher_number} · RM ${Number(v.net_amount).toFixed(2)}` });
    revalidatePath(`/supplier-procurement/vouchers/${id}`);
    revalidatePath("/supplier-procurement/vouchers");
    return {};
  }, "Could not save. Please try again.");
}

export async function deleteVoucher(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: v } = await supabase.from("supplier_payment_vouchers").select("*").eq("id", id).maybeSingle();
    if (!v) throw new Error("This voucher was not found (it may already be deleted).");
    if (v.status === "paid") throw new Error("A paid voucher cannot be deleted. Mark it as not paid first.");
    const { data: removed, error } = await supabase.from("supplier_payment_vouchers").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the voucher.");
    await recordAudit({ companyId: v.company_id, relatedTable: "supplier_payment_vouchers", relatedId: id, action: "deleted", previousValue: `${v.voucher_number} · RM ${Number(v.net_amount).toFixed(2)}`, newValue: "Deleted" });
    revalidatePath("/supplier-procurement/vouchers");
    return {};
  }, "Could not delete the voucher. Please try again.");
}
