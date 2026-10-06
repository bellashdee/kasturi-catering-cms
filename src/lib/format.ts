export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  })
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
