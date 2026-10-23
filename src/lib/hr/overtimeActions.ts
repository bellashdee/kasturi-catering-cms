"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { countedHoursForMonth } from "@/lib/hr/otQueries";
import {
  OT_DECIDABLE_STATUSES,
  OT_MONTHLY_LIMIT,
  calcOtHours,
  otInterval,
  otLevel,
  type OtLevel,
  type OtStatus,
} from "@/lib/hr/overtime";

type DB = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type OvertimeInput = {
  employeeId: string;
  workDate: string;
  normalWorkingHours?: number;
  otStartTime: string;
  otEndTime: string;
  reason?: string;
  documentId?: string;
};

type EmployeeRow = { id: string; company_id: string; user_id: string | null; status: string; full_name: string };

async function loadEmployee(supabase: DB, employeeId: string): Promise<EmployeeRow> {
  const { data } = await supabase.from("employees").select("id, company_id, user_id, status, full_name").eq("id", employeeId).maybeSingle();
  if (!data) throw new Error("Select your name from the staff list.");
  if (data.status !== "active") throw new Error("This staff member is not active.");
  return data;
}

/** Staff act only for their own linked record; an admin of the company may act for any staff. */
async function assertCanActFor(supabase: DB, userId: string, employee: EmployeeRow) {
  if (employee.user_id === userId) return;
  const { data: isAdmin } = await supabase.rpc("user_is_company_admin", { target_company_id: employee.company_id });
  if (isAdmin !== true) throw new Error("You can only submit OT for your own staff record. Ask an admin to link your login to your name.");
}

function validate(input: OvertimeInput, submitting: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) throw new Error("Select the OT date.");
  if (input.workDate > todayInMalaysia()) throw new Error("The OT date cannot be in the future.");
  if (calcOtHours(input.otStartTime, input.otEndTime) === null) throw new Error("Enter a valid OT start and end time (they cannot be the same).");
  if (input.normalWorkingHours !== undefined && (!Number.isFinite(input.normalWorkingHours) || input.normalWorkingHours < 0 || input.normalWorkingHours > 24)) {
    throw new Error("Normal working hours must be between 0 and 24.");
  }
  if (submitting && !input.reason?.trim()) throw new Error("Enter the reason / description for this OT. For a saved draft, press Edit Draft and fill it in.");
}

async function assertNoOverlap(supabase: DB, employeeId: string, workDate: string, start: string, end: string, excludeId?: string) {
  const mine = otInterval(start, end);
  if (!mine) return;
  let query = supabase
    .from("overtime_records")
    .select("id, ot_start_time, ot_end_time")
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .in("status", ["submitted", "pending_approval", "approved"]);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  for (const other of data ?? []) {
    if (!other.ot_start_time || !other.ot_end_time) continue;
    const theirs = otInterval(other.ot_start_time, other.ot_end_time);
    if (theirs && mine[0] < theirs[1] && theirs[0] < mine[1]) {
      throw new Error("This OT overlaps another OT already submitted for the same date.");
    }
  }
}

/** Below the monthly limit the OT is simply Submitted; if it would take the month above the limit it needs Manager Approval. */
async function statusForSubmission(supabase: DB, employeeId: string, workDate: string, hours: number, excludeId?: string) {
  const counted = await countedHoursForMonth(supabase, employeeId, workDate, excludeId);
  const projected = counted + hours;
  const exceeds = projected > OT_MONTHLY_LIMIT;
  return { counted, projected, exceeds, status: (exceeds ? "pending_approval" : "submitted") as OtStatus };
}

async function openApproval(supabase: DB, userId: string, companyId: string, overtimeId: string) {
  const { data: approval } = await supabase
    .from("approvals")
    .insert({ company_id: companyId, module: "hr", related_table: "overtime_records", related_id: overtimeId, status: "pending", requested_by: userId })
    .select("id")
    .single();
  if (approval) await supabase.from("overtime_records").update({ approval_id: approval.id }).eq("id", overtimeId);
}

async function closeApproval(supabase: DB, approvalId: string | null, status: "approved" | "rejected") {
  if (approvalId) await supabase.from("approvals").update({ status }).eq("id", approvalId);
}

function refresh(employeeId: string, overtimeId?: string) {
  revalidatePath("/hr/overtime");
  if (overtimeId) revalidatePath(`/hr/overtime/${overtimeId}`);
  revalidatePath(`/hr/${employeeId}`);
  revalidatePath("/");
}

export type SaveOvertimeResult = {
  id: string;
  status: OtStatus;
  /** true when the submission would take the month above the limit, so it waits for Manager Approval. */
  needsApproval: boolean;
  monthlyTotal: number;
};

/**
 * Save an OT as a draft or submit it. The staff name must be an existing staff record, the hours are always
 * calculated from the start/end times (also enforced by a database trigger), and the submission time is the server clock.
 */
async function saveOvertimeImpl(input: OvertimeInput, intent: "draft" | "submit", overtimeId?: string): Promise<SaveOvertimeResult> {
  const { supabase, userId } = await requireUser();
  const submitting = intent === "submit";
  validate(input, submitting);

  const employee = await loadEmployee(supabase, input.employeeId);
  await assertCanActFor(supabase, userId, employee);
  const hours = calcOtHours(input.otStartTime, input.otEndTime)!;

  let existing: { status: string; employee_id: string } | null = null;
  if (overtimeId) {
    const { data } = await supabase.from("overtime_records").select("status, employee_id").eq("id", overtimeId).maybeSingle();
    if (!data) throw new Error("OT record not found.");
    if (data.status !== "draft") throw new Error("Only a draft can be edited. Cancel this OT and submit a new one instead.");
    if (data.employee_id !== input.employeeId) throw new Error("The staff name of an existing OT cannot be changed.");
    existing = data;
  }

  let status: OtStatus = "draft";
  let needsApproval = false;
  let monthlyTotal = 0;
  if (submitting) {
    await assertNoOverlap(supabase, input.employeeId, input.workDate, input.otStartTime, input.otEndTime, overtimeId);
    const check = await statusForSubmission(supabase, input.employeeId, input.workDate, hours, overtimeId);
    status = check.status;
    needsApproval = check.exceeds;
    monthlyTotal = check.projected;
  }

  const row = {
    company_id: employee.company_id,
    employee_id: input.employeeId,
    work_date: input.workDate,
    normal_working_hours: input.normalWorkingHours ?? null,
    ot_start_time: input.otStartTime,
    ot_end_time: input.otEndTime,
    hours,
    reason: input.reason?.trim() || null,
    document_id: input.documentId ?? null,
    status,
    exceeds_limit: needsApproval,
    submitted_at: submitting ? new Date().toISOString() : null,
  };

  let id = overtimeId;
  if (existing && overtimeId) {
    const { error } = await supabase.from("overtime_records").update(row).eq("id", overtimeId);
    if (error) throw error;
    await logTaskAudit({ companyId: employee.company_id, relatedTable: "overtime_records", relatedId: overtimeId, action: "ot_edited", newValue: JSON.stringify({ date: input.workDate, start: input.otStartTime, end: input.otEndTime, hours }) });
  } else {
    const { data, error } = await supabase.from("overtime_records").insert({ ...row, created_by: userId }).select("id").single();
    if (error) throw error;
    id = data.id;
    await logTaskAudit({ companyId: employee.company_id, relatedTable: "overtime_records", relatedId: data.id, action: "ot_created", newValue: JSON.stringify({ date: input.workDate, start: input.otStartTime, end: input.otEndTime, hours }) });
  }

  if (submitting && id) {
    await logTaskAudit({
      companyId: employee.company_id,
      relatedTable: "overtime_records",
      relatedId: id,
      action: needsApproval ? "ot_request_submitted" : "ot_submitted",
      newValue: status,
      reason: needsApproval ? `Would bring the month to ${monthlyTotal} hours (limit ${OT_MONTHLY_LIMIT}); Manager Approval required.` : undefined,
    });
    if (needsApproval) await openApproval(supabase, userId, employee.company_id, id);
  }

  refresh(input.employeeId, id);
  return { id: id!, status, needsApproval, monthlyTotal };
}

/**
 * Save or submit an OT. A problem the staff member can fix (no reason, overlapping OT, no permission ...) comes back as
 * `{ ok: false, error }` so the real message is shown; it is never thrown, because production hides thrown messages.
 */
export async function saveOvertime(input: OvertimeInput, intent: "draft" | "submit", overtimeId?: string): Promise<ActionResult<SaveOvertimeResult>> {
  return runAction(() => saveOvertimeImpl(input, intent, overtimeId), "Could not save the OT. Please try again.");
}

/** Submit a saved draft (re-checks the monthly limit at the moment of submission). */
async function submitOvertimeImpl(overtimeId: string): Promise<SaveOvertimeResult> {
  const { supabase } = await requireUser();
  const { data: rec } = await supabase.from("overtime_records").select("*").eq("id", overtimeId).maybeSingle();
  if (!rec) throw new Error("OT record not found.");
  if (rec.status !== "draft") throw new Error("Only a draft can be submitted.");
  if (!rec.ot_start_time || !rec.ot_end_time) throw new Error("This draft has no start and end time.");

  return saveOvertimeImpl(
    {
      employeeId: rec.employee_id,
      workDate: rec.work_date,
      normalWorkingHours: rec.normal_working_hours ?? undefined,
      otStartTime: rec.ot_start_time.slice(0, 5),
      otEndTime: rec.ot_end_time.slice(0, 5),
      reason: rec.reason ?? undefined,
      documentId: rec.document_id ?? undefined,
    },
    "submit",
    overtimeId,
  );
}

export async function submitOvertime(overtimeId: string): Promise<ActionResult<SaveOvertimeResult>> {
  return runAction(() => submitOvertimeImpl(overtimeId), "Could not submit the OT. Please try again.");
}

/** Records are never deleted: a staff member (or admin) cancels an OT that has not been approved or rejected yet. */
async function cancelOvertimeImpl(overtimeId: string, reason?: string) {
  const { supabase, userId } = await requireUser();
  const { data: rec } = await supabase.from("overtime_records").select("id, status, employee_id, company_id, approval_id").eq("id", overtimeId).maybeSingle();
  if (!rec) throw new Error("OT record not found.");
  if (!["draft", "submitted", "pending_approval"].includes(rec.status)) throw new Error("An approved, rejected or cancelled OT cannot be cancelled.");

  const employee = await loadEmployee(supabase, rec.employee_id).catch(() => null);
  if (employee) await assertCanActFor(supabase, userId, employee);

  const { error } = await supabase.from("overtime_records").update({ status: "cancelled" }).eq("id", overtimeId);
  if (error) throw error;
  await closeApproval(supabase, rec.approval_id, "rejected");
  await logTaskAudit({ companyId: rec.company_id, relatedTable: "overtime_records", relatedId: overtimeId, action: "ot_cancelled", previousValue: rec.status, newValue: "cancelled", reason });
  refresh(rec.employee_id, overtimeId);
}

export async function cancelOvertime(overtimeId: string, reason?: string): Promise<ActionResult> {
  return runAction(async () => { await cancelOvertimeImpl(overtimeId, reason); return {}; }, "Could not cancel the OT. Please try again.");
}

/**
 * Manager decision. Recorded with the manager, the time, the decision, the approved hours and remarks.
 * A manager can never decide their own OT (also enforced by a database trigger).
 */
async function decideOvertimeImpl(overtimeId: string, decision: "approved" | "rejected", options: { approvedHours?: number; remarks?: string }) {
  const { supabase, userId } = await requireUser();
  const { data: rec } = await supabase.from("overtime_records").select("*, employees(user_id)").eq("id", overtimeId).maybeSingle();
  if (!rec) throw new Error("OT record not found.");
  if (!OT_DECIDABLE_STATUSES.includes(rec.status as OtStatus)) throw new Error("This OT is not waiting for a decision.");

  const { data: isManager } = await supabase.rpc("user_is_ot_manager", { target_company_id: rec.company_id });
  if (isManager !== true) throw new Error("Only a manager can approve or reject overtime.");
  if (rec.employees?.user_id === userId) throw new Error("You cannot approve or reject your own overtime.");

  const remarks = options.remarks?.trim() || null;
  let approvedHours: number | null = null;
  if (decision === "approved") {
    approvedHours = options.approvedHours ?? Number(rec.hours);
    if (!Number.isFinite(approvedHours) || approvedHours <= 0 || approvedHours > Number(rec.hours)) {
      throw new Error(`Approved hours must be more than 0 and not more than the ${rec.hours} hours requested.`);
    }
  } else if (!remarks) {
    throw new Error("Enter a remark explaining why this OT is rejected.");
  }

  const { error } = await supabase
    .from("overtime_records")
    .update({ status: decision, reviewed_by: userId, reviewed_at: new Date().toISOString(), approved_hours: approvedHours, manager_remarks: remarks })
    .eq("id", overtimeId);
  if (error) throw error;

  await closeApproval(supabase, rec.approval_id, decision);
  await logTaskAudit({
    companyId: rec.company_id,
    relatedTable: "overtime_records",
    relatedId: overtimeId,
    action: decision === "approved" ? "ot_approved" : "ot_rejected",
    previousValue: rec.status,
    newValue: decision === "approved" ? `${approvedHours} hours approved` : "rejected",
    reason: remarks ?? undefined,
  });
  refresh(rec.employee_id, overtimeId);
}

export async function decideOvertime(overtimeId: string, decision: "approved" | "rejected", options: { approvedHours?: number; remarks?: string }): Promise<ActionResult> {
  return runAction(async () => { await decideOvertimeImpl(overtimeId, decision, options); return {}; }, "Could not save the decision. Please try again.");
}

export type OvertimePreview = {
  monthlyTotal: number;
  projectedTotal: number;
  level: OtLevel;
  /** true when this OT would take the month above the limit. */
  needsApproval: boolean;
};

/** Live check for the form: the month-to-date total for the staff member and what this OT would bring it to. */
export async function previewOvertime(input: { employeeId: string; workDate: string; hours: number; excludeId?: string }): Promise<OvertimePreview> {
  const { supabase } = await requireUser();
  if (!input.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
    return { monthlyTotal: 0, projectedTotal: 0, level: "normal", needsApproval: false };
  }
  const monthlyTotal = await countedHoursForMonth(supabase, input.employeeId, input.workDate, input.excludeId);
  const projectedTotal = monthlyTotal + (Number.isFinite(input.hours) ? input.hours : 0);
  return { monthlyTotal, projectedTotal, level: otLevel(monthlyTotal), needsApproval: projectedTotal > OT_MONTHLY_LIMIT };
}
