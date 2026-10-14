export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace("MYR", "RM");
}

/** With sen, for unit prices such as a price per pax (RM 42.50) where rounding to whole ringgit would mislead. */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(amount)
    .replace("MYR", "RM");
}

/** All timestamps in the system are shown in Malaysia time, whatever the device or server timezone is. */
export const MALAYSIA_TIMEZONE = "Asia/Kuala_Lumpur";

function malaysiaParts(iso: string, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: MALAYSIA_TIMEZONE, ...options }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
}

/** e.g. "06/10/2026" */
export function formatMalaysiaDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = malaysiaParts(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${p.day}/${p.month}/${p.year}`;
}

/** e.g. "10:35 PM" */
export function formatMalaysiaTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = malaysiaParts(iso, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${p.hour}:${p.minute} ${p.dayPeriod?.toUpperCase()}`;
}

/** e.g. "06/10/2026, 10:35 PM" */
export function formatMalaysiaDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatMalaysiaDate(iso)}, ${formatMalaysiaTime(iso)}`;
}

/** The calendar date (YYYY-MM-DD) of a timestamp in Malaysia time. */
export function malaysiaDateOf(iso: string): string {
  const p = malaysiaParts(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Today's calendar date (YYYY-MM-DD) in Malaysia time, whatever timezone the device or server runs in. */
export function todayInMalaysia(now: Date | number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MALAYSIA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function clockParts(now: Date | number, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MALAYSIA_TIMEZONE, ...options }).formatToParts(now);
  return Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
}

/** e.g. "Thursday, 15 October 2026" (Malaysia time). */
export function formatMalaysiaLongDate(now: Date | number = Date.now()): string {
  const p = clockParts(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

/** e.g. "Thu, 15 Oct" (Malaysia time), for narrow screens. */
export function formatMalaysiaShortDate(now: Date | number = Date.now()): string {
  const p = clockParts(now, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday}, ${p.day} ${p.month}`;
}

/** e.g. "11:30:45 AM" (12-hour clock with seconds, Malaysia time). */
export function formatMalaysiaClock(now: Date | number = Date.now()): string {
  const p = clockParts(now, { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  return `${p.hour}:${p.minute}:${p.second} ${p.dayPeriod}`;
}

/** "1 October – 15 October 2026": the month-to-date range the dashboard figures cover (Malaysia time). */
export function monthToDateLabel(now: Date | number = Date.now()): string {
  const p = clockParts(now, { day: "numeric", month: "long", year: "numeric" });
  return `1 ${p.month} – ${p.day} ${p.month} ${p.year}`;
}

/** The calendar year and month (1-12) right now in Malaysia time: the default period of every report and form. */
export function malaysiaYearMonth(now: Date | number = Date.now()): { year: number; month: number } {
  const [year, month] = todayInMalaysia(now).split("-").map(Number);
  return { year, month };
}

/** A calendar date (YYYY-MM-DD) plus or minus whole days. Pure calendar arithmetic, so month ends and leap years are right. */
export function addDaysToDateIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week that contains a calendar date (YYYY-MM-DD). */
export function mondayOfWeekIso(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDaysToDateIso(iso, day === 0 ? -6 : 1 - day);
}

/**
 * The date a payment is recorded under: the date given, or today (Malaysia) when none is given. A payment cannot be dated in
 * the future, so "paid on" always means a payment that has really happened.
 */
export function confirmedPaymentDate(date: string | null | undefined): string {
  const today = todayInMalaysia();
  const value = date?.trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error("The payment date is not a valid date.");
  if (value > today) throw new Error("The payment date cannot be in the future.");
  return value;
}
