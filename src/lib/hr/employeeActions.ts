"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UserError, runAction, type ActionResult } from "./actionResult";

/**
 * Employee Management server actions. Each one re-checks on the server that the caller is an HR Admin of the
 * employee's company, and the database policies enforce the same rule again (defence in depth).
 * Error messages are written for HR staff; they never include IC numbers, addresses or other personal data.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireHr(companyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UserError("Not signed in.");
  const { data } = await supabase.rpc("user_is_hr_admin", { target_company_id: companyId });
  if (data !== true) throw new UserError("Only an HR Admin of this company can do that.");
  return { supabase, userId: user.id };
}

async function companyOfEmployee(supabase: Supabase, employeeId: string) {
  const { data } = await supabase.from("employees").select("id, company_id, full_name, status").eq("id", employeeId).maybeSingle();
  if (!data) throw new UserError("Employee not found, or you don't have access to this record.");
  return data;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: string | undefined | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function validDate(value: string | null | undefined, label: string): string | null {
  const v = clean(value);
  if (!v) return null;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new UserError(`${label} is not a valid date.`);
  return v;
}

export type EmployeeInput = {
  companyId: string;
  fullName: string;
  employeeNo?: string;
  departmentId?: string;
  position?: string;
  employmentType: string;
  /** Only used when creating: "", "probation" or "confirmed". Later changes go through recordEmploymentEvent. */
  employmentStage?: string;
  joinDate?: string;
  probationStart?: string;
  probationEnd?: string;
  contractEnd?: string;
  reportingManagerId?: string;
  phone?: string;
  email?: string;
  icPassportNo?: string;
  residentialAddress?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  bankName?: string;
  bankAccountNo?: string;
  epfNo?: string;
  /** Login account of this person (admin only); lets them submit and see their own OT. null clears the link. */
  userId?: string | null;
};

type Checked = {
  fullName: string;
  employeeNo: string | null;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  employmentType: string;
  joinDate: string | null;
  probationStart: string | null;
  probationEnd: string | null;
  contractEnd: string | null;
  reportingManagerId: string | null;
  phone: string | null;
  email: string | null;
};

async function validateEmployee(supabase: Supabase, companyId: string, input: EmployeeInput, ownId?: string): Promise<Checked> {
  const fullName = clean(input.fullName);
  if (!fullName) throw new UserError("Full name is required.");
  if (fullName.length > 200) throw new UserError("Full name is too long.");
  if (!["full_time", "part_time", "contract"].includes(input.employmentType)) throw new UserError("Choose a valid employment type.");

  const email = clean(input.email);
  if (email && !EMAIL_RE.test(email)) throw new UserError("Email address is not valid.");
  const phone = clean(input.phone);
  if (phone && !/^[0-9+()\-\s]{6,20}$/.test(phone)) throw new UserError("Phone number is not valid.");

  const joinDate = validDate(input.joinDate, "Start date");
  const probationStart = validDate(input.probationStart, "Probation start date");
  const probationEnd = validDate(input.probationEnd, "Probation end date");
  const contractEnd = validDate(input.contractEnd, "Contract end date");
  if (probationStart && probationEnd && probationEnd < probationStart) throw new UserError("Probation end date cannot be before its start date.");
  if (joinDate && contractEnd && contractEnd < joinDate) throw new UserError("Contract end date cannot be before the start date.");

  let departmentId: string | null = null;
  let departmentName: string | null = null;
  if (clean(input.departmentId)) {
    const { data: dept } = await supabase.from("departments").select("id, name, company_id").eq("id", input.departmentId as string).maybeSingle();
    if (!dept || dept.company_id !== companyId) throw new UserError("That department does not belong to this company.");
    departmentId = dept.id;
    departmentName = dept.name;
  }

  const managerId = clean(input.reportingManagerId);
  if (managerId) {
    if (ownId && managerId === ownId) throw new UserError("An employee cannot report to themselves.");
    const { data: manager } = await supabase.from("employees").select("id, company_id").eq("id", managerId).maybeSingle();
    if (!manager || manager.company_id !== companyId) throw new UserError("The reporting manager must be an employee of the same company.");
    // Walk up the reporting chain: if it leads back to this employee, the relationship would be circular.
    if (ownId) {
      let cursor: string | null = managerId;
      for (let depth = 0; cursor && depth < 25; depth++) {
        if (cursor === ownId) throw new UserError("That reporting line would be circular (the manager already reports to this employee).");
        const next: { data: { reporting_manager_id: string | null } | null } = await supabase
          .from("employees")
          .select("reporting_manager_id")
          .eq("id", cursor)
          .maybeSingle();
        cursor = next.data?.reporting_manager_id ?? null;
      }
    }
  }

  return {
    fullName,
    employeeNo: clean(input.employeeNo),
    departmentId,
    departmentName,
    position: clean(input.position),
    employmentType: input.employmentType,
    joinDate,
    probationStart,
    probationEnd,
    contractEnd,
    reportingManagerId: managerId,
    phone,
    email,
  };
}

function friendlyDbError(error: { code?: string; message: string }): UserError {
  if (error.code === "23505") {
    if (error.message.includes("employee_no")) return new UserError("That employee ID is already used in this company.");
    if (error.message.includes("company_user")) return new UserError("That login is already linked to another staff record in this company.");
    return new UserError("That record already exists.");
  }
  if (error.code === "42501") return new UserError("You don't have permission to do that.");
  return new UserError("The change could not be saved. Please check the details and try again.");
}

async function savePrivateDetails(supabase: Supabase, employeeId: string, companyId: string, input: EmployeeInput) {
  const { error } = await supabase.from("employee_private_details").upsert({
    employee_id: employeeId,
    company_id: companyId,
    ic_passport_no: clean(input.icPassportNo),
    residential_address: clean(input.residentialAddress),
    emergency_contact_name: clean(input.emergencyContactName),
    emergency_contact_relationship: clean(input.emergencyContactRelationship),
    emergency_contact_phone: clean(input.emergencyContactPhone),
    bank_name: clean(input.bankName),
    bank_account_no: clean(input.bankAccountNo),
    epf_no: clean(input.epfNo),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new UserError("The restricted details (IC, address, emergency contact, bank) could not be saved.");
}

async function createEmployeeImpl(input: EmployeeInput) {
  const { supabase } = await requireHr(input.companyId);
  const v = await validateEmployee(supabase, input.companyId, input);
  const stage = input.employmentStage === "probation" || input.employmentStage === "confirmed" ? input.employmentStage : null;

  const { data, error } = await supabase
    .from("employees")
    .insert({
      company_id: input.companyId,
      full_name: v.fullName,
      employee_no: v.employeeNo,
      department_id: v.departmentId,
      department: v.departmentName,
      position: v.position,
      employment_type: v.employmentType,
      employment_stage: stage,
      status: "active",
      join_date: v.joinDate,
      probation_start: v.probationStart,
      probation_end: v.probationEnd,
      contract_end: v.contractEnd,
      reporting_manager_id: v.reportingManagerId,
      phone: v.phone,
      email: v.email,
    })
    .select("id")
    .single();
  if (error) throw friendlyDbError(error);

  await supabase.from("employment_history").insert({
    company_id: input.companyId,
    employee_id: data.id,
    event_type: "joined",
    effective_date: v.joinDate ?? new Date().toISOString().slice(0, 10),
    to_status: stage ?? "active",
    recorded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  await savePrivateDetails(supabase, data.id, input.companyId, input);

  revalidatePath("/hr");
  return data;
}

async function updateEmployeeImpl(employeeId: string, input: EmployeeInput) {
  const existing = await companyOfEmployee(await createClient(), employeeId);
  // The company of an employee never changes through this form.
  const { supabase } = await requireHr(existing.company_id);
  const v = await validateEmployee(supabase, existing.company_id, input, employeeId);

  // Linking a login to a staff record is an admin-only change (the database also guards it).
  if (input.userId !== undefined) {
    const { data: isAdmin } = await supabase.rpc("user_is_company_admin", { target_company_id: existing.company_id });
    if (isAdmin !== true) throw new UserError("Only an admin can link a login account to a staff record.");
  }

  const { error } = await supabase
    .from("employees")
    .update({
      full_name: v.fullName,
      employee_no: v.employeeNo,
      department_id: v.departmentId,
      department: v.departmentName,
      position: v.position,
      employment_type: v.employmentType,
      join_date: v.joinDate,
      probation_start: v.probationStart,
      probation_end: v.probationEnd,
      contract_end: v.contractEnd,
      reporting_manager_id: v.reportingManagerId,
      phone: v.phone,
      email: v.email,
      ...(input.userId !== undefined ? { user_id: input.userId } : {}),
    })
    .eq("id", employeeId);
  if (error) throw friendlyDbError(error);

  await savePrivateDetails(supabase, employeeId, existing.company_id, input);

  revalidatePath("/hr");
  revalidatePath(`/hr/${employeeId}`);
}

export type EmploymentEventInput = {
  employeeId: string;
  event: "confirmation" | "probation_review" | "resignation" | "termination" | "status_change";
  effectiveDate: string;
  outcome?: "pass" | "extend" | "fail";
  details?: string;
  toStatus?: "active" | "inactive";
  newProbationEnd?: string;
};

/** Confirm, probation review, resignation, termination, activate/deactivate. One database transaction each. */
async function recordEmploymentEventImpl(input: EmploymentEventInput) {
  const existing = await companyOfEmployee(await createClient(), input.employeeId);
  const { supabase } = await requireHr(existing.company_id);

  const effective = validDate(input.effectiveDate, "Effective date");
  if (!effective) throw new UserError("An effective date is required.");
  const newEnd = validDate(input.newProbationEnd, "New probation end date");
  const details = clean(input.details);
  if (details && details.length > 2000) throw new UserError("The notes are too long (2000 characters at most).");

  const { error } = await supabase.rpc("hr_record_employment_event", {
    p_employee_id: input.employeeId,
    p_event: input.event,
    p_effective: effective,
    p_outcome: input.outcome ?? undefined,
    p_details: details ?? undefined,
    p_to_status: input.toStatus ?? undefined,
    p_new_probation_end: newEnd ?? undefined,
  });
  if (error) {
    // These messages are written by our own database function for HR users; anything else stays generic.
    const known = /^(Only|This employee|Probation|Choose|Provide|A reason|An effective|Status can|The employee|Unknown|Employee not found)/;
    throw new UserError(known.test(error.message) ? error.message : "The change could not be saved.");
  }

  revalidatePath("/hr");
  revalidatePath(`/hr/${input.employeeId}`);
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

async function createDepartmentImpl(companyId: string, name: string, code?: string) {
  const { supabase } = await requireHr(companyId);
  const n = clean(name);
  if (!n) throw new UserError("Department name is required.");
  if (n.length > 100) throw new UserError("Department name is too long.");
  const { error } = await supabase.from("departments").insert({ company_id: companyId, name: n, code: clean(code) });
  if (error) {
    if (error.code === "23505") throw new UserError("This company already has a department with that name.");
    throw friendlyDbError(error);
  }
  revalidatePath("/hr/departments");
}

async function renameDepartmentImpl(departmentId: string, name: string) {
  const supabase = await createClient();
  const { data: dept } = await supabase.from("departments").select("id, company_id").eq("id", departmentId).maybeSingle();
  if (!dept) throw new UserError("Department not found.");
  await requireHr(dept.company_id);
  const n = clean(name);
  if (!n) throw new UserError("Department name is required.");
  const { error } = await supabase.from("departments").update({ name: n }).eq("id", departmentId);
  if (error) {
    if (error.code === "23505") throw new UserError("This company already has a department with that name.");
    throw friendlyDbError(error);
  }
  // Other modules still read the department as text, so keep that copy in step.
  await supabase.from("employees").update({ department: n }).eq("department_id", departmentId);
  revalidatePath("/hr/departments");
  revalidatePath("/hr");
}

/** Departments are never deleted: an obsolete one is marked inactive so history stays readable. */
async function setDepartmentActiveImpl(departmentId: string, active: boolean) {
  const supabase = await createClient();
  const { data: dept } = await supabase.from("departments").select("id, company_id").eq("id", departmentId).maybeSingle();
  if (!dept) throw new UserError("Department not found.");
  await requireHr(dept.company_id);
  const { error } = await supabase.from("departments").update({ is_active: active }).eq("id", departmentId);
  if (error) throw friendlyDbError(error);
  revalidatePath("/hr/departments");
}

// ---------------------------------------------------------------------------
// Documents and photo (the file itself is uploaded from the browser into the private bucket)
// ---------------------------------------------------------------------------

const DOC_CATEGORIES = ["offer_letter", "employment_contract", "confirmation_letter", "warning_letter", "resignation_letter", "other"];

async function recordEmployeeDocumentImpl(input: {
  employeeId: string;
  category: string;
  title: string;
  storagePath: string;
  originalFilename: string;
  visibleToEmployee: boolean;
}) {
  const existing = await companyOfEmployee(await createClient(), input.employeeId);
  const { supabase, userId } = await requireHr(existing.company_id);
  if (!DOC_CATEGORIES.includes(input.category)) throw new UserError("Choose a valid document category.");
  const title = clean(input.title);
  if (!title) throw new UserError("A document title is required.");
  if (!input.storagePath.startsWith(`${existing.company_id}/docs/`) || input.storagePath.includes("..")) {
    throw new UserError("The uploaded file is not in the expected location.");
  }
  const { error } = await supabase.from("employee_documents").insert({
    company_id: existing.company_id,
    employee_id: input.employeeId,
    category: input.category,
    title: title.slice(0, 200),
    storage_path: input.storagePath,
    original_filename: input.originalFilename.slice(0, 255),
    visible_to_employee: input.visibleToEmployee,
    uploaded_by: userId,
  });
  if (error) throw friendlyDbError(error);
  revalidatePath(`/hr/${input.employeeId}`);
}

async function deleteEmployeeDocumentImpl(documentId: string) {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id, company_id, employee_id, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new UserError("Document not found.");
  const { supabase: hr } = await requireHr(doc.company_id);
  const { error } = await hr.from("employee_documents").delete().eq("id", documentId);
  if (error) throw friendlyDbError(error);
  await hr.storage.from("hr-documents").remove([doc.storage_path]);
  revalidatePath(`/hr/${doc.employee_id}`);
}

async function setEmployeePhotoImpl(employeeId: string, storagePath: string) {
  const existing = await companyOfEmployee(await createClient(), employeeId);
  const { supabase } = await requireHr(existing.company_id);
  if (!storagePath.startsWith(`${existing.company_id}/photos/`) || storagePath.includes("..")) {
    throw new UserError("The uploaded photo is not in the expected location.");
  }
  const { error } = await supabase.from("employees").update({ photo_path: storagePath }).eq("id", employeeId);
  if (error) throw friendlyDbError(error);
  revalidatePath(`/hr/${employeeId}`);
  revalidatePath("/hr");
}

// ---------------------------------------------------------------------------
// Bulk import (Excel / CSV). Restricted fields go to the restricted table, never to the open employees table.
// ---------------------------------------------------------------------------

export type BulkEmployeeRow = {
  fullName: string;
  department?: string;
  position?: string;
  employmentType?: string;
  /** Accepted from the spreadsheet for convenience but ignored: imported people always start as active. */
  status?: string;
  joinDate?: string;
  icPassportNo?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccountNo?: string;
  epfNo?: string;
};

async function bulkImportEmployeesImpl(companyId: string, rows: BulkEmployeeRow[]) {
  const { supabase } = await requireHr(companyId);
  const valid = rows.filter((r) => r.fullName?.trim());
  if (valid.length === 0) return { inserted: 0, privateSaved: 0, privateSkipped: 0 };
  if (valid.length > 500) throw new UserError("Import at most 500 employees at a time.");

  const { data: departments } = await supabase.from("departments").select("id, name").eq("company_id", companyId);
  const deptByName = new Map((departments ?? []).map((d) => [d.name.toLowerCase(), d]));

  const payload = valid.map((r) => {
    const dept = r.department ? deptByName.get(r.department.trim().toLowerCase()) : undefined;
    const type = ["full_time", "part_time", "contract"].includes(r.employmentType ?? "") ? (r.employmentType as string) : "full_time";
    const join = r.joinDate && DATE_RE.test(r.joinDate.trim()) ? r.joinDate.trim() : null;
    const email = r.email?.trim() && EMAIL_RE.test(r.email.trim()) ? r.email.trim() : null;
    return {
      company_id: companyId,
      full_name: r.fullName.trim().slice(0, 200),
      department: dept?.name ?? clean(r.department),
      department_id: dept?.id ?? null,
      position: clean(r.position),
      employment_type: type,
      status: "active",
      join_date: join,
      phone: clean(r.phone),
      email,
    };
  });

  const { data: created, error } = await supabase.from("employees").insert(payload).select("id");
  if (error) throw friendlyDbError(error);

  // Rows come back in insertion order.
  const privateRows = (created ?? [])
    .map((emp, i) => ({ emp, r: valid[i] }))
    .filter(({ r }) => r && (r.icPassportNo || r.bankName || r.bankAccountNo || r.epfNo))
    .map(({ emp, r }) => ({
      employee_id: emp.id,
      company_id: companyId,
      ic_passport_no: clean(r.icPassportNo),
      bank_name: clean(r.bankName),
      bank_account_no: clean(r.bankAccountNo),
      epf_no: clean(r.epfNo),
    }));
  let privateSaved = 0;
  if (privateRows.length > 0) {
    const { error: privateError } = await supabase.from("employee_private_details").insert(privateRows);
    if (!privateError) privateSaved = privateRows.length;
  }

  revalidatePath("/hr");
  return { inserted: created?.length ?? payload.length, privateSaved, privateSkipped: privateRows.length - privateSaved };
}

// ---------------------------------------------------------------------------
// Public actions. Each returns { ok, data } or { ok: false, error } so the real reason reaches the screen.
// ---------------------------------------------------------------------------

export async function createEmployee(input: EmployeeInput): Promise<ActionResult<{ id: string }>> {
  return runAction(() => createEmployeeImpl(input));
}
export async function updateEmployee(employeeId: string, input: EmployeeInput): Promise<ActionResult> {
  return runAction(() => updateEmployeeImpl(employeeId, input));
}
export async function recordEmploymentEvent(input: EmploymentEventInput): Promise<ActionResult> {
  return runAction(() => recordEmploymentEventImpl(input));
}
export async function createDepartment(companyId: string, name: string, code?: string): Promise<ActionResult> {
  return runAction(() => createDepartmentImpl(companyId, name, code));
}
export async function renameDepartment(departmentId: string, name: string): Promise<ActionResult> {
  return runAction(() => renameDepartmentImpl(departmentId, name));
}
export async function setDepartmentActive(departmentId: string, active: boolean): Promise<ActionResult> {
  return runAction(() => setDepartmentActiveImpl(departmentId, active));
}
export async function recordEmployeeDocument(input: Parameters<typeof recordEmployeeDocumentImpl>[0]): Promise<ActionResult> {
  return runAction(() => recordEmployeeDocumentImpl(input));
}
export async function deleteEmployeeDocument(documentId: string): Promise<ActionResult> {
  return runAction(() => deleteEmployeeDocumentImpl(documentId));
}
export async function setEmployeePhoto(employeeId: string, storagePath: string): Promise<ActionResult> {
  return runAction(() => setEmployeePhotoImpl(employeeId, storagePath));
}
export async function bulkImportEmployees(
  companyId: string,
  rows: BulkEmployeeRow[],
): Promise<ActionResult<{ inserted: number; privateSaved: number; privateSkipped: number }>> {
  return runAction(() => bulkImportEmployeesImpl(companyId, rows));
}
