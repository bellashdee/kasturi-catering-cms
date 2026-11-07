"use server";

import { revalidatePath } from "next/cache";
import { diffChanges, recordEditHistory } from "@/lib/hr/editHistory";
import { TRACKED_EMPLOYEE_COLUMNS, TRACKED_PRIVATE_COLUMNS } from "@/lib/hr/changeFields";
import { createClient } from "@/lib/supabase/server";
import { dobFromIc } from "@/lib/hr/ic";
import { requirePayrollAccess } from "@/lib/hr/payrollAccess";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { syncModulesFromPosition } from "@/lib/positionAccessSync";
import { setLoginEmail } from "@/lib/hr/loginEmailSync";
import type { Database } from "@/lib/supabase/types";

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
  dateOfBirth?: string;
  nationality?: string;
  gender?: string;
  race?: string;
  religion?: string;
  maritalStatus?: string;
  branch?: string;
  shortName?: string;
  // Personnel Information form
  employeeNo?: string;
  oldIcNo?: string;
  passportNo?: string;
  homePhone?: string;
  addressLine?: string;
  addressCity?: string;
  addressState?: string;
  addressPostcode?: string;
  permAddressLine?: string;
  permCity?: string;
  permState?: string;
  permPostcode?: string;
  spouseName?: string;
  spouseIcNo?: string;
  /** "Yes", "No" or blank. */
  spouseWorking?: string;
  childrenCount?: string;
  childRelief?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelationship?: string;
  jobLevel?: string;
  dateConfirmed?: string;
  datePromoted?: string;
  resignDate?: string;
  educationBackground?: string;
  workingExperience?: string;
  // Admin only (employee_private_details)
  socsoNo?: string;
  taxNo?: string;
  taxBranch?: string;
  bankId?: string;
  bankBranchCode?: string;
  basicRate?: string;
  payBasis?: string;
  paymentMode?: string;
  /** Login account of this person (admin only); lets them submit and see their own OT. null clears the link. */
  userId?: string | null;
};

type PrivateInput = Pick<EmployeeInput, "bankName" | "bankAccountNo" | "epfNo" | "socsoNo" | "taxNo" | "taxBranch" | "bankId" | "bankBranchCode" | "basicRate" | "payBasis" | "paymentMode">;
const PRIVATE_KEYS: (keyof PrivateInput)[] = ["bankName", "bankAccountNo", "epfNo", "socsoNo", "taxNo", "taxBranch", "bankId", "bankBranchCode", "basicRate", "payBasis", "paymentMode"];
const hasPrivateInput = (input: Partial<EmployeeInput>) => PRIVATE_KEYS.some((k) => input[k] !== undefined);

function numberOrNull(v: string | undefined, label: string): number | null {
  const t = v?.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Enter a valid ${label}.`);
  return n;
}

async function savePrivateDetails(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  employeeId: string,
  companyId: string,
  input: PrivateInput,
) {
  const text = (v: string | undefined) => v?.trim() || null;
  const basicRate = numberOrNull(input.basicRate, "basic rate");
  const { error } = await supabase.from("employee_private_details").upsert({
    employee_id: employeeId,
    company_id: companyId,
    bank_name: text(input.bankName),
    bank_account_no: text(input.bankAccountNo),
    epf_no: text(input.epfNo),
    socso_no: text(input.socsoNo),
    tax_no: text(input.taxNo),
    tax_branch: text(input.taxBranch),
    bank_id: text(input.bankId),
    bank_branch_code: text(input.bankBranchCode),
    basic_rate: basicRate,
    pay_basis: text(input.payBasis),
    payment_mode: text(input.paymentMode),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Only Madam Penny or Nabilah can save salary, bank, KWSP, SOCSO and tax details.");
}

/** The Personnel Information details of the staff record (address, spouse, emergency contact, job dates, education, experience). */
function personnelColumns(input: Partial<EmployeeInput>) {
  const text = (v: string | undefined) => v?.trim() || null;
  const date = (v: string | undefined, label: string) => {
    const t = text(v);
    if (t && !/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error(`Enter a valid ${label}.`);
    return t;
  };
  const children = numberOrNull(input.childrenCount, "number of children");
  if (children !== null && !Number.isInteger(children)) throw new Error("Enter a valid number of children.");
  const spouseWorking = input.spouseWorking === "Yes" ? true : input.spouseWorking === "No" ? false : null;
  return {
    employee_no: text(input.employeeNo),
    old_ic_no: text(input.oldIcNo),
    passport_no: text(input.passportNo),
    home_phone: text(input.homePhone),
    address_line: text(input.addressLine),
    address_city: text(input.addressCity),
    address_state: text(input.addressState),
    address_postcode: text(input.addressPostcode),
    perm_address_line: text(input.permAddressLine),
    perm_city: text(input.permCity),
    perm_state: text(input.permState),
    perm_postcode: text(input.permPostcode),
    spouse_name: text(input.spouseName),
    spouse_ic_no: text(input.spouseIcNo),
    spouse_working: spouseWorking,
    children_count: children,
    child_relief: numberOrNull(input.childRelief, "child relief"),
    emergency_name: text(input.emergencyName),
    emergency_phone: text(input.emergencyPhone),
    emergency_relationship: text(input.emergencyRelationship),
    job_level: text(input.jobLevel),
    date_confirmed: date(input.dateConfirmed, "date confirmed"),
    date_promoted: date(input.datePromoted, "date promoted"),
    resign_date: date(input.resignDate, "date resigned"),
    education_background: text(input.educationBackground),
    working_experience: text(input.workingExperience),
  };
}

/** Date of birth, nationality, gender, race, religion, marital status and branch; the date of birth comes from the IC number when it is not typed. */
function personalColumns(input: Partial<EmployeeInput>) {
  const text = (v: string | undefined) => v?.trim() || null;
  const gender = text(input.gender);
  if (gender && gender !== "Male" && gender !== "Female") throw new Error("Select Male or Female.");
  const dob = text(input.dateOfBirth) ?? dobFromIc(input.icPassportNo);
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new Error("Enter a valid date of birth.");
  return { date_of_birth: dob, nationality: text(input.nationality), gender, race: text(input.race), religion: text(input.religion), marital_status: text(input.maritalStatus), branch: text(input.branch), short_name: text(input.shortName)?.toUpperCase() ?? null };
}

/** The staff data is for Madam Penny and Nabilah only (the Super Admins): anyone else may only see their own record and ask for a change. */
async function requireHrAdmin(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], _companyId: string, message: string) {
  const { data } = await supabase.rpc("current_user_is_super_admin");
  if (data !== true) throw new Error(message);
}

export async function createEmployee(input: EmployeeInput) {
  const { supabase } = await requireUser();
  await requireHrAdmin(supabase, input.companyId, "Only Madam Penny or Nabilah can add staff.");

  const { data, error } = await supabase
    .from("employees")
    .insert({
      company_id: input.companyId,
      full_name: input.fullName,
      department: input.department || null,
      position: input.position?.trim().toUpperCase() || null,
      employment_type: input.employmentType,
      status: input.status,
      join_date: input.joinDate || null,
      ic_passport_no: input.icPassportNo || null,
      phone: input.phone || null,
      email: input.email || null,
      ...personalColumns(input),
      ...personnelColumns(input),
    })
    .select("id")
    .single();

  if (error) throw error;

  if (PRIVATE_KEYS.some((k) => input[k]?.trim())) {
    await savePrivateDetails(supabase, data.id, input.companyId, input);
  }

  revalidatePath("/hr");
  return data;
}

/**
 * One staff name, several companies: creates the staff record in each chosen company (every company keeps its own record for
 * leave, payroll, OT and attendance, so the companies stay separate). The list shows the person once.
 */
export async function createEmployeeInCompanies(input: Omit<EmployeeInput, "companyId">, companyIds: string[]) {
  const ids = Array.from(new Set(companyIds));
  if (ids.length === 0) throw new Error("Select at least one company where this person works.");
  let first: { id: string } | null = null;
  for (const companyId of ids) {
    const created = await createEmployee({ ...input, companyId });
    first ??= created;
  }
  return first as { id: string };
}

/**
 * Attaches an existing staff member to more companies: a record with the same personal details (and bank / KWSP when allowed)
 * is created in each of them. A company where a person with the same name already exists is left as it is.
 */
export async function attachEmployeeToCompanies(employeeId: string, companyIds: string[]) {
  const { supabase } = await requireUser();
  const { data: source, error } = await supabase.from("employees").select("*").eq("id", employeeId).single();
  if (error) throw error;
  await requireHrAdmin(supabase, source.company_id, "Only Madam Penny or Nabilah can add staff to other companies.");
  const { data: sourcePrivate } = await supabase.from("employee_private_details").select("*").eq("employee_id", employeeId).maybeSingle();
  const created: string[] = [];
  for (const companyId of Array.from(new Set(companyIds))) {
    if (companyId === source.company_id) continue;
    const { data: sameCompany } = await supabase.from("employees").select("id, full_name").eq("company_id", companyId);
    const key = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
    if ((sameCompany ?? []).some((e) => key(e.full_name) === key(source.full_name))) continue;
    // the copy keeps every detail of the source except its own id, creation time and the linked login
    const { id: _id, created_at: _createdAt, user_id: _userId, company_id: _companyId, ...details } = source;
    void _id; void _createdAt; void _userId; void _companyId;
    const { data: copy, error: insertError } = await supabase
      .from("employees")
      .insert({ ...details, company_id: companyId })
      .select("id")
      .single();
    if (insertError) throw new Error("You cannot add staff to one of the selected companies.");
    created.push(copy.id);
    if (sourcePrivate) {
      // only an admin can write these; for anybody else the copy simply has none
      await supabase.from("employee_private_details").upsert({ ...sourcePrivate, employee_id: copy.id, company_id: companyId, updated_at: new Date().toISOString() });
    }
  }
  revalidatePath("/hr");
  return { created: created.length };
}

/** Returns the problem as a result (a thrown message is hidden in production), so "email already used" reaches the screen. */
export async function updateEmployee(employeeId: string, input: Partial<EmployeeInput>): Promise<ActionResult> {
  return runAction(async () => {
    await applyEmployeeUpdate(employeeId, input);
    return {};
  });
}

async function applyEmployeeUpdate(employeeId: string, input: Partial<EmployeeInput>) {
  const { supabase } = await requireUser();

  // Changing a staff record (and linking a login to it) is for the admins of the company.
  const { data: target } = await supabase.from("employees").select("*").eq("id", employeeId).single();
  if (!target) throw new Error("This staff record was not found.");
  const { data: privateBefore } = await supabase.from("employee_private_details").select("*").eq("employee_id", employeeId).maybeSingle();
  await requireHrAdmin(supabase, target.company_id, input.userId !== undefined ? "Only Madam Penny or Nabilah can link a login account to a staff record." : "Only Madam Penny or Nabilah can change staff details. Ask them in My Profile (Request a change).");

  // a changed email goes to the login linked to this staff record too (Settings > Members), so the sign-in email stays the same
  const newEmail = input.email?.trim().toLowerCase();
  const loginId = input.userId !== undefined ? input.userId : target.user_id;
  if (newEmail && loginId && newEmail !== (target.email ?? "").trim().toLowerCase()) await setLoginEmail(loginId, newEmail);

  const { error } = await supabase
    .from("employees")
    .update({
      full_name: input.fullName,
      department: input.department || null,
      position: input.position?.trim().toUpperCase() || null,
      employment_type: input.employmentType,
      status: input.status,
      join_date: input.joinDate || null,
      ic_passport_no: input.icPassportNo || null,
      phone: input.phone || null,
      email: input.email || null,
      ...personalColumns(input),
      ...personnelColumns(input),
      ...(input.userId !== undefined ? { user_id: input.userId } : {}),
    })
    .eq("id", employeeId);

  if (error) {
    if (error.code === "23505") throw new Error("That login is already linked to another staff record in this company.");
    throw error;
  }

  if (hasPrivateInput(input)) {
    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).single();
    if (emp) await savePrivateDetails(supabase, employeeId, emp.company_id, input);
  }

  // the side-bar modules follow the position: a changed position (or a newly linked login) updates what the person can open
  if (input.position !== undefined || input.userId !== undefined || input.status !== undefined) {
    const { data: linked } = await supabase.from("employees").select("user_id").eq("id", employeeId).maybeSingle();
    await syncModulesFromPosition(linked?.user_id);
  }

  // the edit history: who changed which detail, from what to what
  const [{ data: after }, { data: privateAfter }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", employeeId).maybeSingle(),
    supabase.from("employee_private_details").select("*").eq("employee_id", employeeId).maybeSingle(),
  ]);
  await recordEditHistory({
    employeeId,
    companyId: target.company_id,
    editorId: (await requireUser()).userId,
    changes: [
      ...diffChanges(target as Record<string, unknown>, after as Record<string, unknown> | null, TRACKED_EMPLOYEE_COLUMNS),
      ...diffChanges(privateBefore as Record<string, unknown> | null, privateAfter as Record<string, unknown> | null, TRACKED_PRIVATE_COLUMNS),
    ],
  });

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
  await requireHrAdmin(supabase, companyId, "Only Madam Penny or Nabilah can import staff.");

  const payload = rows
    .filter((r) => r.fullName?.trim())
    .map((r) => ({
      company_id: companyId,
      full_name: r.fullName.trim(),
      department: r.department || null,
      position: r.position?.trim().toUpperCase() || null,
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
  await requireHrAdmin(supabase, input.companyId, "Only Madam Penny or Nabilah can add staff documents.");

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

export type CertificateRow = Database["public"]["Tables"]["employee_certificates"]["Row"];

export type CertificateEdit = { certType: string; certName: string; certNumber?: string; issuedDate?: string; expiryDate?: string; documentId?: string };

/** Changes a staff document (type, name, number, dates, file). Only the admins of the company. */
export async function updateCertificate(id: string, input: CertificateEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("employee_certificates").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This document was not found (it may have been deleted).");
    await requireHrAdmin(supabase, before.company_id, "Only Madam Penny or Nabilah can change staff documents.");
    const name = input.certName?.trim();
    if (!name) throw new Error("Write the name of the document.");
    for (const d of [input.issuedDate, input.expiryDate]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Enter valid dates.");
    const { error } = await supabase
      .from("employee_certificates")
      .update({
        cert_type: input.certType,
        cert_name: name.slice(0, 200),
        cert_number: input.certNumber?.trim() || null,
        issued_date: input.issuedDate || null,
        expiry_date: input.expiryDate || null,
        document_id: input.documentId || null,
      })
      .eq("id", id);
    if (error) throw error;
    await recordAudit({ companyId: before.company_id, relatedTable: "employee_certificates", relatedId: id, action: "edited", previousValue: `${before.cert_type} · ${before.cert_name} · ${before.expiry_date ?? "no expiry"}`, newValue: `${input.certType} · ${name} · ${input.expiryDate || "no expiry"}` });
    revalidatePath(`/hr/${before.employee_id}`);
    revalidatePath("/hr");
    return {};
  }, "Could not save the document. Please try again.");
}

/** Deletes a staff document and returns it, so the delete can be undone. The attached file stays in storage. */
export async function deleteCertificate(id: string): Promise<ActionResult<{ row: CertificateRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("employee_certificates").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This document was not found (it may already be deleted).");
    await requireHrAdmin(supabase, before.company_id, "Only Madam Penny or Nabilah can delete staff documents.");
    const { data: removed, error } = await supabase.from("employee_certificates").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the document.");
    await recordAudit({ companyId: before.company_id, relatedTable: "employee_certificates", relatedId: id, action: "deleted", previousValue: `${before.cert_type} · ${before.cert_name} · ${before.expiry_date ?? "no expiry"}`, newValue: "Deleted" });
    revalidatePath(`/hr/${before.employee_id}`);
    revalidatePath("/hr");
    return { row: before };
  }, "Could not delete the document. Please try again.");
}

/** Undo of a delete: the document comes back as it was. */
export async function restoreCertificate(row: CertificateRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id || !row.employee_id) throw new Error("There is nothing to put back.");
    await requireHrAdmin(supabase, row.company_id, "Only Madam Penny or Nabilah can put a staff document back.");
    const { error } = await supabase.from("employee_certificates").insert(row);
    if (error) throw new Error("Could not put the document back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "employee_certificates", relatedId: row.id, action: "restored", newValue: `${row.cert_name} put back after it was deleted` });
    revalidatePath(`/hr/${row.employee_id}`);
    revalidatePath("/hr");
    return {};
  }, "Could not put the document back.");
}

export type LeaveInput = {
  employeeId: string;
  companyId: string;
  leaveType: string;
  /** what the leave is for, when the type is "other" */
  leaveTypeOther?: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  documentId?: string;
  /** keyed in by an admin or a leave editor for a leave that is already decided; anyone else's request always starts pending */
  status?: "pending" | "approved";
};

export type LeaveRow = Database["public"]["Tables"]["leave_requests"]["Row"];
export type ApprovalRow = Database["public"]["Tables"]["approvals"]["Row"];
export type LeaveSnapshot = { leave: LeaveRow; approval: ApprovalRow | null };

const LEAVE_TYPES = ["annual", "medical", "emergency", "unpaid", "hospitalisation", "replacement", "maternity", "bereavement", "marriage", "other"];

/** The person whose leave it is, or an admin of the company (an admin may also change a leave that is already decided). */
async function leaveAccess(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], leave: LeaveRow) {
  const { data: admin } = await supabase.rpc("user_is_company_admin", { target_company_id: leave.company_id });
  if (admin === true) return { admin: true };
  const { data: editor } = await supabase.rpc("user_is_leave_editor");
  if (editor === true) return { admin: true };
  const { data: owns } = await supabase.rpc("user_owns_employee", { target_employee_id: leave.employee_id });
  if (owns !== true) throw new Error("You can only change your own leave requests.");
  if (leave.status !== "pending") throw new Error("A leave request that is already decided can only be changed by an admin.");
  return { admin: false };
}

/** Changes a leave request (type, dates, reason, file). */
export async function updateLeave(id: string, input: Omit<LeaveInput, "employeeId" | "companyId">): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const { data: before } = await supabase.from("leave_requests").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This leave request was not found (it may have been deleted).");
    await leaveAccess(supabase, before);
    if (!LEAVE_TYPES.includes(input.leaveType)) throw new Error("Choose the leave type.");
    if (input.leaveType === "other" && !input.leaveTypeOther?.trim()) throw new Error("Write what the leave is for (Other: Nyatakan).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) throw new Error("The end date must be on or after the start date.");
    const days = Math.round((Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000) + 1;
    const { error } = await supabase
      .from("leave_requests")
      .update({
        leave_type: input.leaveType,
        leave_type_other: input.leaveType === "other" ? input.leaveTypeOther?.trim().slice(0, 120) || null : null,
        start_date: input.startDate,
        end_date: input.endDate,
        days,
        reason: input.reason?.trim() || null,
        document_id: input.documentId || before.document_id,
      })
      .eq("id", id);
    if (error) throw error;
    if (input.documentId && input.documentId !== before.document_id) {
      await supabase.from("documents").update({ extraction_status: "confirmed", related_table: "leave_requests", related_id: id, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", input.documentId);
    }
    await recordAudit({ companyId: before.company_id, relatedTable: "leave_requests", relatedId: id, action: "edited", previousValue: `${before.leave_type} ${before.start_date} → ${before.end_date}`, newValue: `${input.leaveType} ${input.startDate} → ${input.endDate}` });
    revalidatePath("/hr/leave");
    revalidatePath(`/hr/${before.employee_id}`);
    return {};
  }, "Could not save the leave request. Please try again.");
}

/** Deletes a leave request (with its approval record) and returns both, so the delete can be undone. */
export async function deleteLeave(id: string): Promise<ActionResult<{ row: LeaveSnapshot }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: leave } = await supabase.from("leave_requests").select("*").eq("id", id).maybeSingle();
    if (!leave) throw new Error("This leave request was not found (it may already be deleted).");
    await leaveAccess(supabase, leave);
    const { data: approval } = leave.approval_id ? await supabase.from("approvals").select("*").eq("id", leave.approval_id).maybeSingle() : { data: null };
    const { data: removed, error } = await supabase.from("leave_requests").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the leave request.");
    if (approval) await supabase.from("approvals").delete().eq("id", approval.id);
    await recordAudit({ companyId: leave.company_id, relatedTable: "leave_requests", relatedId: id, action: "deleted", previousValue: `${leave.leave_type} ${leave.start_date} → ${leave.end_date} (${leave.status})`, newValue: "Deleted" });
    revalidatePath("/hr/leave");
    revalidatePath(`/hr/${leave.employee_id}`);
    return { row: { leave, approval: approval ?? null } };
  }, "Could not delete the leave request. Please try again.");
}

/** Undo of a delete: the leave request and its approval record come back as they were. */
export async function restoreLeave(snapshot: LeaveSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { leave, approval } = snapshot;
    if (!leave?.id || !leave.company_id || !leave.employee_id) throw new Error("There is nothing to put back.");
    await leaveAccess(supabase, leave);
    if (approval) {
      const { error: approvalError } = await supabase.from("approvals").insert(approval);
      if (approvalError) throw new Error("Could not put the leave request back.");
    }
    const { error } = await supabase.from("leave_requests").insert(leave);
    if (error) {
      if (approval) await supabase.from("approvals").delete().eq("id", approval.id);
      throw new Error("Could not put the leave request back.");
    }
    await recordAudit({ companyId: leave.company_id, relatedTable: "leave_requests", relatedId: leave.id, action: "restored", newValue: "Put back after it was deleted" });
    revalidatePath("/hr/leave");
    revalidatePath(`/hr/${leave.employee_id}`);
    return {};
  }, "Could not put the leave request back.");
}

export async function requestLeave(input: LeaveInput) {
  const { supabase, userId } = await requireUser();
  const { data: owns } = await supabase.rpc("user_owns_employee", { target_employee_id: input.employeeId });
  // an admin (Super Admin) or a leave editor (Ms. Syaza, Ms. Nabilah) may key in the leave of other staff
  const [{ data: isSuper }, { data: isEditor }] = await Promise.all([supabase.rpc("current_user_is_super_admin"), supabase.rpc("user_is_leave_editor")]);
  const privileged = isSuper === true || isEditor === true;
  if (owns !== true && !privileged) throw new Error("Only an admin or a leave editor can request leave for other staff.");
  if (!input.employeeId || !input.companyId) throw new Error("Choose the staff member.");
  if (!LEAVE_TYPES.includes(input.leaveType)) throw new Error("Choose the leave type.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) throw new Error("The end date must be on or after the start date.");
  const status = privileged && owns !== true && input.status === "approved" ? "approved" : "pending";

  const { data: leave, error: leaveError } = await supabase
    .from("leave_requests")
    .insert({
      company_id: input.companyId,
      employee_id: input.employeeId,
      leave_type: input.leaveType,
      leave_type_other: input.leaveType === "other" ? input.leaveTypeOther?.trim().slice(0, 120) || null : null,
      start_date: input.startDate,
      end_date: input.endDate,
      days: input.days,
      reason: input.reason || null,
      document_id: input.documentId || null,
      status,
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
      status,
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
    .select("id, approval_id, employee_id, company_id")
    .eq("id", leaveRequestId)
    .single();
  if (fetchError) throw fetchError;
  await requireHrAdmin(supabase, leave.company_id, "Only an admin of the company can approve or reject leave.");

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
  await requirePayrollAccess(supabase);

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
  await requirePayrollAccess(supabase);
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
  await requireHrAdmin(supabase, input.companyId, "Only an admin of the company can add company documents.");

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

export type CompanyDocumentRow = Database["public"]["Tables"]["company_documents"]["Row"];

export type CompanyDocumentEdit = { docType: string; title: string; referenceNumber?: string; issuedDate?: string; expiryDate?: string; notes?: string; documentId?: string };

/** Changes a licence / agreement (type, title, reference, dates, notes, file). Only the admins of the company. */
export async function updateCompanyDocument(id: string, input: CompanyDocumentEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const { data: before } = await supabase.from("company_documents").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This document was not found (it may have been deleted).");
    await requireHrAdmin(supabase, before.company_id, "Only an admin of the company can change company documents.");
    const title = input.title?.trim();
    if (!title) throw new Error("Write the title of the document.");
    for (const d of [input.issuedDate, input.expiryDate]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Enter valid dates.");
    const { error } = await supabase
      .from("company_documents")
      .update({
        doc_type: input.docType,
        title: title.slice(0, 200),
        reference_number: input.referenceNumber?.trim() || null,
        issued_date: input.issuedDate || null,
        expiry_date: input.expiryDate || null,
        notes: input.notes?.trim() || null,
        document_id: input.documentId || before.document_id,
      })
      .eq("id", id);
    if (error) throw error;
    if (input.documentId && input.documentId !== before.document_id) {
      await supabase.from("documents").update({ extraction_status: "confirmed", related_table: "company_documents", related_id: id, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", input.documentId);
    }
    await recordAudit({ companyId: before.company_id, relatedTable: "company_documents", relatedId: id, action: "edited", previousValue: `${before.doc_type} · ${before.title} · ${before.expiry_date ?? "no expiry"}`, newValue: `${input.docType} · ${title} · ${input.expiryDate || "no expiry"}` });
    revalidatePath("/hr/documents");
    revalidatePath("/");
    return {};
  }, "Could not save the document. Please try again.");
}

/** Deletes a licence / agreement and returns it, so the delete can be undone. */
export async function deleteCompanyDocument(id: string): Promise<ActionResult<{ row: CompanyDocumentRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: doc } = await supabase.from("company_documents").select("*").eq("id", id).maybeSingle();
    if (!doc) throw new Error("This document was not found (it may already be deleted).");
    await requireHrAdmin(supabase, doc.company_id, "Only an admin of the company can delete company documents.");
    const { data: removed, error } = await supabase.from("company_documents").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the document.");
    await recordAudit({ companyId: doc.company_id, relatedTable: "company_documents", relatedId: id, action: "deleted", previousValue: `${doc.doc_type} · ${doc.title} · ${doc.expiry_date ?? "no expiry"}`, newValue: "Deleted" });
    revalidatePath("/hr/documents");
    revalidatePath("/");
    return { row: doc };
  }, "Could not delete the document. Please try again.");
}

/** Undo of a delete: the licence / agreement comes back as it was. */
export async function restoreCompanyDocument(row: CompanyDocumentRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    await requireHrAdmin(supabase, row.company_id, "Only an admin of the company can put a company document back.");
    const { error } = await supabase.from("company_documents").insert(row);
    if (error) throw new Error("Could not put the document back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "company_documents", relatedId: row.id, action: "restored", newValue: `${row.title} put back after it was deleted` });
    revalidatePath("/hr/documents");
    revalidatePath("/");
    return {};
  }, "Could not put the document back.");
}
