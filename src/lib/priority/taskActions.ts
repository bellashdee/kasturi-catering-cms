"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, type TaskPriority, type TaskStatus } from "@/lib/priority/tasks";

type DB = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

function refresh() {
  revalidatePath("/priority-centre");
  revalidatePath("/");
}

async function isAdmin(supabase: DB, companyId: string): Promise<boolean> {
  const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: companyId });
  return data === true;
}

export type TaskInput = {
  companyId: string;
  title: string;
  description?: string;
  responsibleId?: string;
  department?: string;
  priority: TaskPriority;
  startDate?: string;
  /** Local Malaysia date and time as typed ("YYYY-MM-DDTHH:mm"); stored as the real instant (UTC+8). */
  dueAt?: string;
  reminderAt?: string;
  documentId?: string;
};

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** "2026-10-20T17:30" typed in Malaysia time → the ISO instant. */
function malaysiaInstant(value: string | undefined, label: string): string | null {
  if (!value?.trim()) return null;
  if (!LOCAL.test(value)) throw new Error(`Enter a valid ${label}.`);
  const iso = new Date(`${value}:00+08:00`);
  if (Number.isNaN(iso.getTime())) throw new Error(`Enter a valid ${label}.`);
  return iso.toISOString();
}

function validate(input: TaskInput) {
  if (!input.title?.trim()) throw new Error("Write the task title.");
  if (!TASK_PRIORITIES.includes(input.priority)) throw new Error("Select the priority.");
  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new Error("Enter a valid start date.");
}

function row(input: TaskInput) {
  const dueAt = malaysiaInstant(input.dueAt, "due date and time");
  const reminderAt = malaysiaInstant(input.reminderAt, "reminder date and time");
  if (input.startDate && dueAt && input.startDate > new Date(Date.parse(dueAt) + 8 * 3_600_000).toISOString().slice(0, 10)) throw new Error("The start date is after the due date.");
  return {
    company_id: input.companyId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    responsible_id: input.responsibleId || null,
    department: input.department?.trim() || null,
    priority: input.priority,
    start_date: input.startDate || null,
    due_at: dueAt,
    reminder_at: reminderAt,
    document_id: input.documentId || null,
  };
}

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    validate(input);
    const admin = await isAdmin(supabase, input.companyId);
    const responsible = input.responsibleId || (admin ? null : userId);
    if (!admin && responsible !== userId) throw new Error("You can only create tasks for yourself. Ask an admin to assign it to someone else.");
    const { data, error } = await supabase
      .from("priority_tasks")
      .insert({ ...row(input), responsible_id: responsible, created_by: userId })
      .select("id")
      .single();
    if (error) throw error;
    await recordAudit({ companyId: input.companyId, relatedTable: "priority_tasks", relatedId: data.id, action: "task_created", newValue: input.title.trim() });
    refresh();
    return { id: data.id };
  }, "Could not save the task. Please try again.");
}

async function loadTask(supabase: DB, id: string) {
  const { data } = await supabase.from("priority_tasks").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("This task was not found, or you do not have access to it.");
  return data;
}

/** Edits the task. Admins may edit any task of their company; everybody else the tasks that are theirs (given to them or created by them). */
export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    validate(input);
    const task = await loadTask(supabase, id);
    const admin = await isAdmin(supabase, task.company_id);
    if (!admin && task.created_by !== userId && task.responsible_id !== userId) throw new Error("You can only edit your own tasks (given to you or created by you), or ask an admin.");
    if (task.status === "completed") throw new Error("A completed task is part of the history and cannot be edited. Reopen it first.");
    if (input.companyId !== task.company_id) throw new Error("A task cannot be moved to another company.");
    const next = row(input);
    if (!admin && next.responsible_id !== task.responsible_id && next.responsible_id !== userId) throw new Error("Only an admin can assign a task to someone else.");

    const { error } = await supabase.from("priority_tasks").update(next).eq("id", id);
    if (error) throw error;

    const changes: string[] = [];
    if (task.title !== next.title) changes.push("title");
    if (task.due_at !== next.due_at) changes.push("due date");
    if (task.priority !== next.priority) changes.push(`priority ${TASK_PRIORITY_LABEL[task.priority as TaskPriority]} → ${TASK_PRIORITY_LABEL[next.priority]}`);
    if (task.responsible_id !== next.responsible_id) changes.push("responsible person");
    if ((task.description ?? null) !== next.description) changes.push("description");
    await recordAudit({ companyId: task.company_id, relatedTable: "priority_tasks", relatedId: id, action: next.responsible_id !== task.responsible_id ? "task_assigned" : "task_edited", newValue: changes.join(", ") || "details" });
    refresh();
    return {};
  }, "Could not save the task. Please try again.");
}

/**
 * Changes the status. Completing records who and the exact time; reopening clears them (the audit log keeps both events).
 * Only an admin of the company, the person responsible or the creator can do this.
 */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    if (!TASK_STATUSES.includes(status)) throw new Error("Select a valid status.");
    const task = await loadTask(supabase, id);
    if (task.status === status) return {};
    const admin = await isAdmin(supabase, task.company_id);
    if (!admin && task.responsible_id !== userId && task.created_by !== userId) throw new Error("You can only update tasks assigned to you or created by you.");

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("priority_tasks")
      .update({ status, completed_at: status === "completed" ? now : null, completed_by: status === "completed" ? userId : null })
      .eq("id", id)
      .eq("status", task.status)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length !== 1) throw new Error("This task was changed by someone else. Refresh the page.");
    await recordAudit({
      companyId: task.company_id,
      relatedTable: "priority_tasks",
      relatedId: id,
      action: status === "completed" ? "task_completed" : "status_changed",
      previousValue: TASK_STATUS_LABEL[task.status as TaskStatus],
      newValue: TASK_STATUS_LABEL[status],
    });
    refresh();
    return {};
  }, "Could not update the task. Please try again.");
}

/** Admins (any open task of their company) or the person the task belongs to (given to them or created by them); a completed task is never deleted (it stays in the history). The page asks for confirmation first. */
export async function deleteTask(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const task = await loadTask(supabase, id);
    if (task.created_by !== userId && task.responsible_id !== userId && !(await isAdmin(supabase, task.company_id))) throw new Error("You can only delete your own tasks (given to you or created by you), or ask an admin.");
    if (task.status === "completed") throw new Error("A completed task is kept in the history and cannot be deleted. Cancel it instead if it was a mistake.");
    const { data: removed, error } = await supabase.from("priority_tasks").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!removed || removed.length !== 1) throw new Error("The task could not be deleted.");
    await recordAudit({ companyId: task.company_id, relatedTable: "priority_tasks", relatedId: id, action: "task_deleted", previousValue: task.title, newValue: "deleted" });
    refresh();
    return {};
  }, "Could not delete the task. Please try again.");
}
