"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UserError, runAction, type ActionResult } from "./actionResult";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

// Employee create / edit / import / status actions now live in ./employeeActions.ts

export type CertificateInput = {
  employeeId: string;
  companyId: string;
  certType: string;
  certName: string;
  certNumber?: string;
  issuedDate?: string;
  expiryDate?: string;
  documentId?: string;
};

export async function createCertificate(input: CertificateInput) {
  const { supabase, userId } = await requireUser();

  const { data, error } = await supabase
    .from("employee_certificates")
    .insert({
      employee_id: input.employeeId,
      company_id: input.companyId,
      cert_type: input.certType,
      cert_name: input.certName,
      cert_number: input.certNumber || null,
      issued_date: input.issuedDate || null,
      expiry_date: input.expiryDate || null,
      document_id: input.documentId || null,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({
        extraction_status: "confirmed",
        related_table: "employee_certificates",
        related_id: data.id,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.documentId);
  }

  revalidatePath(`/hr/${input.employeeId}`);
  revalidatePath("/hr");
  return data;
}

export type LeaveInput = {
  employeeId: string;
  companyId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  documentId?: string;
};

async function requestLeaveImpl(input: LeaveInput) {
  const { supabase, userId } = await requireUser();

  const { data: leave, error: leaveError } = await supabase
    .from("leave_requests")
    .insert({
      company_id: input.companyId,
      employee_id: input.employeeId,
      leave_type: input.leaveType,
      start_date: input.startDate,
      end_date: input.endDate,
      days: input.days,
      reason: input.reason || null,
      document_id: input.documentId || null,
      status: "pending",
      created_by: userId,
    })
    .select("id")
    .single();
  if (leaveError) {
    if (leaveError.code === "23P01") throw new UserError("This employee already has pending or approved leave that overlaps those dates.");
    if (leaveError.code === "23514") throw new UserError("Check the dates and the number of days: the end date cannot be before the start date and the days must be more than zero.");
    if (leaveError.code === "42501") throw new UserError("You are not allowed to file leave for this employee.");
    throw new UserError("The leave request could not be saved.");
  }

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed", related_table: "leave_requests", related_id: leave.id, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.documentId);
  }

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .insert({
      company_id: input.companyId,
      module: "hr",
      related_table: "leave_requests",
      related_id: leave.id,
      status: "pending",
      requested_by: userId,
    })
    .select("id")
    .single();
  if (approvalError) throw approvalError;

  await supabase.from("leave_requests").update({ approval_id: approval.id }).eq("id", leave.id);

  revalidatePath("/hr/leave");
  revalidatePath(`/hr/${input.employeeId}`);
  revalidatePath("/");
  return leave;
}

/** Messages the database raises on purpose (see the leave integrity migration) are safe to show to the user. */
const LEAVE_RULE_MESSAGE = /^(You are not allowed|This leave request has already|A decided leave request)/;

export async function requestLeave(input: LeaveInput): Promise<ActionResult<{ id: string }>> {
  return runAction(() => requestLeaveImpl(input));
}

async function decideLeaveImpl(leaveRequestId: string, decision: "approved" | "rejected") {
  const { supabase } = await requireUser();

  const { data: leave } = await supabase
    .from("leave_requests")
    .select("id, approval_id, employee_id")
    .eq("id", leaveRequestId)
    .maybeSingle();
  if (!leave) throw new UserError("This leave request is not available to you.");

  // .select() makes the update report how many rows it really changed (the database hides rows outside your scope).
  const { data: changed, error: updateError } = await supabase
    .from("leave_requests")
    .update({ status: decision })
    .eq("id", leaveRequestId)
    .select("id");
  if (updateError) {
    throw new UserError(LEAVE_RULE_MESSAGE.test(updateError.message) ? updateError.message : "The decision could not be saved.");
  }
  if (!changed || changed.length === 0) throw new UserError("You are not allowed to decide this leave request.");

  if (leave.approval_id) {
    const { error: approvalError } = await supabase.from("approvals").update({ status: decision }).eq("id", leave.approval_id);
    if (approvalError) throw new UserError("The leave was updated but its approval record could not be. Please tell an administrator.");
  }

  revalidatePath("/hr/leave");
  revalidatePath(`/hr/${leave.employee_id}`);
  revalidatePath("/");
}

export async function decideLeave(leaveRequestId: string, decision: "approved" | "rejected"): Promise<ActionResult> {
  return runAction(() => decideLeaveImpl(leaveRequestId, decision));
}

export type PayrollInput = {
  employeeId: string;
  companyId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  grossPay: number;
  deductions: number;
};

export async function createPayrollRecord(input: PayrollInput) {
  const { supabase } = await requireUser();

  const { error } = await supabase.from("payroll_records").insert({
    company_id: input.companyId,
    employee_id: input.employeeId,
    pay_period_start: input.payPeriodStart,
    pay_period_end: input.payPeriodEnd,
    gross_pay: input.grossPay,
    deductions: input.deductions,
    net_pay: input.grossPay - input.deductions,
  });

  if (error) throw error;
  revalidatePath("/hr/payroll");
  revalidatePath(`/hr/${input.employeeId}`);
}

export async function markPayrollPaid(payrollId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("payroll_records").update({ status: "paid" }).eq("id", payrollId);
  if (error) throw error;
  revalidatePath("/hr/payroll");
}

export type CompanyDocumentInput = {
  companyId: string;
  docType: string;
  title: string;
  referenceNumber?: string;
  issuedDate?: string;
  expiryDate?: string;
  notes?: string;
  documentId?: string;
};

/** Company-level licences and agreements (MBJB, Halal, tenancy) — separate from per-employee documents. */
export async function createCompanyDocument(input: CompanyDocumentInput) {
  const { supabase, userId } = await requireUser();

  const { data, error } = await supabase
    .from("company_documents")
    .insert({
      company_id: input.companyId,
      doc_type: input.docType,
      title: input.title,
      reference_number: input.referenceNumber || null,
      issued_date: input.issuedDate || null,
      expiry_date: input.expiryDate || null,
      notes: input.notes || null,
      document_id: input.documentId || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({
        extraction_status: "confirmed",
        related_table: "company_documents",
        related_id: data.id,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.documentId);
  }

  revalidatePath("/hr/documents");
  revalidatePath("/");
  return data;
}

export async function deleteCompanyDocument(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("company_documents").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/hr/documents");
  revalidatePath("/");
}
