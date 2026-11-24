import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

/**
 * Supplier Statement of Account (SOA), laid out like the AutoCount "Creditor Statement":
 * every purchase invoice (IN, CR), debit note (DN, CR), credit note (CN, DR) and recorded payment (PV, DR) of one supplier up to the statement
 * date, with the running balance, the balance in words and the ageing by month (Current, 1 month ... 5 & over).
 */
export type SoaLineType = "IN" | "DN" | "CN" | "PV";
export type SoaLine = { date: string; type: SoaLineType; ref: string; description: string; dr: number; cr: number; balance: number };
export type SoaStatement = {
  supplierId: string;
  companyId: string;
  accountCode: string | null;
  supplierName: string;
  addressLines: string[];
  phone: string | null;
  terms: string;
  statementDate: string;
  company: { name: string; registrationNo: string | null; addressLines: string[]; phone: string | null };
  lines: SoaLine[];
  balance: number;
  /** Current, 1 month, 2 months, 3 months, 4 months, 5 & over */
  aging: [number, number, number, number, number, number];
};

export const AGING_LABELS = ["CURRENT", "1 MONTH", "2 MONTHS", "3 MONTHS", "4 MONTHS", "5 & OVER"] as const;

/** The address and phone printed on top of the statement (the companies table has no address yet). */
const LETTERHEADS: { match: RegExp; registrationNo?: string; addressLines: string[]; phone?: string }[] = [
  {
    match: /kasturi/i,
    registrationNo: "201901043046(1352376-H)",
    addressLines: ["NO.3, JALAN MUTIARA EMAS 5/23, TAMAN MOUNT AUSTIN,", "81100 JOHOR BAHRU, JOHOR."],
    phone: "019-700 7005",
  },
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const TYPE_ORDER: Record<SoaLineType, number> = { IN: 0, DN: 1, CN: 2, PV: 3 };

/** Reads every row of a query, 1000 at a time (the database gives at most 1000 rows per request). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

function splitAddress(address: string | null | undefined): string[] {
  if (!address) return [];
  const byLine = address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  // one long line: break it after the commas into lines of about 45 characters
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const p of parts) {
    const next = cur ? `${cur}, ${p}` : p;
    if (next.length > 45 && cur) {
      lines.push(`${cur},`);
      cur = p;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/** The ageing by the month of each document: invoices and notes are netted per month, then payments (and months that are below zero) clear the oldest months first. */
function ageBalance(lines: SoaLine[], statementDate: string): SoaStatement["aging"] {
  const perMonth = new Map<number, number>();
  let pool = 0;
  for (const l of lines) {
    if (l.type === "PV") pool += l.dr - l.cr;
    else perMonth.set(monthIndex(l.date), (perMonth.get(monthIndex(l.date)) ?? 0) + l.cr - l.dr);
  }
  const months = Array.from(perMonth.entries()).sort((a, b) => a[0] - b[0]);
  for (const [, v] of months) if (v < 0) pool += -v;
  const aging: SoaStatement["aging"] = [0, 0, 0, 0, 0, 0];
  const now = monthIndex(statementDate);
  for (const [m, v] of months) {
    if (v <= 0) continue;
    const cleared = Math.min(v, pool);
    pool -= cleared;
    const left = v - cleared;
    if (left > 0) aging[Math.min(5, Math.max(0, now - m))] += left;
  }
  if (pool > 0) aging[0] -= pool; // more paid / credited than owed: shown as a minus in Current
  return aging.map(round2) as SoaStatement["aging"];
}

/**
 * The statements of every supplier of these companies (or of one supplier), up to the statement date.
 * Draft invoices are left out; payments count only once they are marked paid.
 */
export async function loadSoaStatements(supabase: DB, companyIds: string[], statementDate: string, supplierId?: string): Promise<SoaStatement[]> {
  const [suppliers, invoices, notes, payments] = await Promise.all([
    fetchAll((from, to) => {
      let q = supabase
        .from("suppliers")
        .select("id, company_id, name, account_code, billing_address, phone, payment_terms, companies(name, legal_name, registration_no)")
        .in("company_id", companyIds);
      if (supplierId) q = q.eq("id", supplierId);
      return q.order("name").order("id").range(from, to);
    }),
    fetchAll((from, to) => {
      let q = supabase
        .from("supplier_invoices")
        .select("id, supplier_id, invoice_number, invoice_date, amount, status")
        .in("company_id", companyIds)
        .neq("status", "draft")
        .lte("invoice_date", statementDate);
      if (supplierId) q = q.eq("supplier_id", supplierId);
      return q.order("id").range(from, to);
    }),
    fetchAll((from, to) => {
      let q = supabase
        .from("supplier_notes")
        .select("id, supplier_id, note_type, note_number, note_date, amount")
        .in("company_id", companyIds)
        .lte("note_date", statementDate);
      if (supplierId) q = q.eq("supplier_id", supplierId);
      return q.order("id").range(from, to);
    }),
    fetchAll((from, to) => {
      let q = supabase
        .from("supplier_payments")
        .select("id, amount, payment_date, reference_number, status, supplier_invoices!inner(supplier_id, invoice_number, invoice_date)")
        .in("company_id", companyIds)
        .eq("status", "paid");
      if (supplierId) q = q.eq("supplier_invoices.supplier_id", supplierId);
      return q.order("id").range(from, to);
    }),
  ]);

  const linesBySupplier = new Map<string, Omit<SoaLine, "balance">[]>();
  const add = (sid: string, l: Omit<SoaLine, "balance">) => linesBySupplier.set(sid, [...(linesBySupplier.get(sid) ?? []), l]);

  for (const i of invoices) {
    // a debit note keyed in as an invoice (its number has "-DN-", like AKF-DN-2609-0128) is shown as a DN
    const isDebitNote = /(^|[-\s])DN[-\s]/i.test(i.invoice_number);
    add(i.supplier_id, { date: i.invoice_date, type: isDebitNote ? "DN" : "IN", ref: i.invoice_number, description: isDebitNote ? "DEBIT NOTE" : "PURCHASE INVOICE", dr: 0, cr: Number(i.amount) });
  }
  for (const n of notes) {
    if (n.note_type === "credit") add(n.supplier_id, { date: n.note_date, type: "CN", ref: n.note_number, description: "PURCHASE RETURN", dr: Number(n.amount), cr: 0 });
    else add(n.supplier_id, { date: n.note_date, type: "DN", ref: n.note_number, description: "DEBIT NOTE", dr: 0, cr: Number(n.amount) });
  }
  for (const p of payments) {
    const inv = p.supplier_invoices as unknown as { supplier_id: string; invoice_number: string; invoice_date: string };
    // a payment without a payment date (part payments / adjustments loaded from the AutoCount outstanding report) is shown on the date of its invoice
    const date = p.payment_date ?? inv.invoice_date;
    if (date > statementDate) continue;
    add(inv.supplier_id, {
      date,
      type: "PV",
      ref: p.reference_number || inv.invoice_number,
      description: p.payment_date ? `PAYMENT - ${inv.invoice_number}` : `PAID / ADJUSTED - ${inv.invoice_number}`,
      dr: Number(p.amount),
      cr: 0,
    });
  }

  return suppliers.map((s) => {
    const raw = (linesBySupplier.get(s.id) ?? []).sort((a, b) => a.date.localeCompare(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.ref.localeCompare(b.ref));
    let bal = 0;
    const lines: SoaLine[] = raw.map((l) => {
      bal = round2(bal + l.cr - l.dr);
      return { ...l, balance: bal };
    });
    const company = s.companies as unknown as { name: string; legal_name: string | null; registration_no: string | null } | null;
    const companyName = company?.legal_name || company?.name || "";
    const head = LETTERHEADS.find((h) => h.match.test(companyName));
    return {
      supplierId: s.id,
      companyId: s.company_id,
      accountCode: s.account_code,
      supplierName: s.name,
      addressLines: splitAddress(s.billing_address),
      phone: s.phone,
      terms: s.payment_terms?.trim() || "-",
      statementDate,
      company: { name: companyName, registrationNo: company?.registration_no || head?.registrationNo || null, addressLines: head?.addressLines ?? [], phone: head?.phone ?? null },
      lines,
      balance: bal,
      aging: ageBalance(lines, statementDate),
    };
  });
}
