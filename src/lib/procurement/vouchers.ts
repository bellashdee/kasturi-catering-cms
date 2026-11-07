import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { todayInMalaysia } from "@/lib/format";

type DB = SupabaseClient<Database>;

/** One line of a voucher: an invoice (+), a credit note (-) or a debit note (+) of the month. `amount` carries the sign. */
export type VoucherLine = { kind: "invoice" | "credit" | "debit"; ref: string; date: string; description: string; amount: number };

export type VoucherFigures = { lines: VoucherLine[]; invoicesTotal: number; creditTotal: number; debitTotal: number; net: number };

const cents = (n: number) => Math.round(n * 100) / 100;

/** The first day of a month (YYYY-MM-01) from "YYYY-MM"; the month before today (Malaysia) when nothing valid is given: vouchers are issued at the start of the next month. */
export function voucherMonth(param?: string): string {
  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return `${param}-01`;
  const [y, m] = todayInMalaysia().split("-").map(Number);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return `${prev.y}-${String(prev.m).padStart(2, "0")}-01`;
}

export function nextMonthStart(monthStart: string): string {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export function monthLabel(monthStart: string): string {
  return new Date(`${monthStart}T12:00:00+08:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
}

export function figuresOf(lines: VoucherLine[]): VoucherFigures {
  const sum = (kind: VoucherLine["kind"]) => cents(lines.filter((l) => l.kind === kind).reduce((t, l) => t + Math.abs(l.amount), 0));
  const invoicesTotal = sum("invoice");
  const creditTotal = sum("credit");
  const debitTotal = sum("debit");
  return { lines, invoicesTotal, creditTotal, debitTotal, net: cents(invoicesTotal - creditTotal + debitTotal) };
}

/** The invoices and the credit / debit notes of one supplier in one month, as the lines of its voucher. */
export async function buildVoucherLines(supabase: DB, companyId: string, supplierId: string, monthStart: string): Promise<VoucherFigures> {
  const end = nextMonthStart(monthStart);
  const [{ data: invoices, error: invError }, { data: notes, error: noteError }] = await Promise.all([
    supabase.from("supplier_invoices").select("invoice_number, invoice_date, amount").eq("company_id", companyId).eq("supplier_id", supplierId).gte("invoice_date", monthStart).lt("invoice_date", end).order("invoice_date"),
    supabase.from("supplier_notes").select("note_type, note_number, note_date, amount, reason").eq("company_id", companyId).eq("supplier_id", supplierId).gte("note_date", monthStart).lt("note_date", end).order("note_date"),
  ]);
  if (invError) throw invError;
  if (noteError) throw noteError;
  const lines: VoucherLine[] = [
    ...(invoices ?? []).map((i): VoucherLine => ({ kind: "invoice", ref: i.invoice_number, date: i.invoice_date, description: `Invoice ${i.invoice_number}`, amount: Number(i.amount) })),
    ...(notes ?? []).map((n): VoucherLine => ({
      kind: n.note_type === "credit" ? "credit" : "debit",
      ref: n.note_number,
      date: n.note_date,
      description: `${n.note_type === "credit" ? "Credit note" : "Debit note"} ${n.note_number}${n.reason ? ` (${n.reason})` : ""}`,
      amount: n.note_type === "credit" ? -Number(n.amount) : Number(n.amount),
    })),
  ];
  return figuresOf(lines);
}

export const linesFromJson = (json: Json): VoucherLine[] => (Array.isArray(json) ? (json as unknown as VoucherLine[]) : []);
