import * as XLSX from "xlsx";
import { todayInMalaysia } from "@/lib/format";

/**
 * Reads the Excel file that the FeedMe portal gives (Report > Overview > Download > Excel). The file is untrusted: only the "Daily Sales"
 * sheet and the "Merchant:" line are read, every cell is checked, and nothing in it can run. Money is taken exactly as the file gives it
 * (the discount is negative); a value with more than 2 decimals is refused, never rounded.
 */
export const FEEDME_MERCHANT = "Restoran Bara Ikan Bakar";
export const FEEDME_SOURCE = "feedme_overview";
export const MAX_FILE_BYTES = 900_000;
const MAX_DAYS = 800;

export type FeedMeDay = {
  date: string; // YYYY-MM-DD
  outlet: string;
  bills: number;
  pax: number | null;
  gross: number;
  discount: number; // negative or zero, as in the file
  serviceCharge: number;
  sst: number;
  deliveryFee: number;
  rounding: number;
  nett: number;
  /** why this day cannot be imported (the rest of the file can still be) */
  problem: string | null;
};

export type FeedMeParse = { ok: true; merchant: string; dateRange: string | null; days: FeedMeDay[]; warnings: string[] } | { ok: false; error: string };

export const cents = (v: number) => Math.round(v * 100);

export function cellText(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/** A money / number cell: a number, or text such as "1,234.50". Returns null when it is not a plain number. */
export function numberOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (t === "") return null;
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return Number(t);
  }
  return null;
}

/** dd/mm/yyyy -> YYYY-MM-DD, or null when it is not a real date. */
export function isoDate(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseFeedMeOverview(bytes: Uint8Array, today = todayInMalaysia()): FeedMeParse {
  // an .xlsx file is a zip: it starts with "PK"
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: false, error: "This is not an Excel (.xlsx) file. Download it from FeedMe: Report → Overview → Download → Excel." };

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
  } catch {
    return { ok: false, error: "The Excel file could not be read. Download it again from FeedMe." };
  }
  if (workbook.SheetNames.length > 40) return { ok: false, error: "This file has too many sheets to be a FeedMe overview." };

  const sheetName = workbook.SheetNames.find((n) => /daily\s*sales/i.test(n));
  if (!sheetName) return { ok: false, error: 'This file has no "Daily Sales" sheet. In FeedMe open Report → Overview, pick the dates and download the Excel file.' };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });

  // the lines above the table: Date: ..., Merchant: ...
  let merchant = "";
  let dateRange: string | null = null;
  for (const r of rows.slice(0, 12)) {
    const t = cellText(r[0]);
    if (/^merchant\s*:/i.test(t)) merchant = t.replace(/^merchant\s*:/i, "").trim();
    else if (/^date\s*:/i.test(t)) dateRange = t.replace(/^date\s*:/i, "").trim();
  }
  if (!merchant) return { ok: false, error: 'The file has no "Merchant:" line, so it cannot be checked to be from Restoran Bara.' };
  if (merchant.toLowerCase() !== FEEDME_MERCHANT.toLowerCase()) return { ok: false, error: `This file is for "${merchant.slice(0, 80)}", not for ${FEEDME_MERCHANT}. Nothing was read from it.` };

  // the table header: Date | Outlet | Count | Pax | Gross | Discount | SC | SST | Delivery fee | Rounding | Nett
  const headerAt = rows.findIndex((r) => cellText(r[0]).toLowerCase() === "date" && r.some((c) => cellText(c).toLowerCase() === "nett"));
  if (headerAt < 0) return { ok: false, error: 'The "Daily Sales" sheet has no table with the columns Date, Outlet, Count, Gross, Discount and Nett.' };
  const names = rows[headerAt].map((c) => cellText(c).toLowerCase());
  const col = (...options: string[]) => names.findIndex((n) => options.includes(n));
  const c = {
    date: col("date"),
    outlet: col("outlet"),
    count: col("count", "bill count", "bills"),
    pax: col("pax"),
    gross: col("gross"),
    discount: col("discount"),
    sc: col("sc", "service charge"),
    sst: col("sst"),
    delivery: col("delivery fee"),
    rounding: col("rounding"),
    nett: col("nett", "net"),
  };
  for (const [key, label] of [["date", "Date"], ["outlet", "Outlet"], ["count", "Count"], ["gross", "Gross"], ["discount", "Discount"], ["nett", "Nett"]] as const) {
    if (c[key] < 0) return { ok: false, error: `The "Daily Sales" sheet has no "${label}" column.` };
  }

  const warnings: string[] = [];
  const days: FeedMeDay[] = [];
  const summaryNett = new Map<string, number>();
  const outletSum = new Map<string, number>();
  const seen = new Set<string>();

  for (const r of rows.slice(headerAt + 1)) {
    const dateText = cellText(r[c.date]);
    if (!dateText) continue; // the grand-total row
    const date = isoDate(dateText);
    const outlet = cellText(r[c.outlet]);
    if (!date) {
      warnings.push(`A row has the date "${dateText.slice(0, 20)}", which is not a date (dd/mm/yyyy). It was left out.`);
      continue;
    }
    const nettCell = numberOf(r[c.nett]);
    if (!outlet) {
      // the summary row of a date: used only to check the outlet rows
      if (nettCell !== null) summaryNett.set(date, cents(nettCell));
      continue;
    }

    const money = (index: number, optional: boolean): number | null | "bad" => {
      if (index < 0) return optional ? 0 : "bad";
      const raw = r[index];
      if (raw === null || raw === "") return optional ? 0 : "bad";
      const n = numberOf(raw);
      if (n === null) return "bad";
      if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-4) return "bad";
      return Math.round(n * 100) / 100;
    };
    const gross = money(c.gross, false);
    const discount = money(c.discount, false);
    const sc = money(c.sc, true);
    const sst = money(c.sst, true);
    const delivery = money(c.delivery, true);
    const rounding = money(c.rounding, true);
    const nett = money(c.nett, false);
    const billsRaw = numberOf(r[c.count]);
    const paxRaw = c.pax >= 0 ? numberOf(r[c.pax]) : null;

    let problem: string | null = null;
    if ([gross, discount, sc, sst, delivery, rounding, nett].some((v) => v === "bad" || v === null)) problem = "A money figure is missing, is not a number or has more than 2 decimals.";
    else if (billsRaw === null || !Number.isInteger(billsRaw) || billsRaw < 0) problem = "The bill count is not a whole number.";
    else if (paxRaw !== null && (!Number.isInteger(paxRaw) || paxRaw < 0)) problem = "The pax is not a whole number.";
    else if ((gross as number) < 0) problem = "The gross sales is negative.";
    else if ((discount as number) > 0) problem = "The discount is expected to be zero or negative, as FeedMe writes it.";
    else if (cents(gross as number) + cents(discount as number) + cents(sc as number) + cents(sst as number) + cents(delivery as number) + cents(rounding as number) !== cents(nett as number)) problem = "Gross + discount + SC + SST + delivery fee + rounding does not equal Nett.";
    else if (date > today) problem = "This date is in the future.";
    else if (date === today) problem = "Today is not finished yet. Import it tomorrow, so a part of the day is not saved.";
    const key = `${date}|${outlet.toLowerCase()}`;
    if (!problem && seen.has(key)) problem = "This date and outlet appear twice in the file.";
    seen.add(key);

    const num = (v: number | null | "bad") => (typeof v === "number" ? v : 0);
    days.push({
      date,
      outlet: outlet.slice(0, 120),
      bills: billsRaw !== null && Number.isInteger(billsRaw) ? billsRaw : 0,
      pax: paxRaw !== null && Number.isInteger(paxRaw) ? paxRaw : null,
      gross: num(gross),
      discount: num(discount),
      serviceCharge: num(sc),
      sst: num(sst),
      deliveryFee: num(delivery),
      rounding: num(rounding),
      nett: num(nett),
      problem,
    });
    if (!problem) outletSum.set(date, (outletSum.get(date) ?? 0) + cents(num(nett)));
    if (days.length > MAX_DAYS) return { ok: false, error: `This file has more than ${MAX_DAYS} days. Download a shorter date range.` };
  }

  if (days.length === 0) return { ok: false, error: 'The "Daily Sales" sheet has no day with an outlet. Check the dates chosen in FeedMe.' };
  for (const [date, summary] of summaryNett) {
    const sum = outletSum.get(date);
    if (sum !== undefined && sum !== summary) warnings.push(`The outlet rows of ${date.split("-").reverse().join("/")} do not add up to the summary row of that date. Check the file.`);
  }
  days.sort((a, b) => a.date.localeCompare(b.date) || a.outlet.localeCompare(b.outlet));
  return { ok: true, merchant, dateRange, days, warnings };
}
