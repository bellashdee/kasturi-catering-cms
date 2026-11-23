import * as XLSX from "xlsx";
import { todayInMalaysia } from "@/lib/format";
import { FEEDME_MERCHANT, cellText, cents, isoDate, numberOf } from "@/lib/restaurant/feedme";

/**
 * Reads the FeedMe "Close up" Excel of ONE day (Report > Close up > pick the day > Download > Excel). Untrusted file: only the named sheets and the
 * "Merchant:" / "Date:" lines are read. The file gives the day split by payment method and, separately, by order type; the cross of the two
 * is NOT in it and is never made up. Both splits must add up to the Nett of the Sales summary (tolerance RM 0.05 for rounding).
 */
export type CloseUpSplit = { label: string; key: string; qty: number; amount: number; /** the name in the file was not known: it is mapped to "other" and shown */ unknown: boolean };

export type CloseUpDay = {
  date: string; // YYYY-MM-DD
  outlet: string;
  bills: number;
  pax: number | null;
  gross: number;
  discount: number; // zero or negative, as in the file
  serviceCharge: number;
  sst: number;
  deliveryFee: number;
  rounding: number;
  nett: number;
  voidBills: number;
  /** voided / draft bills: not sales */
  voidAmount: number;
  refundAmount: number;
  payments: CloseUpSplit[];
  channels: CloseUpSplit[];
  problem: string | null;
};

export type CloseUpParse = { ok: true; merchant: string; day: CloseUpDay } | { ok: false; error: string };

const TOLERANCE = 5; // cents

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** FeedMe payment name -> payment method of the system. Unknown names become "other" (and are shown to the person). */
export function mapPayment(label: string): { key: string; unknown: boolean } {
  const n = norm(label);
  if (n === "CASH") return { key: "cash", unknown: false };
  if (["DUITNOW", "DUITNOWQR", "QR", "QRPAY", "QRCODE"].includes(n)) return { key: "qr_duitnow", unknown: false };
  if (["GRABFOOD", "GRAB", "FOODPANDA", "SHOPEEFOOD", "SHOPEE", "DELIVEROO", "ONLINEPLATFORM"].includes(n)) return { key: "online_platform", unknown: false };
  if (["CARD", "VISA", "MASTER", "MASTERCARD", "DEBIT", "DEBITCARD", "CREDIT", "CREDITCARD", "AMEX", "AMERICANEXPRESS", "EFTPOS"].includes(n)) return { key: "card", unknown: false };
  return { key: "other", unknown: true };
}

/** FeedMe order type -> channel of the system. Unknown types become "other" (and are shown to the person). */
export function mapChannel(label: string): { key: string; unknown: boolean } {
  const n = norm(label);
  if (["DINEIN", "DINE"].includes(n)) return { key: "dine_in", unknown: false };
  if (["TAKEAWAY", "TAKEOUT", "PICKUP"].includes(n)) return { key: "takeaway", unknown: false };
  if (n === "DELIVERY") return { key: "delivery", unknown: false };
  if (n === "ONLINE") return { key: "online", unknown: false };
  return { key: "other", unknown: true };
}

type Rows = unknown[][];

function sheetRows(wb: XLSX.WorkBook, pattern: RegExp): Rows | null {
  const name = wb.SheetNames.find((n) => pattern.test(n));
  if (!name) return null;
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
}

/** The value of a sheet that holds one "Name | Value" row. */
function singleValue(wb: XLSX.WorkBook, pattern: RegExp): number | null {
  const rows = sheetRows(wb, pattern);
  if (!rows) return null;
  const at = rows.findIndex((r) => cellText(r[0]).toLowerCase() === "name");
  const row = at >= 0 ? rows[at + 1] : undefined;
  return row ? numberOf(row[1]) : null;
}

/** A 2-decimal money value, or null. */
function money(v: number | null): number | null {
  if (v === null) return null;
  if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-4) return null;
  return Math.round(v * 100) / 100;
}

function table(rows: Rows | null, firstHeader: string): Rows {
  if (!rows) return [];
  const at = rows.findIndex((r) => cellText(r[0]).toLowerCase() === firstHeader.toLowerCase());
  return at >= 0 ? rows.slice(at + 1).filter((r) => cellText(r[0]) !== "") : [];
}

function metaLines(wb: XLSX.WorkBook): { merchant: string; dateLine: string | null; title: string } {
  let merchant = "";
  let dateLine: string | null = null;
  let title = "";
  for (const name of wb.SheetNames.slice(0, 6)) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }).slice(0, 10);
    if (!title) title = cellText(rows[0]?.[0]);
    for (const r of rows) {
      const t = cellText(r[0]);
      if (!merchant && /^merchant\s*:/i.test(t)) merchant = t.replace(/^merchant\s*:/i, "").trim();
      if (!dateLine && /^date\s*:/i.test(t)) dateLine = t.replace(/^date\s*:/i, "").trim();
    }
    if (merchant && dateLine) break;
  }
  return { merchant, dateLine, title };
}

/** Which FeedMe file this is: the Overview (a "Daily Sales" sheet) or the Close up (a "Payment summary" sheet). */
export function detectFeedMeKind(bytes: Uint8Array): "overview" | "closeup" | null {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  try {
    const wb = XLSX.read(bytes, { type: "array", bookSheets: true });
    if (wb.SheetNames.some((n) => /payment\s*summary/i.test(n)) && wb.SheetNames.some((n) => /sales\s*summary/i.test(n))) return "closeup";
    if (wb.SheetNames.some((n) => /daily\s*sales/i.test(n))) return "overview";
  } catch {
    return null;
  }
  return null;
}

export function parseFeedMeCloseUp(bytes: Uint8Array, today = todayInMalaysia()): CloseUpParse {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: false, error: "This is not an Excel (.xlsx) file. Download it from FeedMe: Report → Close up → pick the day → Download → Excel." };
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
  } catch {
    return { ok: false, error: "The Excel file could not be read. Download it again from FeedMe." };
  }
  if (wb.SheetNames.length > 40) return { ok: false, error: "This file has too many sheets to be a FeedMe Close up." };

  const { merchant, dateLine } = metaLines(wb);
  if (!merchant) return { ok: false, error: 'The file has no "Merchant:" line, so it cannot be checked to be from Restoran Bara.' };
  if (merchant.toLowerCase() !== FEEDME_MERCHANT.toLowerCase()) return { ok: false, error: `This file is for "${merchant.slice(0, 80)}", not for ${FEEDME_MERCHANT}. Nothing was read from it.` };

  // ONE day only: a range gives totals with no per-day rows
  const dates = (dateLine ?? "").split(/\s+-\s+/).map((d) => isoDate(d));
  if (dates.length !== 2 || !dates[0] || !dates[1]) return { ok: false, error: 'The file has no "Date:" line with a date (dd/mm/yyyy).' };
  if (dates[0] !== dates[1]) return { ok: false, error: "This Close up covers several days. Download one day at a time: Report → Close up → pick the day → Download → Excel." };
  const date = dates[0];

  // the Sales summary: Label | Value
  const summaryRows = sheetRows(wb, /sales\s*summary/i);
  if (!summaryRows) return { ok: false, error: 'This file has no "Sales summary" sheet, so it is not a FeedMe Close up.' };
  const summary = new Map<string, number | null>();
  for (const r of table(summaryRows, "Label")) summary.set(cellText(r[0]).toLowerCase(), numberOf(r[1]));
  const sv = (label: string) => money(summary.get(label) ?? null);

  let problem: string | null = null;
  const gross = sv("gross");
  const discount = sv("discount");
  const deliveryFee = sv("delivery fee") ?? 0;
  const otherCharge = sv("other charge") ?? 0;
  const sst = sv("sst") ?? 0;
  const serviceCharge = sv("service charge") ?? 0;
  const rounding = sv("rounding") ?? 0;
  const nett = sv("nett");
  const grossBefore = sv("gross before charges");
  if (gross === null || discount === null || nett === null) problem = "The Sales summary has no readable Gross, Discount and Nett, or a figure has more than 2 decimals.";
  else if (gross < 0) problem = "The gross sales is negative.";
  else if (discount > 0) problem = "The discount is expected to be zero or negative, as FeedMe writes it.";
  else if (otherCharge !== 0) problem = "This day has an Other charge, which the system does not handle yet. Nothing was imported.";
  else if (cents(gross) + cents(discount) + cents(deliveryFee) + cents(sst) + cents(serviceCharge) + cents(rounding) !== cents(nett)) problem = "Gross + discount + delivery fee + SST + service charge + rounding does not equal Nett.";
  else if (grossBefore !== null && cents(grossBefore) !== cents(gross) + cents(discount)) problem = "Gross before charges is not gross less discount.";

  const billsRaw = singleValue(wb, /bill\s*count/i);
  const bills = singleValue(wb, /^\d*\.?\s*bill\s*count$/i);
  const billCount = bills ?? billsRaw;
  const voidBillsRaw = singleValue(wb, /void\s*bill\s*count/i);
  const pax = singleValue(wb, /total\s*pax/i);
  const voidAmount = money(singleValue(wb, /total\s*void/i)) ?? 0;
  const refundAmount = money(singleValue(wb, /total\s*refund/i)) ?? 0;
  const totalSales = money(singleValue(wb, /total\s*sales/i));
  if (!problem && (billCount === null || !Number.isInteger(billCount) || billCount < 0)) problem = "The bill count is missing or is not a whole number.";
  if (!problem && pax !== null && (!Number.isInteger(pax) || pax < 0)) problem = "The pax is not a whole number.";
  if (!problem && nett !== null && totalSales !== null && cents(totalSales) !== cents(nett)) problem = "Total Sales and the Nett of the Sales summary are different.";
  if (!problem && (voidAmount < 0 || refundAmount < 0)) problem = "The void or refund total is negative.";

  // the charge summary (service charge) must agree with the Sales summary when it is there
  const chargeRows = table(sheetRows(wb, /charge\s*summary/i), "Charge");
  for (const r of chargeRows) {
    if (!problem && /service/i.test(cellText(r[0]))) {
      const v = money(numberOf(r[1]));
      if (v !== null && cents(v) !== cents(serviceCharge)) problem = "The service charge in the Charge summary is different from the Sales summary.";
    }
  }

  // payments: Name | Refund | Qty | Total
  const payments = new Map<string, CloseUpSplit>();
  for (const r of table(sheetRows(wb, /payment\s*summary/i), "Name")) {
    const label = cellText(r[0]).slice(0, 80);
    const refund = cellText(r[1]).toLowerCase();
    const qty = numberOf(r[2]);
    const total = money(numberOf(r[3]));
    if (!problem && refund !== "no" && refund !== "") problem = "This day has refunded payments, which the system does not handle yet. Nothing was imported.";
    if (!problem && (total === null || qty === null || !Number.isInteger(qty) || qty < 0)) problem = `The payment "${label}" has a missing or invalid quantity or total.`;
    const map = mapPayment(label);
    const cur = payments.get(label);
    if (cur) {
      cur.qty += qty ?? 0;
      cur.amount += total ?? 0;
    } else payments.set(label, { label, key: map.key, qty: qty ?? 0, amount: total ?? 0, unknown: map.unknown });
  }
  // order types: Type | Qty | Sales
  const channels = new Map<string, CloseUpSplit>();
  for (const r of table(sheetRows(wb, /type\s*summary/i), "Type")) {
    const label = cellText(r[0]).slice(0, 80);
    const qty = numberOf(r[1]);
    const total = money(numberOf(r[2]));
    if (!problem && (total === null || qty === null || !Number.isInteger(qty) || qty < 0)) problem = `The order type "${label}" has a missing or invalid quantity or sales.`;
    const map = mapChannel(label);
    const cur = channels.get(label);
    if (cur) {
      cur.qty += qty ?? 0;
      cur.amount += total ?? 0;
    } else channels.set(label, { label, key: map.key, qty: qty ?? 0, amount: total ?? 0, unknown: map.unknown });
  }
  const pay = Array.from(payments.values()).map((p) => ({ ...p, amount: Math.round(p.amount * 100) / 100 }));
  const chan = Array.from(channels.values()).map((p) => ({ ...p, amount: Math.round(p.amount * 100) / 100 }));
  if (!problem && pay.length === 0) problem = "The Payment summary has no payment.";
  if (!problem && chan.length === 0) problem = "The Type summary has no order type.";
  if (!problem && nett !== null) {
    const paySum = pay.reduce((t, p) => t + cents(p.amount), 0);
    const chanSum = chan.reduce((t, p) => t + cents(p.amount), 0);
    if (Math.abs(paySum - cents(nett)) > TOLERANCE) problem = `Does not add up: the payment methods add up to RM ${(paySum / 100).toFixed(2)}, not to the Nett of RM ${nett.toFixed(2)}.`;
    else if (Math.abs(chanSum - cents(nett)) > TOLERANCE) problem = `Does not add up: the order types add up to RM ${(chanSum / 100).toFixed(2)}, not to the Nett of RM ${nett.toFixed(2)}.`;
  }
  if (!problem && date > today) problem = "This date is in the future.";
  if (!problem && date === today) problem = "Today is not finished yet. Import it tomorrow, so a part of the day is not saved.";

  return {
    ok: true,
    merchant,
    day: {
      date,
      outlet: FEEDME_MERCHANT,
      bills: billCount !== null && Number.isInteger(billCount) ? billCount : 0,
      pax: pax !== null && Number.isInteger(pax) ? pax : null,
      gross: gross ?? 0,
      discount: discount ?? 0,
      serviceCharge,
      sst,
      deliveryFee,
      rounding,
      nett: nett ?? 0,
      voidBills: voidBillsRaw !== null && Number.isInteger(voidBillsRaw) ? voidBillsRaw : 0,
      voidAmount,
      refundAmount,
      payments: pay,
      channels: chan,
      problem,
    },
  };
}
