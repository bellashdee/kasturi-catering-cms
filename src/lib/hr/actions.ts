"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type EmployeeInput = {
  companyId: string;
  fullName: string;
  department?: string;
  position?: string;
  employmentType: string;
  status: string;
  joinDate?: string;
  icPassportNo?: string;
  phone?: string;
  email?: string;
};

export async function createEmployee(input: EmployeeInput) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("employees")
    .insert({
      company_id: input.companyId,
      full_name: input.fullName,
      department: input.department || null,
      position: input.position || null,
      employment_type: input.employmentType,
      status: input.status,
      join_date: input.joinDate || null,
      ic_passport_no: input.icPassportNo || null,
      phone: input.phone || null,
      email: input.email || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  revalidatePath("/hr");
  return data;
}

export async function updateEmployee(employeeId: string, input: Partial<EmployeeInput>) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("employees")
    .update({
      full_name: input.fullName,
      department: input.department || null,
      position: input.position || null,
      employment_type: input.employmentType,
      status: input.status,
      join_date: input.joinDate || null,
      ic_passport_no: input.icPassportNo || null,
      phone: input.phone || null,
      email: input.email || null,
    })
    .eq("id", employeeId);

  if (error) throw error;
  revalidatePath("/hr");
  revalidatePath(`/hr/${employeeId}`);
}

export type BulkEmployeeRow = {
  fullName: string;
  department?: string;
  position?: string;
  employmentType?: string;
  status?: string;
  joinDate?: string;
  icPassportNo?: string;
  phone?: string;
  email?: string;
};

export async function bulkImportEmployees(companyId: string, rows: BulkEmployeeRow[]) {
  const { supabase } = await requireUser();

  const payload = rows
    .filter((r) => r.fullName?.trim())
    .map((r) => ({
      company_id: companyId,
      full_name: r.fullName.trim(),
      department: r.department || null,
      position: r.position || null,
      employment_type: r.employmentType || "full_time",
      status: r.status || "active",
      join_date: r.joinDate || null,
      ic_passport_no: r.icPassportNo || null,
      phone: r.phone || null,
      email: r.email || null,
    }));

  if (payload.length === 0) return { inserted: 0 };

  const { error, count } = await supabase.from("employees").insert(payload, { count: "exact" });
  if (error) throw error;

  revalidatePath("/hr");
  return { inserted: count ?? payload.length };
}

export type CertificateInput = {
  employeeId: string;
  companyId: string;
  certType: string;
  certName: string;
  certNumber?: string;
  issuedDate?: string;
  expiryDate: string;
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
      expiry_date: input.expiryDate,
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
};

export async function requestLeave(input: LeaveInput) {
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
      status: "pending",
      created_by: userId,
    })
    .select("id")
    .single();
  if (leaveError) throw leaveError;

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

export async function decideLeave(leaveRequestId: string, decision: "approved" | "rejected") {
  const { supabase } = await requireUser();

  const { data: leave, error: fetchError } = await supabase
    .from("leave_requests")
    .select("id, approval_id, employee_id")
    .eq("id", leaveRequestId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from("leave_requests")
    .update({ status: decision })
    .eq("id", leaveRequestId);
  if (updateError) throw updateError;

  if (leave.approval_id) {
    await supabase.from("approvals").update({ status: decision }).eq("id", leave.approval_id);
  }

  revalidatePath("/hr/leave");
  revalidatePath(`/hr/${leave.employee_id}`);
  revalidatePath("/");
}

export type OvertimeInput = {
  employeeId: string;
  companyId: string;
  workDate: string;
  hours: number;
  reason?: string;
};

export async function createOvertime(input: OvertimeInput) {
  const { supabase, userId } = await requireUser();

  const { data: overtime, error } = await supabase
    .from("overtime_records")
    .insert({
      company_id: input.companyId,
      employee_id: input.employeeId,
      work_date: input.workDate,
      hours: input.hours,
      reason: input.reason || null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) throw error;

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .insert({
      company_id: input.companyId,
      module: "hr",
      related_table: "overtime_records",
      related_id: overtime.id,
      status: "pending",
      requested_by: userId,
    })
    .select("id")
    .single();
  if (approvalError) throw approvalError;

  await supabase.from("overtime_records").update({ approval_id: approval.id }).eq("id", overtime.id);

  revalidatePath("/hr/overtime");
  revalidatePath(`/hr/${input.employeeId}`);
  revalidatePath("/");
}

export async function decideOvertime(overtimeId: string, decision: "approved" | "rejected") {
  const { supabase } = await requireUser();

  const { data: overtime, error: fetchError } = await supabase
    .from("overtime_records")
    .select("id, approval_id, employee_id")
    .eq("id", overtimeId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from("overtime_records")
    .update({ status: decision })
    .eq("id", overtimeId);
  if (updateError) throw updateError;

  if (overtime.approval_id) {
    await supabase.from("approvals").update({ status: decision }).eq("id", overtime.approval_id);
  }

  revalidatePath("/hr/overtime");
  revalidatePath(`/hr/${overtime.employee_id}`);
  revalidatePath("/");
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
