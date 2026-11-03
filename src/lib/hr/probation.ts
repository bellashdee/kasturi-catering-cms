// Probation tracking: dates, status, reading of an offer letter, and the wording of the letters.
// Pure functions only (no imports), so the same code runs on the server, in the browser and in a plain test script.

export type ProbationStatus = "on_probation" | "review_required" | "probation_extended" | "pending_confirmation" | "confirmed";

export const PROBATION_STATUS_LABEL: Record<ProbationStatus, string> = {
  on_probation: "On Probation",
  review_required: "Review Required",
  probation_extended: "Probation Extended",
  pending_confirmation: "Pending Confirmation",
  confirmed: "Confirmed",
};

export const CONFIRMATION_LETTER_LABEL: Record<string, string> = {
  none: "Not prepared",
  draft: "Draft",
  pending_approval: "Waiting for approval",
  approved: "Approved - ready to issue",
  issued: "Issued",
};

export const EVENT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Waiting for management approval",
  approved: "Approved",
  rejected: "Not approved",
  issued: "Issued",
};

/** Why management may extend a probation (HR picks one and adds notes). */
export const EXTENSION_REASONS: { value: string; label: string; wording: string }[] = [
  { value: "performance", label: "Poor work performance", wording: "your work performance has not yet reached the standard expected for your position" },
  { value: "tasks", label: "Repeated failure to complete assigned tasks", wording: "assigned tasks have not been completed as required" },
  { value: "attitude", label: "Poor work attitude or misconduct", wording: "matters concerning your work attitude and conduct need to be reviewed further" },
  { value: "attendance", label: "Repeated lateness or attendance issues", wording: "your punctuality and attendance have not yet met the Company's requirements" },
  { value: "requirements", label: "Does not yet meet the requirements of the position", wording: "you have not yet fully met the requirements of your position" },
  { value: "other", label: "Other (explain in the notes)", wording: "Management requires more time to assess your suitability for confirmation" },
];

export const reasonLabel = (value: string | null | undefined) => EXTENSION_REASONS.find((r) => r.value === value)?.label ?? value ?? "";

/** Days before the end of a probation when HR is reminded. */
export const REMINDER_DAYS = [30, 14, 7] as const;

// ---------- dates (calendar arithmetic on YYYY-MM-DD, no time zones involved) ----------

const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
}

/** A date plus whole months; a day that does not exist in the target month moves to its last day (31 Jan + 1 month = 28 Feb). */
export function addMonths(iso: string, months: number): string {
  const d = toUtc(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return isoOf(d);
}

/** The last day of a probation that starts on `start` and lasts `months`: the day before the same date `months` later (12 Apr + 3 months = 11 Jul). */
export function probationEndDate(start: string, months: number): string {
  return addDays(addMonths(start, months), -1);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso).getTime() - toUtc(fromIso).getTime()) / 86_400_000);
}

export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = toUtc(iso);
  const day = d.getUTCDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix} ${d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = toUtc(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

// ---------- status ----------

export type ProbationRow = {
  start_date: string | null;
  probation_months: number | null;
  current_end_date: string | null;
  needs_verification: boolean;
  is_confirmed: boolean;
};

/**
 * The status shown on the dashboard, worked out from the dates (never typed in, so it cannot be out of date):
 * confirmed, or missing details (HR must verify), or the probation has ended without a decision (pending confirmation),
 * or an approved extension is running (extended), or the last 30 days (review required), otherwise on probation.
 */
export function probationStatus(row: ProbationRow, hasApprovedExtension: boolean, today: string): ProbationStatus {
  if (row.is_confirmed) return "confirmed";
  if (row.needs_verification || !row.start_date || !row.current_end_date) return "review_required";
  if (today > row.current_end_date) return "pending_confirmation";
  if (hasApprovedExtension) return "probation_extended";
  if (daysBetween(today, row.current_end_date) <= REMINDER_DAYS[0]) return "review_required";
  return "on_probation";
}

/** Which reminder an HR admin sees today: 30, 14 or 7 (the smallest mark that is reached), or null when the end is further away or past. */
export function reminderMark(currentEnd: string | null, today: string): 30 | 14 | 7 | null {
  if (!currentEnd) return null;
  const left = daysBetween(today, currentEnd);
  if (left < 0) return null;
  if (left <= 7) return 7;
  if (left <= 14) return 14;
  if (left <= 30) return 30;
  return null;
}

// ---------- reading an offer letter ----------

export type OfferLetterData = {
  name: string | null;
  letterDate: string | null;
  startDate: string | null;
  position: string | null;
  months: number | null;
  /** things HR should look at before trusting the result */
  issues: string[];
};

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/** "12th April 2026", "1 Sept 2026", "12/04/2026" -> "2026-04-12" (null when it is not a real date). */
export function parseLetterDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.trim().replace(/[.,]$/, "");
  let day: number, month: number, year: number;
  let m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (m) {
    day = Number(m[1]);
    const idx = MONTH_NAMES.findIndex((n) => n === m![2].toLowerCase() || (m![2].length >= 3 && n.startsWith(m![2].toLowerCase())));
    if (idx < 0) return null;
    month = idx + 1;
    year = Number(m[3]);
  } else {
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!m) return null;
    day = Number(m[1]);
    month = Number(m[2]);
    year = Number(m[3]);
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const DATE_PATTERN = String.raw`\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4}`;

/**
 * Reads the date of the letter, the start date, the position and the probation period of an offer letter (the text of a
 * Word / PDF file, or its Markdown). Whatever cannot be found is left empty and listed in `issues`, so HR checks it.
 */
export function parseOfferLetter(raw: string): OfferLetterData {
  const text = raw.replace(/\*\*|__| /g, " ").replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const issues: string[] = [];

  const letterDate = parseLetterDate(text.match(new RegExp(String.raw`(?:^|\n)\s*Date\s*:?\s*(${DATE_PATTERN})`, "i"))?.[1]);

  const nameLine = text.split("\n").map((l) => l.trim()).filter(Boolean).find((l, i) => i < 6 && /PRIVATE\s*&\s*CONFIDENTIAL/i.test(l));
  let name = nameLine ? nameLine.replace(/PRIVATE\s*&\s*CONFIDENTIAL.*$/i, "").trim() : null;
  if (!name) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const at = lines.findIndex((l) => /PRIVATE\s*&\s*CONFIDENTIAL/i.test(l));
    if (at > 0) name = lines[at - 1].replace(/^Date\s*:.*$/i, "").trim() || null;
  }

  let startDate: string | null = null;
  let position: string | null = null;
  const commence = text.match(new RegExp(String.raw`employment\s+(?:will\s+)?commence(?:s|d)?\s+on\s+(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+)?(${DATE_PATTERN})\s*(?:as|,|\.)?\s*([^.\n]*)`, "i"));
  if (commence) {
    startDate = parseLetterDate(commence[1]);
    position = commence[2].replace(/\s+/g, " ").replace(/^(a|an|the)\s+/i, "").trim().replace(/[,;:]$/, "") || null;
  }
  if (!position) {
    const re = text.match(/RE\s*:\s*OFFER OF EMPLOYMENT\s*[^\w\n]*\s*([^\n]+)/i);
    if (re) position = re[1].replace(/\s+/g, " ").trim();
  }

  let months: number | null = null;
  const patterns = [
    /(?:(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*)?\(?\s*(\d{1,2})\s*\)?[\s-]*months?'?s?[\s-]*(?:of\s+)?probation/i,
    /probation(?:ary)?\s+(?:period|term)\s+of\s+(?:(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*)?\(?\s*(\d{1,2})\s*\)?[\s-]*months?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      months = Number(m[2]) || NUMBER_WORDS[(m[1] ?? "").toLowerCase()] || null;
      break;
    }
  }
  if (months === null) {
    const m = text.match(/probation(?:ary)?[^.\n]{0,60}?\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b[^.\n]{0,12}months?/i);
    if (m) months = NUMBER_WORDS[m[1].toLowerCase()] ?? null;
  }

  if (!name) issues.push("The employee name could not be read.");
  if (!startDate) issues.push("The start date could not be read.");
  if (!position) issues.push("The position could not be read.");
  if (months === null) issues.push("The probation period could not be found in this letter.");
  else if (months < 1 || months > 12) {
    issues.push("The probation period looks unusual (check it).");
  }
  return { name, letterDate, startDate, position, months: months !== null && months >= 1 && months <= 12 ? months : null, issues };
}

/** True when the words of the name in the letter are the words of the staff name (spelling differences are common, so this only warns). */
export function sameNameWords(a: string | null | undefined, b: string | null | undefined): boolean {
  const words = (s: string | null | undefined) =>
    (s ?? "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["BIN", "BINTI", "BT", "BTE", "ANAK"].includes(w));
  const x = words(a);
  const y = words(b);
  if (x.length === 0 || y.length === 0) return false;
  const common = x.filter((w) => y.includes(w)).length;
  return common >= Math.min(x.length, y.length) - (Math.min(x.length, y.length) >= 4 ? 1 : 0);
}

// ---------- letters ----------

export type LetterContext = {
  companyName: string;
  employeeName: string;
  position: string | null;
  startDate: string | null;
  months: number | null;
  offerLetterDate: string | null;
  today: string;
};

const SIGNATORY = { name: "Ismaizal bin Hj. Mohd. Ismail", title: "Director" };

const closing = (company: string) =>
  [
    "Sincerely yours,",
    "For and on Behalf of the Employer",
    "",
    "______________________________",
    SIGNATORY.name,
    SIGNATORY.title,
    company,
    "",
    "Acknowledgment of Receipt",
    "I have received and read this letter.",
    "Signature: ________________________",
    "Date: ________________________",
  ].join("\n");

const salutation = (name: string) => `Dear ${name.split(/\s+/)[0] ? name : "Sir/Madam"},`;

/** The draft of a Probation Extension Letter. HR can edit every word before it goes for approval. */
export function extensionLetterText(ctx: LetterContext, ev: { previousEnd: string; newEnd: string; reason: string }): string {
  const reason = EXTENSION_REASONS.find((r) => r.value === ev.reason);
  const position = ctx.position ? ctx.position.toUpperCase() : "YOUR POSITION";
  const periodOf = ctx.months ? `a probationary period of ${ctx.months} month${ctx.months === 1 ? "" : "s"}` : "a probationary period";
  return [
    `Date : ${formatLongDate(ctx.today)}`,
    "",
    ctx.employeeName.toUpperCase(),
    "PRIVATE & CONFIDENTIAL",
    "",
    salutation(ctx.employeeName),
    "",
    `RE: EXTENSION OF PROBATION PERIOD - ${position}`,
    "",
    `We refer to your offer of employment${ctx.offerLetterDate ? ` dated ${formatLongDate(ctx.offerLetterDate)}` : ""}, under which you were employed${ctx.position ? ` as ${ctx.position}` : ""} on ${periodOf}${ctx.startDate ? ` commencing on ${formatLongDate(ctx.startDate)}` : ""}. Your probation was due to end on ${formatLongDate(ev.previousEnd)}.`,
    "",
    `Following a review of your probation, Management has decided to extend your probation period until ${formatLongDate(ev.newEnd)}. ${reason ? `This is because ${reason.wording}.` : ""}`,
    "",
    "During the extended period your performance will continue to be monitored and you will be given the support and guidance needed to meet the expectations of your position. At the end of the extended period Management will review your probation again and you will be informed in writing of the outcome.",
    "",
    "All other terms and conditions of your employment remain unchanged. If you have any questions about this letter, please speak to the Human Resources department.",
    "",
    closing(ctx.companyName),
  ].join("\n");
}

/** The draft of a Confirmation Letter. HR can edit every word before it goes for approval. */
export function confirmationLetterText(ctx: LetterContext, ev: { effectiveDate: string }): string {
  const position = ctx.position ? ctx.position.toUpperCase() : "YOUR POSITION";
  return [
    `Date : ${formatLongDate(ctx.today)}`,
    "",
    ctx.employeeName.toUpperCase(),
    "PRIVATE & CONFIDENTIAL",
    "",
    salutation(ctx.employeeName),
    "",
    `RE: CONFIRMATION OF EMPLOYMENT - ${position}`,
    "",
    `We refer to your offer of employment${ctx.offerLetterDate ? ` dated ${formatLongDate(ctx.offerLetterDate)}` : ""}${ctx.startDate ? ` and your employment which commenced on ${formatLongDate(ctx.startDate)}` : ""}${ctx.position ? ` as ${ctx.position}` : ""}.`,
    "",
    `We are pleased to inform you that you have successfully completed your probationary period. Management has approved the confirmation of your employment as a permanent employee of ${ctx.companyName} with effect from ${formatLongDate(ev.effectiveDate)}.`,
    "",
    "All other terms and conditions of your employment as stated in your offer letter and the Company's policies remain unchanged. We thank you for your contribution so far and look forward to your continued service.",
    "",
    closing(ctx.companyName),
  ].join("\n");
}
