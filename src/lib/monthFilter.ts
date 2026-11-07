import { malaysiaDateOf } from "@/lib/format";

/** "2026-11" -> the first and the last day of that month, or null when it is not a month (so no filter). */
export function monthRange(month?: string | null): { start: string; end: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month ?? "");
  if (!m) return null;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}

/** "2026-11" -> "November 2026", or null when there is no valid month. */
export function monthLabelOf(month?: string | null): string | null {
  const range = monthRange(month);
  return range ? new Date(`${range.start}T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : null;
}

/**
 * Keeps the rows whose date falls in the month. A date-only value (YYYY-MM-DD) is compared as it is, a timestamp by its Malaysia calendar day.
 * Without a (valid) month every row stays. Use this for lists that are already loaded; filter in the query when the list is large.
 */
export function filterByMonth<T>(rows: T[], month: string | null | undefined, dateOf: (row: T) => string | null | undefined): T[] {
  const range = monthRange(month);
  if (!range) return rows;
  return rows.filter((row) => {
    const value = dateOf(row);
    if (!value) return false;
    const day = value.length > 10 ? malaysiaDateOf(value) : value;
    return day >= range.start && day <= range.end;
  });
}
