import { malaysiaDateOf } from "@/lib/format";

export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "waiting_approval" | "completed" | "cancelled";

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };
export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const TASK_PRIORITY_TONE: Record<TaskPriority, "danger" | "warning" | "info" | "neutral"> = { urgent: "danger", high: "warning", medium: "info", low: "neutral" };

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  waiting_approval: "Waiting for Approval",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUSES = Object.keys(TASK_STATUS_LABEL) as TaskStatus[];
export const TASK_PRIORITIES = Object.keys(TASK_PRIORITY_LABEL) as TaskPriority[];

/** The current instant (a function of its own so server pages do not call Date.now while rendering). */
export const nowMs = () => Date.now();

export const isOpenStatus = (status: string) => status !== "completed" && status !== "cancelled";

export type TaskLike = { status: string; due_at: string | null };

/** Open task whose due date and time has passed (Malaysia time is only used for display; the comparison is of instants). */
export function isOverdue(task: TaskLike, now: number): boolean {
  return isOpenStatus(task.status) && !!task.due_at && Date.parse(task.due_at) < now;
}

/** "overdue" | "today" | "tomorrow" | "later" | "none" for an open task, by its due date in Malaysia time. */
export function dueBucket(task: TaskLike, now: number, today: string): "overdue" | "today" | "tomorrow" | "later" | "none" {
  if (!isOpenStatus(task.status) || !task.due_at) return "none";
  if (isOverdue(task, now)) return "overdue";
  const day = malaysiaDateOf(task.due_at);
  if (day === today) return "today";
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return day === tomorrow ? "tomorrow" : "later";
}

/** The Monday of the week that contains the date (YYYY-MM-DD). */
export function weekStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

export type TaskSummary = { dueToday: number; overdue: number; completedThisWeek: number; open: number };

export function summariseTasks(tasks: { status: string; due_at: string | null; completed_at: string | null }[], now: number, today: string): TaskSummary {
  const monday = weekStart(today);
  const s: TaskSummary = { dueToday: 0, overdue: 0, completedThisWeek: 0, open: 0 };
  for (const t of tasks) {
    if (isOpenStatus(t.status)) {
      s.open += 1;
      const b = dueBucket(t, now, today);
      if (b === "overdue") s.overdue += 1;
      if (b === "today") s.dueToday += 1;
    } else if (t.status === "completed" && t.completed_at && malaysiaDateOf(t.completed_at) >= monday) {
      s.completedThisWeek += 1;
    }
  }
  return s;
}

/** Overdue first, then by due date; tasks without a due date last; closed tasks after the open ones. */
export function sortTasks<T extends { status: string; priority: string; due_at: string | null; created_at: string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const oa = isOpenStatus(a.status) ? 0 : 1;
    const ob = isOpenStatus(b.status) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    if (oa === 0) {
      if (a.due_at !== b.due_at) return !a.due_at ? 1 : !b.due_at ? -1 : a.due_at.localeCompare(b.due_at);
      return (TASK_PRIORITY_RANK[a.priority as TaskPriority] ?? 9) - (TASK_PRIORITY_RANK[b.priority as TaskPriority] ?? 9);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}
