import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { formatPrice, malaysiaDateOf } from "@/lib/format";
import { daysBetween, OPS_ALERT_LABEL, type PayableView } from "@/lib/priority/payables";
import { isOpenStatus, type TaskStatus } from "@/lib/priority/tasks";
import type { PriorityTask } from "@/lib/priority/queries";

type DB = SupabaseClient<Database>;

export type ReminderSettings = { daysBefore: number[]; remindAfterDeadline: boolean };

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { daysBefore: [7, 3, 1, 0], remindAfterDeadline: true };
/** The timings a person can switch on or off. */
export const REMINDER_DAY_CHOICES = [14, 7, 3, 1, 0] as const;
export const SYNC_EVERY_MS = 10 * 60 * 1000;

export type Severity = "danger" | "warning" | "info";

/**
 * Which reminder period an item with this many days to its deadline is in, or null when no reminder is due yet.
 * "before-7" means "7 days before" and stays the period until the next configured timing (3 days) is reached, so each item
 * gets one reminder per configured timing. After the deadline, one reminder per week while the item is still unresolved.
 */
export function reminderPeriod(daysLeft: number, s: ReminderSettings): string | null {
  if (daysLeft < 0) return s.remindAfterDeadline ? `after-w${Math.floor((-daysLeft - 1) / 7)}` : null;
  const reached = [...s.daysBefore].filter((d) => d >= daysLeft).sort((a, b) => a - b)[0];
  if (reached === undefined) return null;
  return reached === 0 ? "due-day" : `before-${reached}`;
}

function severityFor(daysLeft: number): Severity {
  return daysLeft < 0 ? "danger" : daysLeft <= 1 ? "warning" : "info";
}

function when(daysLeft: number): string {
  if (daysLeft < 0) return `overdue by ${-daysLeft} day(s)`;
  if (daysLeft === 0) return "due today";
  return daysLeft === 1 ? "due tomorrow" : `due in ${daysLeft} days`;
}

export type Candidate = {
  itemType: string;
  itemId: string;
  periodKey: string;
  severity: Severity;
  title: string;
  body: string | null;
  href: string;
  companyId: string | null;
};

export type ReminderInput = {
  today: string;
  now: number;
  userId: string;
  isApprover: boolean;
  /** Payables are only passed for people who are admins (they are the ones allowed to see them). */
  payables: PayableView[];
  tasks: PriorityTask[];
  otherApprovals: { id: string; module: string; company_id: string | null; created_at: string }[];
  events: { id: string; event_name: string; event_date: string; company_id: string; status: string }[];
  settings: ReminderSettings;
};

/**
 * Every reminder that is due for this person right now, and the set of items that still need attention (an unread
 * reminder of an item that is no longer in that set is closed automatically: it was paid, completed or decided).
 */
export function buildCandidates(input: ReminderInput): { candidates: Candidate[]; activeKeys: Set<string> } {
  const { today, now, settings } = input;
  const out: Candidate[] = [];
  const active = new Set<string>();
  const add = (c: Candidate) => out.push(c);

  for (const p of input.payables) {
    if (p.outstanding <= 0) continue;
    const itemId = `${p.type}:${p.id}`;
    active.add(`payable|${itemId}`);
    if (p.statusKey !== "on_hold" && p.daysLeft !== null) {
      const period = reminderPeriod(p.daysLeft, settings);
      if (period) {
        add({
          itemType: "payable",
          itemId,
          periodKey: period,
          severity: severityFor(p.daysLeft),
          title: p.daysLeft < 0 ? `Overdue supplier payment: ${p.supplierName}` : `Supplier payment ${when(p.daysLeft)}: ${p.supplierName}`,
          body: `${formatPrice(p.outstanding)}${p.reference ? ` · ${p.reference}` : ""}${p.daysLeft < 0 ? ` · ${when(p.daysLeft)}` : ""}`,
          href: "/priority-centre#payments",
          companyId: p.companyId,
        });
      }
    }
    active.add(`ops|${itemId}`);
    if (p.control?.opsAlertType && p.control.opsAlertAt) {
      add({
        itemType: "ops",
        itemId,
        periodKey: `alert-${p.control.opsAlertAt}`,
        severity: "danger",
        title: `${OPS_ALERT_LABEL[p.control.opsAlertType]}: ${p.supplierName}`,
        body: p.control.opsAlertNote,
        href: "/priority-centre#payments",
        companyId: p.companyId,
      });
    }
    if (input.isApprover) {
      for (const l of p.openRequests.filter((x) => x.status === "pending")) {
        active.add(`approval|${l.id}`);
        const waitingDays = Math.max(0, daysBetween(malaysiaDateOf(l.createdAt), today));
        add({
          itemType: "approval",
          itemId: l.id,
          periodKey: `waiting-${Math.floor(waitingDays / 3)}`,
          severity: waitingDays >= 3 ? "warning" : "info",
          title: `Payment awaiting your approval: ${p.supplierName}`,
          body: `${formatPrice(l.amount)}${waitingDays > 0 ? ` · waiting ${waitingDays} day(s)` : ""}`,
          href: "/priority-centre#approvals",
          companyId: p.companyId,
        });
      }
    }
  }

  for (const t of input.tasks) {
    if (!isOpenStatus(t.status as TaskStatus)) continue;
    const mine = t.responsible_id === input.userId || t.created_by === input.userId;
    if (!mine && !input.isApprover) continue;
    active.add(`task|${t.id}`);
    if (t.due_at) {
      const daysLeft = daysBetween(today, malaysiaDateOf(t.due_at));
      const overdueNow = Date.parse(t.due_at) < now;
      const period = overdueNow && daysLeft >= 0 ? "due-passed" : reminderPeriod(daysLeft, settings);
      if (period) {
        add({
          itemType: "task",
          itemId: t.id,
          periodKey: period,
          severity: overdueNow ? "danger" : severityFor(daysLeft),
          title: overdueNow ? `Overdue task: ${t.title}` : `Task ${when(daysLeft)}: ${t.title}`,
          body: t.priority === "urgent" ? "Urgent" : null,
          href: "/priority-centre#tasks",
          companyId: t.company_id,
        });
      }
    }
    if (t.reminder_at && Date.parse(t.reminder_at) <= now) {
      add({ itemType: "task", itemId: t.id, periodKey: `reminder-${t.reminder_at}`, severity: "info", title: `Reminder: ${t.title}`, body: null, href: "/priority-centre#tasks", companyId: t.company_id });
    }
  }

  for (const a of input.otherApprovals) {
    active.add(`approval-other|${a.id}`);
    add({
      itemType: "approval-other",
      itemId: a.id,
      periodKey: "pending",
      severity: "info",
      title: `Approval waiting for review (${a.module})`,
      body: null,
      href: "/priority-centre#approvals",
      companyId: a.company_id,
    });
  }

  for (const e of input.events) {
    active.add(`event|${e.id}`);
    const daysLeft = daysBetween(today, e.event_date);
    const period = reminderPeriod(daysLeft, settings);
    if (period && daysLeft >= 0) {
      add({
        itemType: "event",
        itemId: e.id,
        periodKey: period,
        severity: daysLeft <= 1 ? "warning" : "info",
        title: `Event ${when(daysLeft)} and still ${e.status === "enquiry" ? "an enquiry" : "only quoted"}: ${e.event_name}`,
        body: "A decision is needed",
        href: `/catering/${e.id}`,
        companyId: e.company_id,
      });
    }
  }
  return { candidates: out, activeKeys: active };
}

export async function loadReminderSettings(supabase: DB, userId: string): Promise<{ settings: ReminderSettings; lastSyncedAt: string | null }> {
  const { data } = await supabase.from("priority_reminder_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return { settings: DEFAULT_REMINDER_SETTINGS, lastSyncedAt: null };
  return { settings: { daysBefore: data.days_before, remindAfterDeadline: data.remind_after_deadline }, lastSyncedAt: data.last_synced_at };
}

/**
 * Writes the reminders that are due as notifications of this person. The unique key (person, item, period) means the same
 * reminder is never created twice, however often this runs. Unread reminders of items that are no longer open are closed.
 */
export async function saveNotifications(supabase: DB, userId: string, built: { candidates: Candidate[]; activeKeys: Set<string> }) {
  if (built.candidates.length > 0) {
    const { error } = await supabase.from("priority_notifications").upsert(
      built.candidates.map((c) => ({
        user_id: userId,
        company_id: c.companyId,
        item_type: c.itemType,
        item_id: c.itemId,
        period_key: c.periodKey,
        severity: c.severity,
        title: c.title,
        body: c.body,
        href: c.href,
      })),
      { onConflict: "user_id,item_type,item_id,period_key", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  const { data: unread } = await supabase.from("priority_notifications").select("id, item_type, item_id").eq("user_id", userId).is("read_at", null).limit(500);
  const stale = (unread ?? []).filter((n) => ["payable", "ops", "approval", "task", "approval-other", "event"].includes(n.item_type) && !built.activeKeys.has(`${n.item_type}|${n.item_id}`)).map((n) => n.id);
  if (stale.length > 0) await supabase.from("priority_notifications").update({ read_at: new Date().toISOString() }).in("id", stale);
  await supabase.from("priority_reminder_settings").upsert({ user_id: userId, last_synced_at: new Date().toISOString() }, { onConflict: "user_id" });
}
