"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { countedHoursForMonth } from "@/lib/hr/otQueries";
import { superiorsOf } from "@/lib/hr/superiors";
import { untyped } from "@/lib/kitchenPurchase/shared";
import type { Database } from "@/lib/supabase/types";
import {
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

/** `hasSuperior`: the OT goes to the staff member's superior in the system, so no separate proof of approval is needed. */
function validate(input: OvertimeInput, submitting: boolean, hasSuperior: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) throw new Error("Select the OT date.");
  if (input.workDate > todayInMalaysia()) throw new Error("The OT date cannot be in the future.");
  if (calcOtHours(input.otStartTime, input.otEndTime) === null) throw new Error("Enter a valid OT start and end time (they cannot be the same).");
  if (input.normalWorkingHours !== undefined && (!Number.isFinite(input.normalWorkingHours) || input.normalWorkingHours < 0 || input.normalWorkingHours > 24)) {
    throw new Error("Normal working hours must be between 0 and 24.");
  }
  if (submitting && !input.reason?.trim()) throw new Error("Enter the reason / description for this OT. For a saved draft, press Edit Draft and fill it in.");
  if (submitting && !hasSuperior && !input.documentId) throw new Error("Attach the approval of your manager (for example a screenshot of the message, a signed form or an email) before you submit the OT.");
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

/**
 * A staff member with a superior: every OT waits for the superior's approval. Without one (the old way): below the monthly limit the
 * OT is simply Submitted; if it would take the month above the limit it needs Manager Approval.
 */
async function statusForSubmission(supabase: DB, employeeId: string, workDate: string, hours: number, hasSuperior: boolean, excludeId?: string) {
  const counted = await countedHoursForMonth(supabase, employeeId, workDate, excludeId);
  const projected = counted + hours;
  const exceeds = projected > OT_MONTHLY_LIMIT;
  const waits = exceeds || hasSuperior;
  return { counted, projected, exceeds, waits, status: (waits ? "pending_approval" : "submitted") as OtStatus };
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
  /** true when the OT waits for a decision (the superior, or above the monthly limit). */
  needsApproval: boolean;
  monthlyTotal: number;
  /** who decides it: the superior's name (null when the staff member has no superior) */
  approverName: string | null;
};

/**
 * Save an OT as a draft or submit it. The staff name must be an existing staff record, the hours are always
 * calculated from the start/end times (also enforced by a database trigger), and the submission time is the server clock.
 */
async function saveOvertimeImpl(input: OvertimeInput, intent: "draft" | "submit", overtimeId?: string): Promise<SaveOvertimeResult> {
  const { supabase, userId } = await requireUser();
  const submitting = intent === "submit";
  const superior = (await superiorsOf(supabase, [input.employeeId])).get(input.employeeId) ?? null;
  validate(input, submitting, !!superior);

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
  let exceeds = false;
  let monthlyTotal = 0;
  if (submitting) {
    await assertNoOverlap(supabase, input.employeeId, input.workDate, input.otStartTime, input.otEndTime, overtimeId);
    const check = await statusForSubmission(supabase, input.employeeId, input.workDate, hours, !!superior, overtimeId);
    status = check.status;
    needsApproval = check.waits;
    exceeds = check.exceeds;
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
    exceeds_limit: exceeds,
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
      reason: exceeds
        ? `Would bring the month to ${monthlyTotal} hours (limit ${OT_MONTHLY_LIMIT}); Manager Approval required.`
        : superior
          ? `Sent to ${superior.name} (superior) for approval.`
          : undefined,
    });
    if (needsApproval) await openApproval(supabase, userId, employee.company_id, id);
  }

  refresh(input.employeeId, id);
  revalidatePath("/profile/ot");
  revalidatePath("/profile/team");
  return { id: id!, status, needsApproval, monthlyTotal, approverName: superior?.name ?? null };
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
 * The decision of the superior (or a Super Admin; for staff without a superior, the OT approvers). Recorded with who decided, the time,
 * the decision, the approved hours and remarks. Nobody decides their own OT. The checks run in the database (decide_staff_overtime),
 * because a superior is not always an admin of the staff member's company.
 */
async function decideOvertimeImpl(overtimeId: string, decision: "approved" | "rejected", options: { approvedHours?: number; remarks?: string }) {
  const { supabase } = await requireUser();
  const { data: team } = await untyped(supabase).rpc("my_team_requests");
  const fromTeam = ((team?.overtime ?? []) as { id: string; employee_id: string; company: string; status: string; hours: number }[]).find((o) => o.id === overtimeId);
  const { data: rec } = await supabase.from("overtime_records").select("id, employee_id, company_id, status, hours").eq("id", overtimeId).maybeSingle();
  const employeeId = rec?.employee_id ?? fromTeam?.employee_id;
  if (!employeeId) throw new Error("OT record not found.");
  const previous = rec?.status ?? fromTeam?.status ?? "";
  const remarks = options.remarks?.trim() || null;

  const { error } = await untyped(supabase).rpc("decide_staff_overtime", {
    p_overtime_id: overtimeId,
    p_decision: decision,
    p_approved_hours: decision === "approved" && Number.isFinite(options.approvedHours) ? options.approvedHours : null,
    p_remarks: remarks,
  });
  if (error) throw new Error(error.message);

  const companyId = rec?.company_id;
  if (companyId) {
    await logTaskAudit({
      companyId,
      relatedTable: "overtime_records",
      relatedId: overtimeId,
      action: decision === "approved" ? "ot_approved" : "ot_rejected",
      previousValue: previous,
      newValue: decision === "approved" ? `${options.approvedHours ?? rec?.hours} hours approved` : "rejected",
      reason: remarks ?? undefined,
    }).catch(() => undefined);
  }
  refresh(employeeId, overtimeId);
  revalidatePath("/profile/team");
  revalidatePath("/profile/ot");
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

export type OvertimeRow = Database["public"]["Tables"]["overtime_records"]["Row"];
export type OvertimeApprovalRow = Database["public"]["Tables"]["approvals"]["Row"];
export type OvertimeSnapshot = { ot: OvertimeRow; approval: OvertimeApprovalRow | null };

/**
 * Deletes an OT that is not part of the monthly total any more: a draft, a cancelled or a rejected one (an approved or waiting OT is cancelled
 * first). Returns the record so the delete can be undone. The staff member deletes their own, an admin any.
 */
export async function deleteOvertime(overtimeId: string): Promise<ActionResult<{ row: OvertimeSnapshot }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const { data: ot } = await supabase.from("overtime_records").select("*").eq("id", overtimeId).maybeSingle();
    if (!ot) throw new Error("This OT was not found (it may already be deleted).");
    if (!["draft", "cancelled", "rejected"].includes(ot.status)) throw new Error("Cancel this OT first: only a draft, cancelled or rejected OT can be deleted.");
    const { data: employee } = await supabase.from("employees").select("id, company_id, user_id, status, full_name").eq("id", ot.employee_id).maybeSingle();
    if (employee) await assertCanActFor(supabase, userId, employee);
    const { data: approval } = ot.approval_id ? await supabase.from("approvals").select("*").eq("id", ot.approval_id).maybeSingle() : { data: null };
    const { data: removed, error } = await supabase.from("overtime_records").delete().eq("id", overtimeId).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the OT.");
    if (approval) await supabase.from("approvals").delete().eq("id", approval.id);
    await logTaskAudit({ companyId: ot.company_id, relatedTable: "overtime_records", relatedId: overtimeId, action: "ot_deleted", previousValue: `${ot.work_date} ${ot.hours}h (${ot.status})`, newValue: "deleted" });
    refresh(ot.employee_id, overtimeId);
    return { row: { ot, approval: approval ?? null } };
  }, "Could not delete the OT. Please try again.");
}

/** Undo of a delete: the OT (and its approval record) come back as they were. */
export async function restoreOvertime(snapshot: OvertimeSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const { ot, approval } = snapshot;
    if (!ot?.id || !ot.employee_id || !ot.company_id) throw new Error("There is nothing to put back.");
    const { data: employee } = await supabase.from("employees").select("id, company_id, user_id, status, full_name").eq("id", ot.employee_id).maybeSingle();
    if (employee) await assertCanActFor(supabase, userId, employee);
    if (approval) {
      const { error: approvalError } = await supabase.from("approvals").insert(approval);
      if (approvalError) throw new Error("Could not put the OT back.");
    }
    const { error } = await supabase.from("overtime_records").insert(ot);
    if (error) {
      if (approval) await supabase.from("approvals").delete().eq("id", approval.id);
      throw new Error("Could not put the OT back.");
    }
    await logTaskAudit({ companyId: ot.company_id, relatedTable: "overtime_records", relatedId: ot.id, action: "ot_restored", newValue: "put back after it was deleted" });
    refresh(ot.employee_id, ot.id);
    return {};
  }, "Could not put the OT back.");
}
