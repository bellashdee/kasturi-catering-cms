/** Monthly OT rules, shared by the form (live preview), the server actions and the dashboard. */

/** Total OT hours a staff member may do in a calendar month before OT needs Manager Approval. */
export const OT_MONTHLY_LIMIT = 104;
/** From this many hours the staff member is shown as approaching the limit. */
export const OT_WARNING_FROM = 80;

export type OtStatus = "draft" | "submitted" | "pending_approval" | "approved" | "rejected" | "cancelled";

export const OT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const OT_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  draft: "neutral",
  submitted: "info",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/** Records in these statuses count towards the monthly total (pending / rejected / cancelled / draft do not). */
export const OT_COUNTED_STATUSES: OtStatus[] = ["submitted", "approved"];

/** Statuses a manager can still decide on. */
export const OT_DECIDABLE_STATUSES: OtStatus[] = ["submitted", "pending_approval"];

/** Hours that count for a record: the manager's approved hours when set, otherwise the calculated hours. */
export function countedOtHours(record: { status: string; hours: number | string; approved_hours: number | string | null }): number {
  if (!OT_COUNTED_STATUSES.includes(record.status as OtStatus)) return 0;
  return Number(record.approved_hours ?? record.hours);
}

function toMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** End time earlier than start time means the OT ran past midnight. Returns null for missing, invalid or zero-length times. */
export function calcOtHours(start: string, end: string): number | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null || s === e) return null;
  const minutes = e > s ? e - s : e + 1440 - s;
  return Math.round((minutes / 60) * 100) / 100;
}

/** [start, end] in minutes from midnight of the OT date; an interval past midnight ends after 1440. */
export function otInterval(start: string, end: string): [number, number] | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null || s === e) return null;
  return [s, e > s ? e : e + 1440];
}

export type OtLevel = "normal" | "near" | "limit";

export function otLevel(totalHours: number): OtLevel {
  if (totalHours >= OT_MONTHLY_LIMIT) return "limit";
  if (totalHours >= OT_WARNING_FROM) return "near";
  return "normal";
}

export const OT_LEVEL_LABEL: Record<OtLevel, string> = {
  normal: "🟢 Normal",
  near: "🟡 Near Limit",
  limit: "🔴 Approval Required",
};

export const OT_LEVEL_TONE: Record<OtLevel, "success" | "warning" | "danger"> = {
  normal: "success",
  near: "warning",
  limit: "danger",
};

export function formatHours(hours: number): string {
  return `${Math.round(hours * 100) / 100} hrs`;
}
