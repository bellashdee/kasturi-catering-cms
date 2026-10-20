/**
 * The date of birth written in a Malaysian IC number (YYMMDD-PB-###G): a two-digit year up to the current year is 20xx, a larger
 * one is 19xx. Returns null when the number is not an IC number or the date does not exist (a passport number has no date of birth).
 */
export function dobFromIc(ic: string | null | undefined, today: Date = new Date()): string | null {
  const m = (ic ?? "").trim().match(/^(\d{2})(\d{2})(\d{2})-?\d{2}-?\d{4}$/);
  if (!m) return null;
  const yy = Number(m[1]);
  const year = yy <= today.getFullYear() % 100 ? 2000 + yy : 1900 + yy;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const GENDER_OPTIONS = ["Male", "Female"] as const;
export const MARITAL_STATUS_OPTIONS = ["Single", "Married", "Divorced", "Widowed"] as const;
