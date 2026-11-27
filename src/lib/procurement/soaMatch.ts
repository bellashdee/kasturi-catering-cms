/**
 * Matching a supplier's Statement of Account (an external statement) with our own records of the same company and supplier.
 *
 * Rules:
 *  - exact first: the same document number (ignoring spaces, dashes, slashes, capitals) and the same amount;
 *  - the same number with another amount is an AMOUNT MISMATCH (linked, never changed);
 *  - anything looser (a number that only looks alike, or the same amount on about the same date) is only a SUGGESTION that a person
 *    confirms; nothing is ever matched on the amount alone;
 *  - the statement never creates or changes our records.
 *
 * Pure functions only (no database): used by the server actions and checked by scripts/test-soa-match.
 */

export type SoaLineType = "opening" | "invoice" | "payment" | "credit_note" | "debit_note" | "other";
export type SoaLineStatus = "matched" | "missing_in_ours" | "missing_in_soa" | "amount_mismatch" | "payment_not_reflected" | "duplicate" | "unmatched";

export type SoaLineInput = {
  lineNo: number;
  date: string | null;
  dateText: string | null;
  type: SoaLineType;
  reference: string | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  /** signed: + raises what we owe, - lowers it */
  amount: number;
  balance: number | null;
  page: string | null;
};

export type OurRecordKind = "invoice" | "debit_note" | "credit_note" | "payment";
export type OurRecord = {
  table: "supplier_invoices" | "supplier_notes" | "finance_payments" | "supplier_payments";
  id: string;
  kind: OurRecordKind;
  ref: string;
  /** other numbers the supplier may print for it: the AutoCount no., the PV no., the bank reference, the invoice paid */
  altRefs: string[];
  date: string;
  /** always positive */
  amount: number;
  inPeriod: boolean;
};

export type Suggestion = { table: OurRecord["table"]; id: string; ref: string; date: string; amount: number; reason: string; score: number };

export type LineMatch = {
  status: SoaLineStatus;
  method: "exact" | "fuzzy" | "manual" | null;
  record: OurRecord | null;
  suggestions: Suggestion[];
  likelyCause: string | null;
};

export type OursLeft = { record: OurRecord; status: "missing_in_soa" | "payment_not_reflected"; likelyCause: string | null };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sameAmount = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) < 0.005;

/** "INV-0012 / A" → "INV0012A" */
export const refKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** the digits of a number without leading zeros, when it has at least 3 ("IV-000123" and "123" → "123") */
export const digitKey = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length >= 3 ? d : "";
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12, MEI: 5, OGOS: 8, OKT: 10, DIS: 12 };

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * A date as suppliers print it: 2026-11-05, 05/11/2026, 5-11-26, 05.11.2026, 5 Nov 2026, Nov 5, 2026, 05-NOV-26, or an Excel day number.
 * Numbers only are read day first (Malaysian statements), unless the first number cannot be a day.
 */
export function parseSoaDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && value > 30000 && value < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return dt.toISOString().slice(0, 10);
  }
  const s = String(value).trim().toUpperCase();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})\b/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    return a > 12 || b <= 12 ? iso(+m[3], b, a) : iso(+m[3], a, b);
  }
  m = s.match(/^(\d{1,2})[-/.\s]*([A-Z]{3,4})[A-Z]*[-/.,\s]*(\d{2,4})\b/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  m = s.match(/^([A-Z]{3,4})[A-Z]*[-/.\s]*(\d{1,2}),?[-/.\s]*(\d{2,4})\b/);
  if (m && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

/** "1,234.50", "RM 1 234.50", "(120.00)", "120.00 CR", "-120" → a number (null when there is no number). */
export function parseSoaAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? r2(value) : null;
  let s = String(value).trim().toUpperCase();
  if (!/\d/.test(s)) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /\bCR\b$/.test(s) || /-$/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  // 1.234,50 (comma decimals) vs 1,234.50
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return r2(negative ? -n : n);
}

const TYPE_WORDS: [RegExp, SoaLineType][] = [
  [/opening|b\/?f|brought\s*forward|balance\s*b\/d|baki\s*(awal|dibawa)/i, "opening"],
  [/credit\s*note|\bCN\b|return|rebate|nota\s*kredit/i, "credit_note"],
  [/debit\s*note|\bDN\b|nota\s*debit/i, "debit_note"],
  [/payment|paid|receipt|\bOR\b|\bPV\b|cheque|chq|bank|transfer|ibg|duitnow|giro|bayaran|resit|contra|knock/i, "payment"],
  [/invoice|\bINV\b|\bIV\b|\bSI\b|bill|sales|invois|\bDO\b/i, "invoice"],
];

/** The kind of a statement line from what the AI reader said, its wording, then its columns (on a supplier's statement an invoice is a debit). */
export function classifyLine(given: string | null | undefined, text: string, debit: number | null, credit: number | null): SoaLineType {
  const g = (given ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (["opening", "invoice", "payment", "credit_note", "debit_note"].includes(g)) return g as SoaLineType;
  for (const [re, t] of TYPE_WORDS) if (re.test(text)) return t;
  if ((debit ?? 0) > 0 && !(credit ?? 0)) return "invoice";
  if ((credit ?? 0) > 0 && !(debit ?? 0)) return "payment";
  return "other";
}

/** The signed amount of a line: + raises what we owe (invoice, debit note), - lowers it (payment, credit note). */
export function signedAmount(type: SoaLineType, debit: number | null, credit: number | null, amount: number | null): number {
  const raw = amount ?? ((debit ?? 0) - (credit ?? 0) || (debit ?? credit ?? 0));
  const abs = Math.abs(raw);
  if (type === "invoice" || type === "debit_note") return r2(abs);
  if (type === "payment" || type === "credit_note") return r2(-abs);
  return r2(raw);
}

const KIND_FOR: Record<SoaLineType, OurRecordKind[]> = {
  invoice: ["invoice", "debit_note"],
  debit_note: ["debit_note", "invoice"],
  credit_note: ["credit_note"],
  payment: ["payment"],
  opening: [],
  other: ["invoice", "debit_note", "credit_note", "payment"],
};

function refsOf(r: OurRecord): string[] {
  return [r.ref, ...r.altRefs].filter((x) => refKey(x).length > 0);
}

function refEquals(line: SoaLineInput, r: OurRecord): boolean {
  const k = refKey(line.reference);
  if (!k) return false;
  return refsOf(r).some((x) => refKey(x) === k);
}

/** Why a number looks like ours without being the same: the same digits, one is the end of the other, or one or two characters apart. */
function refLooksAlike(line: SoaLineInput, r: OurRecord): string | null {
  const k = refKey(line.reference);
  const d = digitKey(line.reference);
  if (!k) return null;
  for (const x of refsOf(r)) {
    const xk = refKey(x);
    const xd = digitKey(x);
    if (d && xd && d === xd) return `same number ${d} written differently (${line.reference} / ${x})`;
    if (k.length >= 4 && xk.length >= 4 && (k.endsWith(xk) || xk.endsWith(k))) return `one number ends with the other (${line.reference} / ${x})`;
    if (k.length >= 5 && xk.length >= 5 && levenshtein(k, xk) <= 2) return `numbers nearly the same (${line.reference} / ${x})`;
  }
  return null;
}

export type MatchInput = { lines: SoaLineInput[]; ours: OurRecord[]; periodStart: string; periodEnd: string };
export type MatchOutput = { lines: LineMatch[]; oursLeft: OursLeft[] };

export function matchStatement({ lines, ours, periodStart, periodEnd }: MatchInput): MatchOutput {
  const used = new Map<string, number>(); // record id → index of the line it is matched to
  const result: LineMatch[] = lines.map(() => ({ status: "unmatched", method: null, record: null, suggestions: [], likelyCause: null }));

  // duplicates printed on the statement itself: the same kind, number and amount more than once
  const seen = new Map<string, number>();
  lines.forEach((l, i) => {
    if (l.type === "opening" || !refKey(l.reference)) return;
    const key = `${l.type}|${refKey(l.reference)}|${Math.abs(l.amount).toFixed(2)}`;
    if (seen.has(key)) {
      result[i] = { status: "duplicate", method: null, record: null, suggestions: [], likelyCause: `Printed twice on the statement (also line ${lines[seen.get(key)!].lineNo}).` };
    } else seen.set(key, i);
  });

  // pass 1: exact (same number + same amount), then the same number with another amount
  lines.forEach((l, i) => {
    if (result[i].status === "duplicate" || l.type === "opening") return;
    const kinds = KIND_FOR[l.type];
    const candidates = ours.filter((r) => kinds.includes(r.kind) && refEquals(l, r));
    if (candidates.length === 0) return;
    const exact = candidates.find((r) => sameAmount(r.amount, l.amount) && !used.has(r.id)) ?? null;
    if (exact) {
      used.set(exact.id, i);
      result[i] = { status: "matched", method: "exact", record: exact, suggestions: [], likelyCause: null };
      return;
    }
    const takenExact = candidates.find((r) => sameAmount(r.amount, l.amount));
    if (takenExact) {
      result[i] = { status: "duplicate", method: null, record: takenExact, suggestions: [], likelyCause: `Our record ${takenExact.ref} is already matched to line ${lines[used.get(takenExact.id)!].lineNo}.` };
      return;
    }
    const other = candidates.find((r) => !used.has(r.id)) ?? candidates[0];
    if (!used.has(other.id)) used.set(other.id, i);
    const diff = r2(Math.abs(l.amount) - other.amount);
    result[i] = {
      status: "amount_mismatch",
      method: "exact",
      record: other,
      suggestions: [],
      likelyCause: `Same number, amount differs by RM ${Math.abs(diff).toFixed(2)} (supplier RM ${Math.abs(l.amount).toFixed(2)}, ours RM ${other.amount.toFixed(2)}): price change, a credit / debit note not keyed in, or a keying error.`,
    };
  });

  // pass 2: suggestions for what is left; never matched without a person confirming
  lines.forEach((l, i) => {
    if (result[i].status !== "unmatched" || l.type === "opening") return;
    if (l.type === "other" && Math.abs(l.amount) < 0.005) return;
    const kinds = KIND_FOR[l.type];
    const suggestions: Suggestion[] = [];
    for (const r of ours) {
      if (!kinds.includes(r.kind) || used.has(r.id)) continue;
      const alike = refLooksAlike(l, r);
      const amountSame = sameAmount(r.amount, l.amount);
      const near = l.date ? dayDiff(l.date, r.date) : 99;
      const window = r.kind === "payment" ? 7 : 3;
      if (alike && amountSame) suggestions.push({ table: r.table, id: r.id, ref: r.ref, date: r.date, amount: r.amount, reason: `${alike}, same amount`, score: 90 - Math.min(near, 30) });
      // invoice numbers run in sequence, so "nearly the same" alone is noise: it is suggested only with the same amount (above)
      else if (alike && !alike.startsWith("numbers nearly")) suggestions.push({ table: r.table, id: r.id, ref: r.ref, date: r.date, amount: r.amount, reason: `${alike}, amount differs`, score: 60 - Math.min(near, 30) });
      else if (amountSame && near <= window) suggestions.push({ table: r.table, id: r.id, ref: r.ref, date: r.date, amount: r.amount, reason: `same amount, ${near === 0 ? "same date" : `${near} day(s) apart`}, different number`, score: 50 - near });
    }
    suggestions.sort((a, b) => b.score - a.score);
    const outside = l.date && (l.date < periodStart || l.date > periodEnd);
    result[i] = {
      status: l.type === "other" ? "unmatched" : "missing_in_ours",
      method: null,
      record: null,
      suggestions: suggestions.slice(0, 3),
      likelyCause: suggestions.length
        ? "A possible match is suggested below: confirm it if it is the same document."
        : outside
          ? "Dated outside the period (cut-off): it may be in another month of our records."
          : l.type === "payment"
            ? "A payment the supplier shows that we have no record of: check the bank statement."
            : l.type === "other"
              ? "The kind of this line could not be read: check the statement."
              : "Not keyed in on our side yet (or keyed under another supplier / company).",
    };
  });

  const nearEnd = (d: string) => dayDiff(d, periodEnd) <= 5 && d <= periodEnd;
  const oursLeft: OursLeft[] = ours
    .filter((r) => r.inPeriod && !used.has(r.id))
    .map((r) =>
      r.kind === "payment"
        ? { record: r, status: "payment_not_reflected" as const, likelyCause: nearEnd(r.date) ? "Paid near the end of the period: payment in transit, the supplier may not have received it yet." : "Our payment is not on the supplier's statement: send the proof of payment to the supplier." }
        : { record: r, status: "missing_in_soa" as const, likelyCause: nearEnd(r.date) ? "Dated at the end of the period (cut-off): the supplier may show it next month." : "On our records but not on the supplier's statement: check the invoice copy with the supplier." },
    );

  return { lines: result, oursLeft };
}

export type BalanceSide = { opening: number; invoices: number; payments: number; creditNotes: number; debitNotes: number; closing: number };

/** The supplier's figures from the statement lines: the opening line (or the stated opening), the sums per kind and the closing (stated, else worked out). */
export function supplierBalances(lines: SoaLineInput[], stated: { opening: number | null; closing: number | null }): BalanceSide {
  const sum = (t: SoaLineType) => r2(lines.filter((l) => l.type === t).reduce((s, l) => s + Math.abs(l.amount), 0));
  const openingLine = lines.find((l) => l.type === "opening");
  const opening = stated.opening ?? (openingLine ? (openingLine.balance ?? openingLine.amount) : 0);
  const invoices = sum("invoice");
  const debitNotes = sum("debit_note");
  const creditNotes = sum("credit_note");
  const payments = sum("payment");
  const other = r2(lines.filter((l) => l.type === "other").reduce((s, l) => s + l.amount, 0));
  const worked = r2(opening + invoices + debitNotes - creditNotes - payments + other);
  // only the running balance printed on the LAST line is the closing balance (an earlier one, like the opening line's, is not)
  const last = lines.length > 0 ? lines[lines.length - 1] : null;
  const lastBalance = last && last.type !== "opening" ? last.balance : null;
  return { opening: r2(opening), invoices, payments, creditNotes, debitNotes, closing: r2(stated.closing ?? lastBalance ?? worked) };
}

export type DifferenceCause = { label: string; amount: number };

/** What explains the difference between the supplier's closing balance and ours (supplier − ours). */
export function explainDifference(
  supplier: BalanceSide,
  ours: BalanceSide,
  lines: { status: SoaLineStatus; amount: number; matchedAmount: number | null; outside: boolean }[],
  oursLeft: { status: string; amount: number; inTransit: boolean }[],
): { difference: number; causes: DifferenceCause[]; unexplained: number } {
  const difference = r2(supplier.closing - ours.closing);
  const causes: DifferenceCause[] = [];
  const push = (label: string, amount: number) => {
    if (Math.abs(amount) >= 0.005) causes.push({ label, amount: r2(amount) });
  };
  push("Opening balances differ", supplier.opening - ours.opening);
  const inPeriod = lines.filter((l) => !l.outside);
  push("On the supplier's SOA, not in our records", inPeriod.filter((l) => l.status === "missing_in_ours").reduce((s, l) => s + l.amount, 0));
  push("Cut-off: SOA lines dated outside the period", lines.filter((l) => l.outside && l.status === "missing_in_ours").reduce((s, l) => s + l.amount, 0));
  push(
    "Amount differences on the same documents",
    lines.filter((l) => l.status === "amount_mismatch" && l.matchedAmount !== null).reduce((s, l) => s + (l.amount - Math.sign(l.amount) * (l.matchedAmount ?? 0)), 0),
  );
  push("Printed twice on the supplier's SOA", lines.filter((l) => l.status === "duplicate").reduce((s, l) => s + l.amount, 0));
  // oursLeft amounts are signed effects on our balance (+ invoice / DN, - CN / payment): the supplier lacks them, so the difference is the opposite
  push("Our invoices / notes not on the supplier's SOA", -oursLeft.filter((o) => o.status === "missing_in_soa").reduce((s, o) => s + o.amount, 0));
  push("Payments in transit (paid near the period end, not on the SOA)", -oursLeft.filter((o) => o.status === "payment_not_reflected" && o.inTransit).reduce((s, o) => s + o.amount, 0));
  push("Our payments not reflected on the SOA", -oursLeft.filter((o) => o.status === "payment_not_reflected" && !o.inTransit).reduce((s, o) => s + o.amount, 0));
  const explained = r2(causes.reduce((s, c) => s + c.amount, 0));
  return { difference, causes, unexplained: r2(difference - explained) };
}
