import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { nextMonthStart } from "@/lib/procurement/vouchers";

type DB = SupabaseClient<Database>;

/** A supplier name compared the same way whatever the capitals and spaces. */
export const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export type SupplierMonthRow = {
  supplierId: string;
  name: string;
  invoices: number;
  invoiceTotal: number;
  credit: number;
  debit: number;
  net: number;
  /** The supplier payment of that month that already exists (by the supplier's name), if any. */
  paymentId: string | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What every supplier of the company is owed for a month: its invoices dated in the month, minus its credit notes, plus its debit notes,
 * and whether the supplier payment (the payment voucher) of that month is already open.
 */
export async function listSupplierMonth(supabase: DB, companyId: string, monthStart: string): Promise<SupplierMonthRow[]> {
  const end = nextMonthStart(monthStart);
  const [{ data: invoices }, { data: notes }, { data: payments }] = await Promise.all([
    supabase.from("supplier_invoices").select("supplier_id, amount").eq("company_id", companyId).gte("invoice_date", monthStart).lt("invoice_date", end),
    supabase.from("supplier_notes").select("supplier_id, note_type, amount").eq("company_id", companyId).gte("note_date", monthStart).lt("note_date", end),
    supabase.from("finance_payments").select("id, payee_name").eq("company_id", companyId).eq("category", "supplier").eq("period_month", monthStart),
  ]);
  const rows = new Map<string, SupplierMonthRow>();
  const rowFor = (supplierId: string) => {
    if (!rows.has(supplierId)) rows.set(supplierId, { supplierId, name: "", invoices: 0, invoiceTotal: 0, credit: 0, debit: 0, net: 0, paymentId: null });
    return rows.get(supplierId)!;
  };
  for (const i of invoices ?? []) {
    const r = rowFor(i.supplier_id);
    r.invoices += 1;
    r.invoiceTotal += Number(i.amount);
  }
  for (const n of notes ?? []) {
    const r = rowFor(n.supplier_id);
    if (n.note_type === "credit") r.credit += Number(n.amount);
    else r.debit += Number(n.amount);
  }
  if (rows.size === 0) return [];
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", [...rows.keys()]);
  const paymentByName = new Map((payments ?? []).map((p) => [nameKey(p.payee_name), p.id]));
  for (const s of suppliers ?? []) {
    const r = rows.get(s.id);
    if (!r) continue;
    r.name = s.name;
    r.paymentId = paymentByName.get(nameKey(s.name)) ?? null;
  }
  return [...rows.values()]
    .map((r) => ({ ...r, invoiceTotal: cents(r.invoiceTotal), credit: cents(r.credit), debit: cents(r.debit), net: cents(r.invoiceTotal - r.credit + r.debit) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
