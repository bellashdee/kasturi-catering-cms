/** Kitchen Duty Roster: shared types and helpers (used on the server and in the browser). */

export type ShiftCode = {
  code: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
  is_work: boolean;
  color: string;
  sort_order: number;
};

export type RosterRow = {
  id?: string;
  employeeId: string | null;
  displayName: string;
  /** the shift code of each day: { "1": "N", "2": "OD" } */
  codes: Record<string, string>;
};

export type Roster = {
  id: string | null;
  companyId: string;
  kitchen: string;
  /** YYYY-MM */
  month: string;
  publicHolidays: number[];
  notes: string | null;
  preparedName: string | null;
  preparedAt: string | null;
  approvedName: string | null;
  approvedAt: string | null;
  rows: RosterRow[];
};

export const DEFAULT_KITCHEN = "KILANG 1";

/** The codes counted at the end of each row, like the ROD / RPH / AL columns of the Excel roster. */
export const SUMMARY_CODES = ["OD", "PH", "ROD", "RPH", "AL", "MC"] as const;

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

export function daysOfMonth(month: string): { day: number; weekday: string; weekend: boolean }[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const wd = new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay();
    return { day: i + 1, weekday: WEEKDAY[wd], weekend: wd === 0 };
  });
}

/** "SCHEDULE MONTH OF JUNE 2026" */
export function rosterTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `SCHEDULE MONTH OF ${MONTHS[m - 1]} ${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "9.00am – 6.00pm" from two times "09:00:00" / "18:00:00". */
export function shiftHours(c: Pick<ShiftCode, "start_time" | "end_time">): string {
  const fmt = (t: string) => {
    const [hh, mm] = t.split(":").map(Number);
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}.${String(mm).padStart(2, "0")}${hh < 12 ? "am" : "pm"}`;
  };
  return c.start_time && c.end_time ? `${fmt(c.start_time)} – ${fmt(c.end_time)}` : "";
}

/** The colour of a code on the roster (kept in the database as a simple word). */
export const CODE_COLORS: Record<string, string> = {
  blue: "bg-sky-100 text-sky-900",
  violet: "bg-violet-100 text-violet-900",
  teal: "bg-teal-100 text-teal-900",
  green: "bg-emerald-100 text-emerald-900",
  gray: "bg-stone-200 text-stone-800",
  red: "bg-red-100 text-red-800",
  orange: "bg-orange-100 text-orange-900",
  amber: "bg-amber-100 text-amber-900",
  pink: "bg-pink-100 text-pink-900",
  neutral: "bg-surface-alt text-text",
};
