"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCompanyAdmin } from "@/lib/priority/access";
import { isForeigner } from "@/lib/hr/birthdays";
import { requirePayrollAccess } from "@/lib/hr/payrollAccess";
import { todayInMalaysia } from "@/lib/format";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import type { Database } from "@/lib/supabase/types";
import { PAYMENT_METHODS, isValidMonth, monthRange, paymentMethodFor } from "@/lib/hr/payrollCentre";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

function money(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a number of 0 or more.`);
  return Math.round(value * 100) / 100;
}

export type PayrollEntryInput = {
  employeeId: string;
  companyId: string;
  month: string;
  grossPay: number;
  deductions: number;
  remarks?: string;
};

/** Finance enters (or corrects) the month's figures for one staff record. A salary that is already paid cannot be changed. */
export async function savePayrollEntry(input: PayrollEntryInput): Promise<ActionResult> {
  return runAction(() => savePayrollEntryWork(input), "Could not save the salary figures.");
}

async function savePayrollEntryWork(input: PayrollEntryInput) {
  const { supabase } = await signedIn();
  await requirePayrollAccess(supabase);
  await requireCompanyAdmin(supabase, input.companyId);
  if (!isValidMonth(input.month)) throw new Error("Choose a valid month.");
  const gross = money(input.grossPay, "Basic / gross salary");
  const deductions = money(input.deductions, "Deductions");
  if (gross <= 0) throw new Error("Enter the gross salary of this staff for the month.");
  if (deductions > gross) throw new Error("The deductions cannot be more than the gross salary.");

  const { data: employee } = await supabase.from("employees").select("id, company_id").eq("id", input.employeeId).single();
  if (!employee || employee.company_id !== input.companyId) throw new Error("This staff record does not belong to the company.");

  const { start, end } = monthRange(input.month);
  const { data: existing } = await supabase.from("payroll_records").select("id, status").eq("employee_id", input.employeeId).eq("pay_period_start", start).maybeSingle();
  if (existing?.status === "paid") throw new Error("This salary is already paid. Undo the payment first to change the figures.");

  const values = { gross_pay: gross, deductions, net_pay: Math.round((gross - deductions) * 100) / 100, remarks: input.remarks?.trim() || null };
  const { error } = existing
    ? await supabase.from("payroll_records").update(values).eq("id", existing.id)
    : await supabase.from("payroll_records").insert({ company_id: input.companyId, employee_id: input.employeeId, pay_period_start: start, pay_period_end: end, status: "draft", ...values });
  if (error) throw new Error("Could not save the salary figures.");
  revalidatePath("/payroll-centre");
  return {};
}

export type PayrollPaidInput = { payrollId: string; paidOn: string; method: string; reference?: string };

/** The Director of Finance confirms the salary has been paid: the date, how it was paid and the bank reference are written down. */
export async function markPayrollEntryPaid(input: PayrollPaidInput): Promise<ActionResult> {
  return runAction(() => markPayrollEntryPaidWork(input), "Could not mark the salary as paid.");
}

async function markPayrollEntryPaidWork(input: PayrollPaidInput) {
  const { supabase, userId } = await signedIn();
  await requirePayrollAccess(supabase);
  const { data: record } = await supabase.from("payroll_records").select("id, company_id, employee_id, status, net_pay").eq("id", input.payrollId).single();
  if (!record) throw new Error("Payroll record not found.");
  await requireCompanyAdmin(supabase, record.company_id);
  if (record.status === "paid") throw new Error("This salary is already marked as paid.");
  if (Number(record.net_pay) <= 0) throw new Error("Enter the salary figures first.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) throw new Error("Choose the date the salary was paid.");
  if (input.paidOn > todayInMalaysia()) throw new Error("The payment date cannot be in the future.");
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) throw new Error("Choose how the salary was paid.");
  const { data: staff } = await supabase.from("employees").select("nationality, ic_passport_no").eq("id", record.employee_id).single();
  const expected = paymentMethodFor(!!staff && isForeigner(staff));
  if (input.method !== expected) throw new Error(expected === "Cash" ? "Foreign staff are paid by cash only." : "Local staff are paid by bank transfer.");

  const { error } = await supabase
    .from("payroll_records")
    .update({ status: "paid", paid_on: input.paidOn, payment_method: input.method, payment_reference: input.reference?.trim() || null, paid_by: userId })
    .eq("id", record.id);
  if (error) throw new Error("Could not mark the salary as paid.");
  revalidatePath("/payroll-centre");
  return {};
}

/** Undo a payment marked by mistake (the salary goes back to waiting for payment). */
export async function undoPayrollEntryPaid(payrollId: string): Promise<ActionResult> {
  return runAction(() => undoPayrollEntryPaidWork(payrollId), "Could not undo the payment.");
}

async function undoPayrollEntryPaidWork(payrollId: string) {
  const { supabase } = await signedIn();
  await requirePayrollAccess(supabase);
  const { data: record } = await supabase.from("payroll_records").select("id, company_id").eq("id", payrollId).single();
  if (!record) throw new Error("Payroll record not found.");
  await requireCompanyAdmin(supabase, record.company_id);
  const { error } = await supabase.from("payroll_records").update({ status: "draft", paid_on: null, payment_method: null, payment_reference: null, paid_by: null }).eq("id", record.id);
  if (error) throw new Error("Could not undo the payment.");
  revalidatePath("/payroll-centre");
  return {};
}

export type PayrollRow = Database["public"]["Tables"]["payroll_records"]["Row"];

/** Deletes the salary figures of a month that are not paid yet (a paid salary must be undone first). The row is returned so the delete can be undone. */
export async function deletePayrollEntry(payrollId: string): Promise<ActionResult<{ row: PayrollRow }>> {
  return runAction(async () => {
    const { supabase } = await signedIn();
    await requirePayrollAccess(supabase);
    const { data: record } = await supabase.from("payroll_records").select("*").eq("id", payrollId).maybeSingle();
    if (!record) throw new Error("This salary entry was not found (it may already be deleted).");
    await requireCompanyAdmin(supabase, record.company_id);
    if (record.status === "paid") throw new Error("This salary is already paid. Undo the payment first, then delete it.");
    const { data: removed, error } = await supabase.from("payroll_records").delete().eq("id", payrollId).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the salary entry.");
    await recordAudit({ companyId: record.company_id, relatedTable: "payroll_records", relatedId: payrollId, action: "deleted", previousValue: `${record.pay_period_start} · gross ${record.gross_pay} · net ${record.net_pay}`, newValue: "Deleted" });
    revalidatePath("/payroll-centre");
    return { row: record };
  }, "Could not delete the salary entry.");
}

/** Undo of a delete: the salary entry comes back as it was. */
export async function restorePayrollEntry(row: PayrollRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await signedIn();
    await requirePayrollAccess(supabase);
    if (!row?.id || !row.company_id || !row.employee_id) throw new Error("There is nothing to put back.");
    await requireCompanyAdmin(supabase, row.company_id);
    const { error } = await supabase.from("payroll_records").insert(row);
    if (error) throw new Error("Could not put the salary entry back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "payroll_records", relatedId: row.id, action: "restored", newValue: "Put back after it was deleted" });
    revalidatePath("/payroll-centre");
    return {};
  }, "Could not put the salary entry back.");
}
