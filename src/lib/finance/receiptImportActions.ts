"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { isModuleEditor } from "@/lib/moduleAccess";
import { confirmedPaymentDate } from "@/lib/format";
import { inspectFile } from "@/lib/extraction/inspect";
import { ExtractionError } from "@/lib/extraction/errors";
import { geminiGenerate, getAiProvider } from "@/lib/ai/gemini";
import { looksLikeReceiptListing, parseReceiptListing, type ListingReceipt, type ParsedListing } from "@/lib/finance/receiptListing";
import type { Database } from "@/lib/supabase/types";
import { cents, matchReceipts, normName, type Allocation, type InvoiceStatus, type OpenInvoice, type ReceiptCustomer, type ReviewReceipt } from "@/lib/finance/receiptMatch";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Invoices that can still take a payment (quotation requests waiting for review and drafts are not invoices yet). */
const NOT_PAYABLE: InvoiceStatus[] = ["paid", "draft", "pending_review"];
const MAX_BYTES = 950 * 1024;

export type ReadReceiptsResult = {
  fileName: string;
  companyId: string;
  companyName: string;
  listing: Omit<ParsedListing, "receipts">;
  readBy: "text" | "ai";
  receipts: ReviewReceipt[];
  customers: ReceiptCustomer[];
  invoices: OpenInvoice[];
  warnings: string[];
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You are signed out. Sign in again and retry.");
  return { supabase, userId: user.id };
}

/** The AI reader, only for a scanned (image-only) listing or one whose layout the text reader does not know. */
async function readWithAi(bytes: Uint8Array): Promise<ParsedListing> {
  if (!getAiProvider()) throw new Error("This PDF has no readable text and the AI reader is not set up. Export the listing from AutoCount again as a PDF (not a scan).");
  const text = await geminiGenerate({
    system:
      "You read an AutoCount 'AR Receive Payment Audit Trail Listing'. Return only what is printed; never guess. Dates are dd/mm/yyyy on the page; return yyyy-mm-dd.",
    turns: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
          {
            text:
              'Return JSON {"companyName": string|null, "periodFrom": "yyyy-mm-dd"|null, "periodTo": "yyyy-mm-dd"|null, "reportTotal": number|null, "receipts": [{"date": "yyyy-mm-dd", "docNo": string, "accountCode": string, "customerName": string, "currency": string, "amount": number, "bankAccount": string|null}]}. One entry per receipt (the debtor line, credit amount in RM); skip RM 0.00 receipts and the summary table.',
          },
        ],
      },
    ],
    json: true,
    maxOutputTokens: 8192,
  });
  const raw = JSON.parse(text) as Partial<ParsedListing> & { receipts?: Partial<ListingReceipt>[] };
  const receipts: ListingReceipt[] = (raw.receipts ?? [])
    .filter((r) => r && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number(r.amount) > 0)
    .map((r, i) => ({
      line: i + 1,
      date: r.date as string,
      docNo: String(r.docNo ?? ""),
      docNoCut: /\/\d?$/.test(String(r.docNo ?? "")),
      accountCode: String(r.accountCode ?? "").toUpperCase(),
      customerName: String(r.customerName ?? "").trim(),
      currency: String(r.currency ?? "MYR").toUpperCase(),
      amount: cents(Number(r.amount)),
      bankAccount: r.bankAccount ? String(r.bankAccount) : null,
    }));
  return {
    companyName: raw.companyName ?? null,
    periodFrom: raw.periodFrom ?? null,
    periodTo: raw.periodTo ?? null,
    reportTotal: typeof raw.reportTotal === "number" ? raw.reportTotal : null,
    zeroSkipped: 0,
    receipts,
  };
}

async function openInvoicesOf(supabase: DB, companyId: string): Promise<OpenInvoice[]> {
  const { data, error } = await supabase
    .from("customer_invoices")
    .select("id, customer_id, invoice_number, invoice_date, amount, tax_amount, status, customer_payments(amount)")
    .eq("company_id", companyId)
    .not("status", "in", `(${NOT_PAYABLE.join(",")})`)
    .order("invoice_date", { ascending: true })
    .order("invoice_number", { ascending: true })
    .limit(2000);
  if (error) throw new Error("Could not load the invoices of the company.");
  return (data ?? [])
    .map((i) => {
      const total = cents(Number(i.amount) + Number(i.tax_amount ?? 0));
      const paid = cents(((i.customer_payments ?? []) as { amount: number }[]).reduce((t, p) => t + Number(p.amount), 0));
      return { id: i.id, customerId: i.customer_id, invoiceNumber: i.invoice_number, invoiceDate: i.invoice_date, total, paid, outstanding: cents(Math.max(0, total - paid)), status: i.status };
    })
    .filter((i) => i.outstanding > 0);
}

/** Reads one AutoCount receipt listing PDF and matches every receipt to a customer and their unpaid invoices. Nothing is saved. */
export async function readReceiptListing(formData: FormData): Promise<ActionResult<ReadReceiptsResult>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose the PDF file first.");
    if (file.size > MAX_BYTES) throw new Error("This PDF is larger than 950 KB. Print the listing for one month at a time and upload each file.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    let pageTexts: string[] = [];
    try {
      const inspected = await inspectFile({ buffer: bytes.slice().buffer, filename: file.name, fileType: "pdf", spreadsheetCharLimit: 0 });
      pageTexts = inspected.pageTexts ?? [];
    } catch (err) {
      if (err instanceof ExtractionError) throw new Error(`${err.reason} ${err.recovery}`);
      throw err;
    }

    const joined = pageTexts.join("\n");
    let listing: ParsedListing;
    let readBy: "text" | "ai" = "text";
    const warnings: string[] = [];
    if (looksLikeReceiptListing(joined)) {
      listing = parseReceiptListing(pageTexts);
    } else if (joined.replace(/\s/g, "").length > 200 && !/receive payment|receipt|OR-/i.test(joined)) {
      throw new Error("This PDF is not an AutoCount receipt listing. In AutoCount open A/R → Receive Payment → Print Audit Trail Listing (AR Receive Payment Audit Trail Listing), save it as PDF and upload that file.");
    } else {
      listing = await readWithAi(bytes);
      readBy = "ai";
      warnings.push("This PDF was read by AI (it has no text layer). Check every date, customer and amount against the paper before saving.");
    }
    if (listing.receipts.length === 0) throw new Error("No receipts were found in this PDF. Check that it is the AR Receive Payment Audit Trail Listing with at least one receipt.");

    const sum = cents(listing.receipts.reduce((t, r) => t + r.amount, 0));
    if (listing.reportTotal !== null && Math.abs(sum - listing.reportTotal) > 0.005) {
      warnings.push(`The receipts read add up to RM ${sum.toFixed(2)} but the report total is RM ${listing.reportTotal.toFixed(2)}. Some receipts may be missing — check the file.`);
    }

    // which company: the one named on the report, or the one chosen on the screen
    const { data: companies } = await supabase.from("companies").select("id, name, legal_name");
    const chosen = String(formData.get("companyId") ?? "");
    const byName = listing.companyName ? (companies ?? []).find((c) => [c.legal_name, c.name].some((n) => n && normName(n) === normName(listing.companyName as string))) : undefined;
    const company = (companies ?? []).find((c) => c.id === chosen) ?? byName;
    if (!company) throw new Error(`The company on this report (${listing.companyName ?? "not printed"}) is not one you have access to. Choose the company and upload again.`);
    if (byName && chosen && byName.id !== chosen) warnings.push(`This report is for ${listing.companyName}, not the company chosen. It was matched to ${company.name} as chosen — check that this is right.`);

    const [{ data: customerRows }, invoices] = await Promise.all([
      supabase.from("customers").select("id, name, account_code").eq("company_id", company.id).order("name").limit(3000),
      openInvoicesOf(supabase, company.id),
    ]);
    const customers: ReceiptCustomer[] = (customerRows ?? []).map((c) => ({ id: c.id, name: c.name, accountCode: c.account_code }));

    // what is already recorded in the system on the dates of this listing, per customer and day
    const dates = listing.receipts.map((r) => r.date).sort();
    const { data: recorded } = await supabase
      .from("customer_payments")
      .select("amount, payment_date, customer_invoices(customer_id)")
      .eq("company_id", company.id)
      .gte("payment_date", dates[0])
      .lte("payment_date", dates[dates.length - 1])
      .limit(5000);
    const recordedPayments = (recorded ?? []).flatMap((p) => {
      const cid = (p.customer_invoices as { customer_id: string } | null)?.customer_id;
      return cid ? [{ customerId: cid, date: p.payment_date, amount: Number(p.amount) }] : [];
    });
    const receipts = matchReceipts(listing.receipts, customers, invoices, recordedPayments);

    const { receipts: _r, ...meta } = listing;
    void _r;
    return { fileName: file.name, companyId: company.id, companyName: company.name, listing: meta, readBy, receipts, customers, invoices, warnings };
  }, "Could not read this PDF. Please try again.");
}

export type SaveReceiptItem = {
  line: number;
  date: string;
  receiptNo: string;
  accountCode: string;
  customerName: string;
  bankAccount: string | null;
  allocations: Allocation[];
};

export type SaveReceiptsResult = {
  saved: number;
  savedAmount: number;
  skipped: { line: number; reason: string }[];
  invoices: { id: string; invoiceNumber: string; status: InvoiceStatus; total: number; paid: number; outstanding: number }[];
};

/** Saves the receipts the user confirmed as customer payments, one row per invoice paid; invoice statuses are worked out again. */
export async function saveReceiptPayments(input: { companyId: string; fileName: string; items: SaveReceiptItem[] }): Promise<ActionResult<SaveReceiptsResult>> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    if (!(await isModuleEditor(supabase, input.companyId, "finance-admin"))) throw new Error("Only an admin of the company can record customer payments.");
    if (!input.items?.length) throw new Error("Tick at least one receipt to save.");

    const invoiceIds = [...new Set(input.items.flatMap((i) => i.allocations.map((a) => a.invoiceId)))];
    if (!invoiceIds.length) throw new Error("Choose the invoice each receipt pays.");
    const { data: invRows, error } = await supabase
      .from("customer_invoices")
      .select("id, company_id, invoice_number, amount, tax_amount, status, customer_payments(amount, payment_date)")
      .in("id", invoiceIds);
    if (error) throw new Error("Could not load the invoices.");
    const inv = new Map((invRows ?? []).map((i) => [i.id, i]));
    const left = new Map(
      (invRows ?? []).map((i) => [i.id, cents(Number(i.amount) + Number(i.tax_amount ?? 0) - ((i.customer_payments ?? []) as { amount: number }[]).reduce((t, p) => t + Number(p.amount), 0))]),
    );

    const skipped: SaveReceiptsResult["skipped"] = [];
    const rows: Database["public"]["Tables"]["customer_payments"]["Insert"][] = [];
    const touched = new Set<string>();
    for (const item of input.items) {
      let date: string;
      try {
        date = confirmedPaymentDate(item.date);
      } catch (e) {
        skipped.push({ line: item.line, reason: e instanceof Error ? e.message : "The date is not valid." });
        continue;
      }
      const allocations = item.allocations.filter((a) => a.invoiceId && Number(a.amount) > 0).map((a) => ({ invoiceId: a.invoiceId, amount: cents(Number(a.amount)) }));
      if (!allocations.length) {
        skipped.push({ line: item.line, reason: "No invoice was chosen." });
        continue;
      }
      const problem = allocations
        .map((a) => {
          const i = inv.get(a.invoiceId);
          if (!i || i.company_id !== input.companyId) return "an invoice chosen is not of this company";
          if (NOT_PAYABLE.includes(i.status) && i.status !== "paid") return `${i.invoice_number} is not an issued invoice yet`;
          const same = ((i.customer_payments ?? []) as { amount: number; payment_date: string }[]).some((p) => p.payment_date === date && Math.abs(Number(p.amount) - a.amount) < 0.005);
          if (same) return `RM ${a.amount.toFixed(2)} on ${date} is already recorded on ${i.invoice_number}`;
          if (a.amount > (left.get(a.invoiceId) ?? 0) + 0.005) return `RM ${a.amount.toFixed(2)} is more than what is still owed on ${i.invoice_number} (RM ${Math.max(0, left.get(a.invoiceId) ?? 0).toFixed(2)})`;
          return null;
        })
        .find(Boolean);
      if (problem) {
        skipped.push({ line: item.line, reason: problem.charAt(0).toUpperCase() + problem.slice(1) + "." });
        continue;
      }
      const remarks = [`AutoCount receipt listing (${input.fileName})`, item.accountCode && `${item.accountCode} ${item.customerName}`.trim(), item.bankAccount && `into ${item.bankAccount}`]
        .filter(Boolean)
        .join(" · ");
      for (const a of allocations) {
        left.set(a.invoiceId, cents((left.get(a.invoiceId) ?? 0) - a.amount));
        touched.add(a.invoiceId);
        rows.push({
          company_id: input.companyId,
          customer_invoice_id: a.invoiceId,
          amount: a.amount,
          payment_date: date,
          payment_reference: item.receiptNo?.trim() || null,
          payment_remarks: remarks.slice(0, 500),
          recorded_by: userId,
        });
      }
    }

    if (rows.length) {
      const { error: insertError } = await supabase.from("customer_payments").insert(rows);
      if (insertError) throw insertError;
      for (const r of rows) {
        await recordAudit({
          companyId: input.companyId,
          relatedTable: "customer_invoices",
          relatedId: r.customer_invoice_id,
          action: "payment_recorded",
          newValue: `RM ${Number(r.amount).toFixed(2)} on ${r.payment_date}${r.payment_reference ? ` · ${r.payment_reference}` : ""} (from AutoCount receipt PDF)`,
        });
      }
    }

    // invoice status from what is now paid — the same rule as a payment keyed in on the invoice
    const invoices: SaveReceiptsResult["invoices"] = [];
    if (touched.size) {
      const { data: after } = await supabase.from("customer_invoices").select("id, invoice_number, amount, tax_amount, status, customer_payments(amount)").in("id", [...touched]);
      for (const i of after ?? []) {
        const total = cents(Number(i.amount) + Number(i.tax_amount ?? 0));
        const paid = cents(((i.customer_payments ?? []) as { amount: number }[]).reduce((t, p) => t + Number(p.amount), 0));
        const status: InvoiceStatus = paid >= total && total > 0 ? "paid" : paid > 0 ? "partially_paid" : "issued";
        if (status !== i.status) await supabase.from("customer_invoices").update({ status }).eq("id", i.id);
        invoices.push({ id: i.id, invoiceNumber: i.invoice_number, status, total, paid, outstanding: cents(Math.max(0, total - paid)) });
      }
      invoices.sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
    }

    revalidatePath("/finance/invoices");
    for (const id of touched) revalidatePath(`/finance/invoices/${id}`);
    revalidatePath("/finance/outstanding");
    revalidatePath("/finance/payment-proofs");
    revalidatePath("/reports", "layout");
    revalidatePath("/");
    return { saved: rows.length, savedAmount: cents(rows.reduce((t, r) => t + Number(r.amount), 0)), skipped, invoices };
  }, "Could not save the payments. Please try again.");
}
