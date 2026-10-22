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

const BURMESE_WEEKDAYS = ["တနင်္ဂနွေနေ့", "တနင်္လာနေ့", "အင်္ဂါနေ့", "ဗုဒ္ဓဟူးနေ့", "ကြာသပတေးနေ့", "သောကြာနေ့", "စနေနေ့"];
const BURMESE_MONTHS = ["ဇန်နဝါရီ", "ဖေဖော်ဝါရီ", "မတ်", "ဧပြီ", "မေ", "ဇွန်", "ဇူလိုင်", "ဩဂုတ်", "စက်တင်ဘာ", "အောက်တိုဘာ", "နိုဝင်ဘာ", "ဒီဇင်ဘာ"];

/**
 * Some browsers have no date names for Burmese and would silently show English. For those the day and month names are written
 * here, so the date and clock still follow the chosen language (digits stay 0-9).
 */
function burmeseFallback(locale: string | undefined): boolean {
  return !!locale && locale.startsWith("my") && Intl.DateTimeFormat.supportedLocalesOf([locale.split("-u-")[0]]).length === 0;
}

function numericParts(now: Date | number) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: MALAYSIA_TIMEZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const v = Object.fromEntries(p.map((x) => [x.type, x.value])) as Record<string, string>;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v.weekday);
  return { year: v.year, month: Number(v.month), day: v.day, weekday, hour: Number(v.hour) % 24, minute: v.minute, second: v.second };
}

/** e.g. "Thursday, 15 October 2026" (Malaysia time). */
export function formatMalaysiaLongDate(now: Date | number = Date.now(), locale?: string): string {
  if (burmeseFallback(locale)) {
    const n = numericParts(now);
    return `${n.year} ခုနှစ်၊ ${BURMESE_MONTHS[n.month - 1]}လ ${n.day} ရက်၊ ${BURMESE_WEEKDAYS[n.weekday]}`;
  }
  if (locale && !locale.startsWith("en")) return new Intl.DateTimeFormat(locale, { timeZone: MALAYSIA_TIMEZONE, dateStyle: "full" }).format(now);
  const p = clockParts(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

/** e.g. "Thu, 15 Oct" (Malaysia time), for narrow screens. */
export function formatMalaysiaShortDate(now: Date | number = Date.now(), locale?: string): string {
  if (burmeseFallback(locale)) {
    const n = numericParts(now);
    return `${BURMESE_WEEKDAYS[n.weekday].replace("နေ့", "")}၊ ${n.day} ${BURMESE_MONTHS[n.month - 1]}`;
  }
  if (locale && !locale.startsWith("en")) return new Intl.DateTimeFormat(locale, { timeZone: MALAYSIA_TIMEZONE, weekday: "short", day: "numeric", month: "short" }).format(now);
  const p = clockParts(now, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday}, ${p.day} ${p.month}`;
}

/** e.g. "11:30:45 AM" (12-hour clock with seconds, Malaysia time). */
export function formatMalaysiaClock(now: Date | number = Date.now(), locale?: string): string {
  if (burmeseFallback(locale)) {
    const n = numericParts(now);
    const period = n.hour < 12 ? "နံနက်" : n.hour < 17 ? "နေ့လည်" : n.hour < 20 ? "ညနေ" : "ည";
    return `${period} ${n.hour % 12 === 0 ? 12 : n.hour % 12}:${n.minute}:${n.second}`;
  }
  if (locale && !locale.startsWith("en")) return new Intl.DateTimeFormat(locale, { timeZone: MALAYSIA_TIMEZONE, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(now);
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

/** A price per unit (per G, per piece ...): RM 2.50 for normal prices, up to 4 decimals for small ones (RM 0.0035). */
export function formatUnitPrice(amount: number): string {
  if (!Number.isFinite(amount)) return "RM 0.00";
  const decimals = amount >= 1 || amount === 0 ? 2 : amount >= 0.1 ? 3 : 4;
  return `RM ${amount.toFixed(decimals)}`;
}

/** A timestamp as the value of a datetime-local input, in Malaysia time: "2026-10-22T15:50". */
export function toMalaysiaInputValue(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: MALAYSIA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const v = Object.fromEntries(p.map((x) => [x.type, x.value])) as Record<string, string>;
  return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
}

/** The value of a datetime-local input (Malaysia time) as an ISO timestamp; null when it is not a valid date and time. */
export function fromMalaysiaInputValue(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
