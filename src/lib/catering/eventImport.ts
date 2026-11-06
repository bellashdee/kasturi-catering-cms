import { EVENT_TYPE_OPTIONS, MEAL_TYPE_LABEL, SALES_AGENTS, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";

/**
 * Importing confirmed events from the office's Excel file or PDF event list. The columns are found by their header, in any order and with
 * the usual spellings; a value that cannot be read is reported, never guessed. The browser reads the file, the server checks every row again.
 */

export type ImportField =
  | "eventReference"
  | "customerName"
  | "eventName"
  | "eventDate"
  | "startTime"
  | "endTime"
  | "venue"
  | "eventAddress"
  | "pax"
  | "mealTypes"
  | "serviceType"
  | "menu"
  | "salesAgent"
  | "autocountQuotationNo"
  | "autocountInvoiceNo"
  | "status"
  | "eventType"
  | "remarks"
  | "revenue"
  | "companyCode";

/** The columns, in the order of the preview table, with the header words each one is found by (lower case, no punctuation). */
export const IMPORT_FIELDS: { key: ImportField; label: string; headers: string[]; required?: boolean }[] = [
  { key: "eventReference", label: "Event ID", headers: ["event id", "eventid", "event ref", "event reference", "reference", "ref no", "event no", "event number", "id"] },
  { key: "customerName", label: "Customer / company", headers: ["customer", "customer name", "company", "company name", "customer company name", "client", "client name", "pelanggan", "nama pelanggan", "syarikat"] },
  { key: "eventName", label: "Event name", headers: ["event name", "name of event", "event", "event title", "nama acara", "nama majlis", "majlis", "acara"], required: true },
  { key: "eventDate", label: "Event date", headers: ["event date", "date of event", "date", "tarikh", "tarikh acara", "tarikh majlis"], required: true },
  { key: "startTime", label: "Start time", headers: ["event start time", "start time", "start", "time", "event time", "masa", "masa mula"] },
  { key: "endTime", label: "End time", headers: ["event end time", "end time", "end", "finish time", "masa tamat"] },
  { key: "venue", label: "Venue", headers: ["venue", "location", "event venue", "tempat", "lokasi"] },
  { key: "eventAddress", label: "Event address", headers: ["event address", "address", "venue address", "alamat", "alamat acara"] },
  { key: "pax", label: "Pax", headers: ["number of pax", "no of pax", "pax", "total pax", "guests", "bilangan pax", "jumlah pax", "qty pax"] },
  { key: "mealTypes", label: "Meal type", headers: ["meal type", "meal", "meals", "meal session", "jenis hidangan", "sesi makan"] },
  { key: "serviceType", label: "Service type", headers: ["catering service type", "service type", "service", "serving type", "type of serving", "serving", "jenis perkhidmatan"] },
  { key: "menu", label: "Confirmed menu", headers: ["confirmed menu", "menu", "menu details", "menu items", "butiran menu"] },
  { key: "salesAgent", label: "Sales agent", headers: ["sales agent", "agent", "salesperson", "sales person", "ejen"] },
  { key: "autocountQuotationNo", label: "AutoCount quotation no.", headers: ["autocount quotation number", "autocount quotation no", "autocount quotation", "quotation number", "quotation no", "quotation", "qt no", "quote no"] },
  { key: "autocountInvoiceNo", label: "AutoCount invoice no.", headers: ["autocount invoice number", "autocount invoice no", "autocount invoice", "invoice number", "invoice no", "invoice", "inv no"] },
  { key: "status", label: "Event status", headers: ["event status", "status"] },
  { key: "eventType", label: "Event type", headers: ["event type", "type", "jenis acara", "jenis majlis"] },
  { key: "remarks", label: "Remarks", headers: ["event remarks", "remarks", "remark", "notes", "note", "catatan"] },
  { key: "revenue", label: "Revenue (RM)", headers: ["revenue", "revenue rm", "event revenue", "amount", "amount rm", "total amount", "sales", "jumlah rm"] },
  { key: "companyCode", label: "Company code (K / SSC)", headers: ["com", "co", "comp", "company code"] },
];

export type ImportRow = Record<ImportField, string>;
export const emptyImportRow = (): ImportRow => Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, ""])) as ImportRow;

export const MAX_IMPORT_ROWS = 500;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which field a header names ("" when none): an exact header word first, then the longest one it contains. */
export function fieldOfHeader(header: string): ImportField | "" {
  const h = norm(header);
  if (!h) return "";
  for (const f of IMPORT_FIELDS) if (f.headers.includes(h)) return f.key;
  let best: { key: ImportField; len: number } | null = null;
  for (const f of IMPORT_FIELDS) {
    for (const word of f.headers) {
      if (word.length > 3 && h.includes(word) && (!best || word.length > best.len)) best = { key: f.key, len: word.length };
    }
  }
  return best?.key ?? "";
}

/** The header row of a sheet: the first of the first 15 rows that names at least three fields. */
export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const found = new Set(rows[i].map((c) => fieldOfHeader(String(c ?? ""))).filter(Boolean));
    if (found.size >= 3) return i;
  }
  return -1;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A cell as text: a date cell (a JavaScript date) becomes YYYY-MM-DD, or HH:MM when it only holds a time. */
export function cellText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // a time-only cell is a date on 30/31 December 1899
    if (value.getFullYear() < 1901) return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogo: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
};

const validDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/**
 * "2026-11-04", "4/11/2026" (day first, as in Malaysia), "4 Nov 2026" or an Excel day number → YYYY-MM-DD; null when it is not a date.
 * A date written without a year ("1-Nov", "1/11") only counts when the year is given (the one the user chose for the file).
 */
export function parseDate(text: string, year?: number): string | null {
  const s = text.trim();
  if (!s) return null;
  if (year) {
    const short = /^(\d{1,2})\s*[- ]\s*([a-z]{3})[a-z]*\.?$/i.exec(s);
    if (short && MONTHS[short[2].toLowerCase()]) return validDate(year, MONTHS[short[2].toLowerCase()], +short[1]);
    const numeric = /^(\d{1,2})[/.](\d{1,2})$/.exec(s);
    if (numeric) return validDate(year, +numeric[2], +numeric[1]);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})\s*[- ]\s*([a-z]{3})[a-z]*\.?\s*[- ]\s*(\d{4})$/i.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return validDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // an Excel day number (days since 30 December 1899)
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  return null;
}

/** "16:30", "4:30 PM", "4.30pm", "1630" or an Excel fraction of a day → HH:MM; null when it is not a time. */
export function parseTime(text: string): string | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (/^0?\.\d+$/.test(s)) {
    const minutes = Math.round(Number(s) * 24 * 60);
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  }
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?(am|pm|a\.m\.|p\.m\.)?$/.exec(s) ?? /^(\d{2})(\d{2})(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.replace(/\./g, "");
  if (min > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
  } else if (h > 23 || (!m[2] && h < 7)) {
    // a bare "3" is not clearly a time
    return null;
  }
  return `${pad(h)}:${pad(min)}`;
}

const byLabel = (labels: Record<string, string>) => {
  const map = new Map<string, string>();
  for (const [key, label] of Object.entries(labels)) {
    map.set(norm(label), key);
    map.set(norm(key), key);
  }
  return map;
};
const MEALS = byLabel(MEAL_TYPE_LABEL);
const SERVICES = byLabel({ ...SERVICE_TYPE_LABEL, pack_food: "Packed Food", pre_plated: "Plated Meal" });
const EVENT_TYPES = byLabel(Object.fromEntries(EVENT_TYPE_OPTIONS));

/** "Lunch, Hi-Tea" → ["lunch", "hi_tea"]; the words that are not a meal type are returned apart. */
export function parseMealTypes(text: string): { keys: string[]; unknown: string[] } {
  const parts = text.split(/[,;/&+\n]| and | dan /i).map((p) => p.trim()).filter(Boolean);
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const p of parts) {
    const k = MEALS.get(norm(p));
    if (k) {
      if (!keys.includes(k)) keys.push(k);
    } else unknown.push(p);
  }
  return { keys, unknown };
}

/** The short forms of the office's event lists: B = Buffet, P = Pack food, PP = Preplated, D = Dome set, BP = Buffet pack, C = Canapé. */
const SERVICE_CODES: Record<string, string> = { b: "buffet", p: "pack_food", pp: "pre_plated", d: "dome_set", bp: "buffet_pack", c: "cocktail_canape", h: "hidang" };

export const parseServiceType = (text: string): string | null => (text.trim() ? SERVICES.get(norm(text)) ?? SERVICE_CODES[norm(text)] ?? null : null);

/** "B & D", "Buffet / Dome Set" → the first service type, the others (kept as a note: the pax of each is not given) and the words not known. */
export function parseServiceTypes(text: string): { key: string | null; others: string[]; unknown: string[] } {
  const parts = text.split(/[&,/+]| and | dan /i).map((p) => p.trim()).filter(Boolean);
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const p of parts) {
    const k = parseServiceType(p);
    if (k) {
      if (!keys.includes(k)) keys.push(k);
    } else unknown.push(p);
  }
  return { key: keys[0] ?? null, others: keys.slice(1).map((k) => SERVICE_TYPE_LABEL[k] ?? k), unknown };
}

/** "16,860.00", "1 6,860.00" (a PDF can split the digits), "RM 1,200" → 16860; "-" or empty → null; "invalid" when it is not an amount. */
export function parseRevenue(text: string): number | null | "invalid" {
  const s = text.replace(/rm/i, "").replace(/[\s,]/g, "");
  if (!s || /^-+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 100000000 ? Math.round(n * 100) / 100 : "invalid";
}

/** Which company a "Com" code of the event list means: K = Kasturi Indah, SSC / SS = Signature Solution, O2 = O2 Life. */
export function companyOfCode(code: string): string | null {
  const c = norm(code).replace(/\s+/g, "");
  if (!c) return null;
  if (c === "k" || c.startsWith("kasturi")) return "Kasturi Indah";
  if (c === "ssc" || c === "ss" || c.startsWith("signature")) return "Signature Solution";
  if (c === "o2" || c.startsWith("o2life")) return "O2 Life";
  return null;
}
export const parseEventType = (text: string): string | null => (text.trim() ? EVENT_TYPES.get(norm(text)) ?? null : null);

/** "Fadilah" or "MS. FADILAH" → "Ms. Fadilah" (the name as in the sales agent list); null when it is no one on the list. */
export function parseSalesAgent(text: string): string | null {
  const n = norm(text).replace(/^(ms|mr|mrs|miss|cik|puan|encik|en|pn)\s+/, "");
  if (!n) return null;
  return SALES_AGENTS.find((a) => norm(a).replace(/^(ms|mr|mrs)\s+/, "") === n) ?? null;
}

/** The statuses an imported (confirmed) event can have, by the words the Excel file may use. */
const STATUSES: Record<string, string> = {
  confirmed: "confirmed",
  confirm: "confirmed",
  preparation: "in_production",
  "in preparation": "in_production",
  "in production": "in_production",
  "in progress": "delivered",
  ongoing: "delivered",
  delivered: "delivered",
  completed: "completed",
  complete: "completed",
  done: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  cancel: "cancelled",
};
/** A blank status is Confirmed (the file is the list of confirmed events); null when the word is not a status. */
export const parseStatus = (text: string): string | null => (text.trim() ? STATUSES[norm(text)] ?? null : "confirmed");

export const parsePax = (text: string): number | null => {
  const s = text.replace(/[,\s]/g, "").replace(/pax$/i, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : null;
};

/** What the import does with a row. */
export type ImportAction = "create" | "update" | "skip";

/** A row after the server checked it against the events already saved. */
export type CheckedRow = {
  row: ImportRow;
  /** new: no such event yet; update: the Event ID is an existing event; duplicate: probably an event already saved; error: cannot be imported */
  kind: "new" | "update" | "duplicate" | "error";
  /** what the import does unless the user picks something else */
  action: ImportAction;
  errors: string[];
  warnings: string[];
  /** the existing event (an update, or the likely duplicate) */
  match: { id: string; reference: string | null; name: string; date: string; customer: string | null } | null;
  /** for an update: the values that would change */
  changes: { field: string; from: string; to: string }[];
  customerIsNew: boolean;
};

/** What the import history keeps of one row. */
export type ImportDetail = {
  line: number;
  action: ImportAction | "error";
  eventId?: string;
  reference?: string | null;
  name: string;
  date: string;
  changes?: { field: string; from: string; to: string }[];
  message?: string;
};
