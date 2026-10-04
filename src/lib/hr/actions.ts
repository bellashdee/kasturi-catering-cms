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
  bankName?: string;
  bankAccountNo?: string;
  epfNo?: string;
};

async function savePrivateDetails(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  employeeId: string,
  companyId: string,
  input: { bankName?: string; bankAccountNo?: string; epfNo?: string },
) {
  const { error } = await supabase.from("employee_private_details").upsert({
    employee_id: employeeId,
    company_id: companyId,
    bank_name: input.bankName?.trim() || null,
    bank_account_no: input.bankAccountNo?.trim() || null,
    epf_no: input.epfNo?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Only a Super Admin or Company Admin can save bank and KWSP details.");
}

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

  if (input.bankName || input.bankAccountNo || input.epfNo) {
    await savePrivateDetails(supabase, data.id, input.companyId, input);
  }

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

  if (input.bankName !== undefined || input.bankAccountNo !== undefined || input.epfNo !== undefined) {
    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).single();
    if (emp) await savePrivateDetails(supabase, employeeId, emp.company_id, input);
  }

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
  bankName?: string;
  bankAccountNo?: string;
  epfNo?: string;
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

  if (payload.length === 0) return { inserted: 0, privateSaved: 0, privateSkipped: 0 };

  const { data: created, error } = await supabase.from("employees").insert(payload).select("id");
  if (error) throw error;

  // Bank / KWSP columns only apply for admins; the rows come back in the same order they were inserted.
  const valid = rows.filter((r) => r.fullName?.trim());
  const privateRows = (created ?? [])
    .map((emp, i) => ({ emp, r: valid[i] }))
    .filter(({ r }) => r && (r.bankName || r.bankAccountNo || r.epfNo))
    .map(({ emp, r }) => ({
      employee_id: emp.id,
      company_id: companyId,
      bank_name: r.bankName?.trim() || null,
      bank_account_no: r.bankAccountNo?.trim() || null,
      epf_no: r.epfNo?.trim() || null,
    }));
  let privateSaved = 0;
  if (privateRows.length > 0) {
    const { error: privateError } = await supabase.from("employee_private_details").insert(privateRows);
    if (!privateError) privateSaved = privateRows.length;
  }

  revalidatePath("/hr");
  return { inserted: created?.length ?? payload.length, privateSaved, privateSkipped: privateRows.length - privateSaved };
}

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
      document_id: input.documentId || null,
      status: "pending",
      created_by: userId,
    })
    .select("id")
    .single();
  if (leaveError) throw leaveError;

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
