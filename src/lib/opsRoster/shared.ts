/** Daily Duty Roster (Driver & Operation): shared types and helpers, used on the server and in the browser. */

export type RosterStatus = "on_duty" | "off" | "leave" | "mc";

export type TimeSlot = { start: string; end: string; break_minutes: number; ot: boolean };

export type TaskType = "breakfast" | "lunch" | "dinner" | "delivery" | "setup" | "dismantle" | "prepare" | "other";

export type RosterTask = { type: TaskType; text: string; location: string; time: string };

export type RosterEntry = {
  staffId: string;
  status: RosterStatus;
  ot: boolean;
  otHoursOverride: number | null;
  note: string;
  slots: TimeSlot[];
  tasks: RosterTask[];
  /** set when loaded: when this line last changed */
  changedAt?: string | null;
};

export type RosterStaff = { id: string; employeeId: string; shortName: string; fullName: string; sortOrder: number; active: boolean; userLinked: boolean };

export type DayRoster = {
  id: string | null;
  date: string;
  remarks: string;
  version: number;
  updatedAt: string | null;
  updatedByName: string | null;
  entries: RosterEntry[];
};

export const STATUS: Record<RosterStatus, { label: string; chip: string; dot: string }> = {
  on_duty: { label: "ON DUTY", chip: "bg-emerald-100 text-emerald-800 border-emerald-300", dot: "bg-emerald-500" },
  off: { label: "OFF", chip: "bg-stone-200 text-stone-700 border-stone-300", dot: "bg-stone-400" },
  leave: { label: "LEAVE", chip: "bg-orange-100 text-orange-800 border-orange-300", dot: "bg-orange-500" },
  mc: { label: "MC", chip: "bg-red-100 text-red-800 border-red-300", dot: "bg-red-500" },
};
export const OT_CHIP = "bg-sky-100 text-sky-800 border-sky-300";

export const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "delivery", label: "Delivery" },
  { value: "setup", label: "Setup Event" },
  { value: "dismantle", label: "Dismantle Event" },
  { value: "prepare", label: "Prepare" },
  { value: "other", label: "Other" },
];
const TASK_LABEL = Object.fromEntries(TASK_TYPES.map((t) => [t.value, t.label])) as Record<TaskType, string>;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Wednesday, 25/11/2026" */
export function dayTitle(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
export function shortDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd].slice(0, 3)} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** The Monday of the week of the date. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

/** "5:00 AM" */
export function time12(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Hours of a slot, less its break; a slot that ends after midnight runs into the next day. */
export function slotHours(s: TimeSlot): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  if (!s.start || !s.end) return 0;
  let span = toMin(s.end) - toMin(s.start);
  if (span <= 0) span += 24 * 60;
  return Math.max(0, span - (s.break_minutes || 0)) / 60;
}

/** Worked hours, and OT hours: the admin's figure if set, else the hours of the slots marked OT. */
export function entryHours(e: RosterEntry): { worked: number; ot: number } {
  if (e.status !== "on_duty") return { worked: 0, ot: 0 };
  const worked = e.slots.reduce((sum, s) => sum + slotHours(s), 0);
  const fromSlots = e.slots.filter((s) => s.ot).reduce((sum, s) => sum + slotHours(s), 0);
  const ot = e.otHoursOverride !== null && e.otHoursOverride !== undefined ? Number(e.otHoursOverride) : fromSlots;
  return { worked: round2(worked), ot: round2(ot) };
}
const round2 = (n: number) => Math.round(n * 100) / 100;
export const hoursText = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")} h`;

export function hasOt(e: RosterEntry): boolean {
  return e.status === "on_duty" && (e.ot || e.slots.some((s) => s.ot) || (e.otHoursOverride ?? 0) > 0);
}

/** "5:00 AM – 7:00 AM | 11:00 AM – 5:00 PM + OT" */
export function slotsLine(e: RosterEntry): string {
  const slots = e.slots
    .filter((s) => s.start && s.end)
    .map((s) => `${time12(s.start)} – ${time12(s.end)}${s.break_minutes ? ` (break ${s.break_minutes} min)` : ""}`)
    .join(" | ");
  return `${slots}${hasOt(e) ? `${slots ? " " : ""}+ OT` : ""}`;
}

/** "Breakfast 3 & 4 – Rumah", "Setup Event – 4:00 PM" */
export function taskLine(t: RosterTask): string {
  const text = t.text.trim();
  const place = t.location.trim();
  // "Lunch UTM" when there are no details, "Breakfast 3 & 4 – Rumah" when there are
  const head = t.type === "other" ? text : text ? `${TASK_LABEL[t.type]} ${text}` : [TASK_LABEL[t.type], place].filter(Boolean).join(" ");
  return [head, text || t.type === "other" ? place : "", t.time ? time12(t.time) : ""].filter(Boolean).join(" – ");
}

/** The roster as a WhatsApp message: bold names (*NAME*), bullets, the hours, OT, tasks and remarks. */
export function whatsappText(day: DayRoster, staff: RosterStaff[]): string {
  const name = new Map(staff.map((s) => [s.id, s.shortName]));
  const lines: string[] = ["*JADUAL DRIVER & OPERATION*", `*${dayTitle(day.date)}*`, ""];
  for (const e of day.entries) {
    lines.push(`*${(name.get(e.staffId) ?? "").toUpperCase()}*`);
    if (e.status !== "on_duty") {
      lines.push(`• ${STATUS[e.status].label}`);
    } else {
      const hours = slotsLine(e);
      if (hours) lines.push(hours);
      for (const t of e.tasks) if (taskLine(t)) lines.push(`• ${taskLine(t)}`);
    }
    if (e.note.trim()) lines.push(`_${e.note.trim()}_`);
    lines.push("");
  }
  if (day.remarks.trim()) lines.push("*REMARKS:*", day.remarks.trim());
  return lines.join("\n").trim();
}

/** An empty line for a staff member (on duty, no hours yet). */
export function blankEntry(staffId: string): RosterEntry {
  return { staffId, status: "on_duty", ot: false, otHoursOverride: null, note: "", slots: [], tasks: [] };
}

/** What a line looks like, to compare two versions of it. */
export function entryKey(e: RosterEntry): string {
  return JSON.stringify([e.status, e.ot, e.otHoursOverride ?? null, e.note.trim(), e.slots, e.tasks]);
}
