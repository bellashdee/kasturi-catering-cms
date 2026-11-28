import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { FIELD_LABEL, REQUIRED_FOR_APPROVAL, type CanonicalInvoice, type InvoiceHeader, type InvoiceLine } from "./schema";

type DB = SupabaseClient<Database>;

/** Every check only reports. No printed value is ever changed by a check. */
export type Check = { code: string; ok: boolean; severity: "error" | "warning" | "info"; message: string };

const TOL = 0.011; // one sen
const ROUND = 0.05; // Malaysian 5-sen rounding
const money = (n: number) => n.toFixed(2);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Recalculates what the invoice says and compares it with what it says. */
export function validateInvoice(header: InvoiceHeader, lines: InvoiceLine[], today = new Date().toISOString().slice(0, 10)): Check[] {
  const checks: Check[] = [];

  for (const f of REQUIRED_FOR_APPROVAL) {
    if (header[f] !== null && header[f] !== "") continue;
    // most suppliers print payment terms, not a due date: the reviewer types it (it is never worked out from the terms)
    if (f === "due_date") {
      checks.push({ code: "missing_due_date", ok: false, severity: "info", message: `The due date is not printed${header.payment_terms ? ` (terms: ${header.payment_terms})` : ""}. Type it before approving; it is never calculated.` });
      continue;
    }
    checks.push({ code: `missing_${f}`, ok: false, severity: "error", message: `${FIELD_LABEL[f]} was not found on the invoice. Type it from the original (it is never filled in automatically).` });
  }

  // 1. quantity × unit price − discount = line total
  let lineOk = 0;
  lines.forEach((l, i) => {
    const q = num(l.quantity);
    const p = num(l.unit_price);
    const t = num(l.line_total);
    if (q === null || p === null || t === null) {
      if (l.line_total === null) checks.push({ code: "line_missing_total", ok: false, severity: "warning", message: `Line ${i + 1} has no amount.` });
      return;
    }
    const d = num(l.discount) ?? 0;
    const gross = q * p;
    const diff = d > 0 ? Math.min(Math.abs(gross - d - t), Math.abs(gross * (1 - d / 100) - t)) : Math.abs(gross - t);
    // a printed line total may include the line's tax
    const withTax = num(l.tax_amount) !== null ? Math.abs(gross - d + (l.tax_amount as number) - t) : Infinity;
    if (diff > TOL && withTax > TOL) {
      checks.push({ code: "line_math", ok: false, severity: "warning", message: `Line ${i + 1}${l.description ? ` (${l.description.slice(0, 40)})` : ""}: ${q} × ${p}${d ? ` less ${d}` : ""} = ${money(gross - d)}, but the printed amount is ${money(t)}.` });
    } else lineOk++;
  });
  if (lineOk > 0 && !checks.some((c) => c.code === "line_math")) checks.push({ code: "line_math", ok: true, severity: "info", message: `${lineOk} line${lineOk === 1 ? "" : "s"}: quantity × unit price matches the printed amount.` });

  const totals = lines.map((l) => num(l.line_total));
  const sum = lines.length && totals.every((t) => t !== null) ? (totals as number[]).reduce((a, b) => a + b, 0) : null;
  const subtotal = num(header.subtotal);
  const tax = num(header.tax_amount) ?? 0;
  const discount = num(header.discount_total) ?? 0;
  const delivery = num(header.delivery_charge) ?? 0;
  const other = num(header.other_charges) ?? 0;
  const rounding = num(header.rounding) ?? 0;
  const total = num(header.total_amount);

  // 2. lines add up to the subtotal (or to the total when there is no subtotal)
  if (sum !== null && subtotal !== null) {
    const diff = Math.abs(sum - subtotal);
    checks.push({ code: "lines_vs_subtotal", ok: diff <= ROUND, severity: diff <= ROUND ? "info" : "error", message: diff <= TOL ? `Lines add up to ${money(sum)}, the printed subtotal.` : `Lines add up to ${money(sum)}, but the printed subtotal is ${money(subtotal)} (difference ${money(diff)}).` });
  } else if (sum !== null && total !== null) {
    const expected = sum - discount + tax + delivery + other + rounding;
    const diff = Math.abs(expected - total);
    checks.push({ code: "lines_vs_total", ok: diff <= ROUND, severity: diff <= ROUND ? "info" : "error", message: diff <= TOL ? `Lines${tax || delivery || other || discount ? " with tax / charges / discount" : ""} add up to ${money(expected)}, the printed total.` : `Lines${tax || delivery || other || discount ? " with tax / charges / discount" : ""} add up to ${money(expected)}, but the printed total is ${money(total)} (difference ${money(diff)}).` });
  }

  // 3. subtotal − discount + tax + charges + rounding = total
  if (subtotal !== null && total !== null) {
    const expected = subtotal - discount + tax + delivery + other + rounding;
    const diff = Math.abs(expected - total);
    checks.push({ code: "subtotal_to_total", ok: diff <= ROUND, severity: diff <= ROUND ? "info" : "error", message: diff <= TOL ? `Subtotal ${money(subtotal)}${discount ? ` − discount ${money(discount)}` : ""}${tax ? ` + tax ${money(tax)}` : ""}${delivery ? ` + delivery ${money(delivery)}` : ""}${other ? ` + charges ${money(other)}` : ""}${rounding ? ` + rounding ${money(rounding)}` : ""} = ${money(total)}, as printed.` : `Subtotal and charges give ${money(expected)}, but the printed total is ${money(total)} (difference ${money(diff)}).` });
  }

  // 4. paid / outstanding
  const paid = num(header.amount_paid);
  const outstanding = num(header.outstanding_amount);
  if (total !== null && paid !== null && outstanding !== null) {
    const diff = Math.abs(paid + outstanding - total);
    checks.push({ code: "paid_outstanding", ok: diff <= ROUND, severity: diff <= ROUND ? "info" : "warning", message: diff <= ROUND ? `Paid ${money(paid)} + outstanding ${money(outstanding)} = total.` : `Paid ${money(paid)} + outstanding ${money(outstanding)} = ${money(paid + outstanding)}, not the total ${money(total)}.` });
  } else if (total !== null && outstanding !== null && outstanding - total > ROUND) {
    checks.push({ code: "paid_outstanding", ok: false, severity: "warning", message: `The outstanding amount ${money(outstanding)} is more than the invoice total ${money(total)} (it may include earlier invoices).` });
  }
  if (paid !== null && paid > 0) checks.push({ code: "paid_printed", ok: true, severity: "warning", message: `The invoice prints ${money(paid)} as already paid. Supplier payments are made by the monthly payment voucher, so check this against the PV.` });

  // 5. dates
  const invDate = typeof header.invoice_date === "string" ? header.invoice_date : null;
  const dueDate = typeof header.due_date === "string" ? header.due_date : null;
  if (invDate && dueDate && dueDate < invDate) checks.push({ code: "due_before_invoice", ok: false, severity: "warning", message: `The due date ${dueDate} is before the invoice date ${invDate}.` });
  if (invDate && invDate > today) checks.push({ code: "future_date", ok: false, severity: "warning", message: `The invoice date ${invDate} is in the future. Check the year / day-month order.` });
  if (invDate && invDate < String(Number(today.slice(0, 4)) - 2) + today.slice(4)) checks.push({ code: "old_date", ok: false, severity: "warning", message: `The invoice date ${invDate} is more than 2 years ago. Check the year.` });
  if (header.currency && !/^(myr|rm)$/i.test(String(header.currency))) checks.push({ code: "currency", ok: false, severity: "warning", message: `The invoice is in ${header.currency}, not ringgit. Amounts are never converted.` });
  if (total !== null && total <= 0) checks.push({ code: "non_positive_total", ok: false, severity: "warning", message: `The total is ${money(total)} (a credit note or a refund?).` });

  return checks;
}

// ---------- names ----------

const STOP = /\b(sdn|bhd|berhad|enterprise|ent|trading|tdg|resources|services|supply|supplies|co|company|plt|llp|m|malaysia|the|and|dan)\b/g;
export const normName = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(STOP, " ").replace(/\s+/g, " ").trim();
export const normRegNo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const normInvoiceNo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function bigrams(s: string): string[] {
  const t = s.replace(/\s/g, "");
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}
/** Dice coefficient on letter pairs: 1 = same, 0 = nothing alike. */
export function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.length || !y.length) return a === b && a !== "" ? 1 : 0;
  const pool = new Map<string, number>();
  for (const g of y) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of x) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

export type SupplierCandidate = { id: string; name: string; score: number; reason: string; invoiceCount: number };
export type SupplierMatch = { best: SupplierCandidate | null; reliable: boolean; candidates: SupplierCandidate[] };

/** Recognises the supplier from the company's own supplier records (registration no. first, then the name). Never creates one. */
export function matchSupplier(
  suppliers: { id: string; name: string; registration_no: string | null }[],
  invoiceCounts: Map<string, number>,
  name: string | null,
  regNo: string | null,
): SupplierMatch {
  const candidates: SupplierCandidate[] = [];
  const reg = regNo ? normRegNo(regNo) : "";
  const wanted = name ? normName(name) : "";
  for (const s of suppliers) {
    let score = 0;
    let reason = "";
    const sReg = s.registration_no ? normRegNo(s.registration_no) : "";
    // a registration no. printed as "202001012345 (1234567-X)" matches a record holding either part
    if (reg && sReg && sReg.length >= 6 && (reg === sReg || reg.includes(sReg) || sReg.includes(reg))) {
      score = 1;
      reason = "Same registration no.";
    } else if (wanted) {
      const sn = normName(s.name);
      if (sn && sn === wanted) {
        score = 0.97;
        reason = "Same name";
      } else if (sn) {
        const sim = similarity(sn, wanted);
        if (sim >= 0.6) {
          score = sim * 0.9;
          reason = `Similar name (${Math.round(sim * 100)}%)`;
        }
      }
    }
    if (score > 0) candidates.push({ id: s.id, name: s.name, score, reason, invoiceCount: invoiceCounts.get(s.id) ?? 0 });
  }
  candidates.sort((a, b) => b.score - a.score || b.invoiceCount - a.invoiceCount);
  const best = candidates[0] ?? null;
  // reliable only when unambiguous: a registration-no. match, or an exact name match with no other equally good one
  const reliable = !!best && best.score >= 0.97 && !(candidates[1] && candidates[1].score >= best.score);
  return { best, reliable, candidates: candidates.slice(0, 5) };
}

export type CompanyMatch = { companyId: string | null; companyName: string | null; reliable: boolean; message: string };

/** Which of the companies the invoice is billed to, only when the printed Bill To clearly names one of them. */
export function matchCompany(companies: { id: string; name: string }[], billTo: string | null, chosenCompanyId: string): CompanyMatch {
  const chosen = companies.find((c) => c.id === chosenCompanyId);
  if (!billTo) return { companyId: null, companyName: null, reliable: false, message: "The invoice does not print who it is billed to, so the company cannot be confirmed from it. Check you uploaded it under the right company." };
  const flat = billTo.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hits = companies.filter((c) => {
    const key = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return key.length >= 4 && flat.includes(key);
  });
  if (hits.length === 1) {
    const hit = hits[0];
    if (hit.id === chosenCompanyId) return { companyId: hit.id, companyName: hit.name, reliable: true, message: `Billed to ${hit.name}, the company it was uploaded under.` };
    return { companyId: hit.id, companyName: hit.name, reliable: true, message: `The invoice is billed to "${billTo}" (${hit.name}), but it was uploaded under ${chosen?.name ?? "another company"}. Check the company before approving.` };
  }
  return { companyId: null, companyName: null, reliable: false, message: `Billed to "${billTo}", which is not clearly one of the companies. Choose the company yourself.` };
}

// ---------- database checks ----------

export type DuplicateHit = { kind: "same_file" | "same_invoice_no" | "same_amount_date" | "same_job_invoice_no"; message: string; supplierInvoiceId?: string; jobId?: string };

export async function findDuplicates(
  supabase: DB,
  params: { jobId: string; companyId: string; sha256: string | null; supplierId: string | null; supplierName: string | null; invoiceNumber: string | null; invoiceDate: string | null; total: number | null },
): Promise<DuplicateHit[]> {
  const hits: DuplicateHit[] = [];
  if (params.sha256) {
    const { data } = await supabase
      .from("ai_invoice_jobs")
      .select("id, original_filename, status, created_at")
      .eq("company_id", params.companyId)
      .eq("file_sha256", params.sha256)
      .neq("id", params.jobId)
      .neq("status", "rejected")
      .limit(5);
    for (const j of data ?? []) hits.push({ kind: "same_file", jobId: j.id, message: `The same file (${j.original_filename}) was already uploaded on ${j.created_at.slice(0, 10)} (${j.status.replace("_", " ")}).` });
  }
  const invNo = params.invoiceNumber ? normInvoiceNo(params.invoiceNumber) : "";
  if (params.supplierId) {
    const { data } = await supabase.from("supplier_invoices").select("id, invoice_number, invoice_date, amount").eq("company_id", params.companyId).eq("supplier_id", params.supplierId);
    for (const inv of data ?? []) {
      if (invNo && normInvoiceNo(inv.invoice_number) === invNo) {
        hits.push({ kind: "same_invoice_no", supplierInvoiceId: inv.id, message: `Invoice ${inv.invoice_number} from this supplier is already saved (${inv.invoice_date}, RM ${Number(inv.amount).toFixed(2)}).` });
        continue;
      }
      if (params.total !== null && params.invoiceDate && Math.abs(Number(inv.amount) - params.total) < 0.01) {
        const days = Math.abs(Date.parse(inv.invoice_date) - Date.parse(params.invoiceDate)) / 86_400_000;
        if (days <= 3) hits.push({ kind: "same_amount_date", supplierInvoiceId: inv.id, message: `Invoice ${inv.invoice_number} from this supplier has the same amount (RM ${Number(inv.amount).toFixed(2)}) and a date ${days === 0 ? "on the same day" : `${days} day${days === 1 ? "" : "s"} apart`}.` });
      }
    }
  }
  if (invNo) {
    const { data } = await supabase
      .from("ai_invoice_jobs")
      .select("id, supplier_name, invoice_number, status, original_filename")
      .eq("company_id", params.companyId)
      .neq("id", params.jobId)
      .in("status", ["extracted", "needs_review", "duplicate", "approved", "processing"])
      .not("invoice_number", "is", null)
      .limit(500);
    for (const j of data ?? []) {
      if (!j.invoice_number || normInvoiceNo(j.invoice_number) !== invNo) continue;
      const sameSupplier = !params.supplierName || !j.supplier_name || similarity(normName(j.supplier_name), normName(params.supplierName)) >= 0.7;
      if (sameSupplier && !hits.some((h) => h.jobId === j.id)) hits.push({ kind: "same_job_invoice_no", jobId: j.id, message: `Invoice ${j.invoice_number} of ${j.supplier_name ?? "the same supplier"} is already in the AI invoice list (${j.original_filename}, ${j.status.replace("_", " ")}).` });
    }
  }
  return hits;
}

export type PoLineDiff = { line: string; poLine: string | null; issue: string };
export type PoMatch = {
  purchaseOrderId: string | null;
  poNumber: string | null;
  how: "po_number" | "supplier_amount" | null;
  matched: boolean;
  differences: PoLineDiff[];
  summary: string;
  candidates: { id: string; po_number: string; order_date: string; total_amount: number | null }[];
};

/** Finds the purchase order of this invoice and lists every difference. A difference is never approved automatically. */
export async function matchPurchaseOrder(
  supabase: DB,
  params: { companyId: string; supplierId: string | null; poNumber: string | null; invoiceDate: string | null; total: number | null; lines: InvoiceLine[]; chosenPoId?: string | null },
): Promise<PoMatch> {
  const empty: PoMatch = { purchaseOrderId: null, poNumber: null, how: null, matched: false, differences: [], summary: "", candidates: [] };
  let po: { id: string; po_number: string; supplier_id: string; total_amount: number | null; order_date: string } | null = null;
  let how: PoMatch["how"] = null;

  if (params.chosenPoId) {
    const { data } = await supabase.from("purchase_orders").select("id, po_number, supplier_id, total_amount, order_date").eq("id", params.chosenPoId).maybeSingle();
    if (data) {
      po = data;
      how = "po_number";
    }
  }
  if (!po && params.poNumber) {
    const wanted = normInvoiceNo(params.poNumber);
    const { data } = await supabase.from("purchase_orders").select("id, po_number, supplier_id, total_amount, order_date").eq("company_id", params.companyId).limit(1000);
    po = (data ?? []).find((p) => normInvoiceNo(p.po_number) === wanted) ?? null;
    if (po) how = "po_number";
    else empty.summary = `PO ${params.poNumber} printed on the invoice is not in the system.`;
  }
  // candidates: the supplier's recent orders (shown for the reviewer to choose; never linked automatically)
  if (params.supplierId) {
    const { data } = await supabase
      .from("purchase_orders")
      .select("id, po_number, total_amount, order_date")
      .eq("company_id", params.companyId)
      .eq("supplier_id", params.supplierId)
      .order("order_date", { ascending: false })
      .limit(10);
    empty.candidates = (data ?? []).map((p) => ({ ...p, total_amount: p.total_amount === null ? null : Number(p.total_amount) }));
  }
  if (!po) {
    if (!empty.summary) empty.summary = params.poNumber ? "" : empty.candidates.length ? "No PO number is printed. Choose the purchase order if this invoice has one." : "No PO number is printed and this supplier has no purchase orders.";
    return empty;
  }

  const differences: PoLineDiff[] = [];
  if (params.supplierId && po.supplier_id !== params.supplierId) differences.push({ line: "Supplier", poLine: null, issue: "The purchase order is for a different supplier." });
  const { data: poItems } = await supabase.from("purchase_order_items").select("id, item_name, quantity, unit_price, line_total, unit").eq("purchase_order_id", po.id);
  const remaining = [...(poItems ?? [])];
  for (const l of params.lines) {
    if (!l.description) continue;
    let bestIdx = -1;
    let bestSim = 0;
    remaining.forEach((pi, i) => {
      const s = similarity(normName(pi.item_name), normName(l.description ?? ""));
      if (s > bestSim) {
        bestSim = s;
        bestIdx = i;
      }
    });
    if (bestIdx < 0 || bestSim < 0.5) {
      differences.push({ line: l.description, poLine: null, issue: "Not on the purchase order." });
      continue;
    }
    const pi = remaining.splice(bestIdx, 1)[0];
    const qPo = Number(pi.quantity);
    const pPo = Number(pi.unit_price);
    if (l.quantity !== null && Math.abs(l.quantity - qPo) > 0.0001) differences.push({ line: l.description, poLine: pi.item_name, issue: `Quantity ${l.quantity} on the invoice, ${qPo} on the PO.` });
    if (l.unit_price !== null && Math.abs(l.unit_price - pPo) > 0.0001) differences.push({ line: l.description, poLine: pi.item_name, issue: `Unit price ${l.unit_price} on the invoice, ${pPo} on the PO.` });
  }
  for (const pi of remaining) differences.push({ line: "—", poLine: pi.item_name, issue: "On the purchase order but not on the invoice." });
  if (params.total !== null && po.total_amount !== null && Math.abs(Number(po.total_amount) - params.total) > 0.05) {
    differences.push({ line: "Total", poLine: null, issue: `Invoice total ${params.total.toFixed(2)}, PO total ${Number(po.total_amount).toFixed(2)}.` });
  }
  return {
    purchaseOrderId: po.id,
    poNumber: po.po_number,
    how,
    matched: differences.length === 0,
    differences,
    summary: differences.length === 0 ? `Matches purchase order ${po.po_number}: supplier, items, quantities, prices and total.` : `${differences.length} difference${differences.length === 1 ? "" : "s"} with purchase order ${po.po_number}.`,
    candidates: empty.candidates,
  };
}

export type InvoiceChecks = {
  validation: Check[];
  duplicates: DuplicateHit[];
  supplier: SupplierMatch;
  company: CompanyMatch;
  po: PoMatch;
  lowConfidenceFields: string[];
};

export function lowConfidenceFields(inv: CanonicalInvoice): string[] {
  return Object.entries(inv.fields)
    .filter(([, f]) => f && (f.status === "unreadable" || (f.status === "found" && f.confidence === "low")))
    .map(([k]) => k);
}
