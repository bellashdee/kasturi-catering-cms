import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiInvoiceJobRow, Database, Json } from "@/lib/supabase/types";
import { ExtractionError } from "@/lib/extraction/errors";
import { ensureDocumentMarkdown } from "@/lib/documents/markdown";
import { detectFormat, sha256Hex } from "./detect";
import { adapterFor, readInvoice } from "./reader";
import { getInvoiceReaderProvider } from "./providers";
import { findDuplicates, lowConfidenceFields, matchCompany, matchPurchaseOrder, matchSupplier, validateInvoice, type InvoiceChecks } from "./checks";
import type { CanonicalInvoice, InvoiceHeader, InvoiceLine } from "./schema";

type DB = SupabaseClient<Database>;

/** The reviewer's working copy of an invoice (what the review screen edits and what is saved on approval). */
export type EditedInvoice = {
  header: InvoiceHeader;
  lines: InvoiceLine[];
  supplierId: string | null;
  purchaseOrderId: string | null;
  autoCountInvoiceNo: string | null;
  department: string | null;
  remarks: string | null;
};

export type StoredChecks = InvoiceChecks & { checkedAt: string };

/** Errors worth trying again later (busy / slow AI, network); the others need a person (bad file, unsupported...). */
const RETRYABLE = new Set(["ai_busy", "ai_timeout", "ai_failed", "ai_empty", "ai_parse_failed", "download_failed", "unexpected", "worker_stopped"]);

export async function logJobEvent(supabase: DB, job: { id: string; company_id: string }, action: string, details?: Record<string, unknown>) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("ai_invoice_events").insert({ job_id: job.id, company_id: job.company_id, action, actor: auth.user?.id ?? null, details: (details ?? null) as Json });
  if (error) console.warn("ai_invoice_events insert failed", action, error.message);
}

/** Supplier, company, duplicate, PO and figure checks for the current values. Run after reading, after each edit and on approval. */
export async function computeChecks(supabase: DB, job: Pick<AiInvoiceJobRow, "id" | "company_id" | "file_sha256">, edited: EditedInvoice, fields: CanonicalInvoice["fields"]): Promise<StoredChecks> {
  const [{ data: suppliers }, { data: companies }, { data: counts }] = await Promise.all([
    supabase.from("suppliers").select("id, name, registration_no").eq("company_id", job.company_id),
    supabase.from("companies").select("id, name"),
    supabase.from("supplier_invoices").select("supplier_id").eq("company_id", job.company_id).limit(5000),
  ]);
  const invoiceCounts = new Map<string, number>();
  for (const r of counts ?? []) invoiceCounts.set(r.supplier_id, (invoiceCounts.get(r.supplier_id) ?? 0) + 1);

  const h = edited.header;
  const supplier = matchSupplier(suppliers ?? [], invoiceCounts, typeof h.supplier_name === "string" ? h.supplier_name : null, typeof h.supplier_registration_no === "string" ? h.supplier_registration_no : null);
  const supplierId = edited.supplierId ?? (supplier.reliable ? supplier.best?.id ?? null : null);
  const total = typeof h.total_amount === "number" ? h.total_amount : null;
  const invoiceDate = typeof h.invoice_date === "string" ? h.invoice_date : null;
  const [duplicates, po] = await Promise.all([
    findDuplicates(supabase, {
      jobId: job.id,
      companyId: job.company_id,
      sha256: job.file_sha256,
      supplierId,
      supplierName: typeof h.supplier_name === "string" ? h.supplier_name : null,
      invoiceNumber: typeof h.invoice_number === "string" ? h.invoice_number : null,
      invoiceDate,
      total,
    }),
    matchPurchaseOrder(supabase, { companyId: job.company_id, supplierId, poNumber: typeof h.po_number === "string" ? h.po_number : null, invoiceDate, total, lines: edited.lines, chosenPoId: edited.purchaseOrderId }),
  ]);
  return {
    validation: validateInvoice(h, edited.lines),
    duplicates,
    supplier,
    company: matchCompany(companies ?? [], typeof h.bill_to_name === "string" ? h.bill_to_name : null, job.company_id),
    po,
    lowConfidenceFields: lowConfidenceFields({ header: h, lines: edited.lines, fields, chatText: null, isChatScreenshot: false, issues: [] }),
    checkedAt: new Date().toISOString(),
  };
}

/** Status after reading / editing: duplicates first, then anything that needs a person's eye, else read cleanly. */
export function statusFor(checks: StoredChecks, readerNeedsReview: boolean, duplicateOverride: boolean): AiInvoiceJobRow["status"] {
  if (checks.duplicates.length > 0 && !duplicateOverride) return "duplicate";
  const flagged =
    readerNeedsReview ||
    checks.validation.some((c) => !c.ok && c.severity !== "info") ||
    checks.lowConfidenceFields.length > 0 ||
    !checks.supplier.reliable ||
    !checks.company.reliable ||
    (checks.company.companyId !== null && checks.company.message.includes("but it was uploaded under")) ||
    (checks.po.purchaseOrderId !== null && !checks.po.matched) ||
    (!!checks.po.summary && checks.po.summary.includes("is not in the system"));
  return flagged ? "needs_review" : "extracted";
}

export function searchColumns(edited: EditedInvoice) {
  const h = edited.header;
  return {
    supplier_name: typeof h.supplier_name === "string" ? h.supplier_name : null,
    invoice_number: typeof h.invoice_number === "string" ? h.invoice_number : null,
    invoice_date: typeof h.invoice_date === "string" ? h.invoice_date : null,
    total_amount: typeof h.total_amount === "number" ? h.total_amount : null,
    po_number: typeof h.po_number === "string" ? h.po_number : null,
    event_reference: edited.autoCountInvoiceNo ?? (typeof h.event_reference === "string" ? h.event_reference : null),
    matched_supplier_id: edited.supplierId,
    purchase_order_id: edited.purchaseOrderId,
  };
}

export type ProcessOutcome = { jobId: string; status: AiInvoiceJobRow["status"]; again: boolean; message?: string };

/** Reads one claimed job end to end. Every outcome (done, failed, retry later) is written to the job and its audit trail. */
export async function processClaimedJob(supabase: DB, job: AiInvoiceJobRow, requestStartedAt: number): Promise<ProcessOutcome> {
  const fail = async (err: ExtractionError) => {
    const retry = RETRYABLE.has(err.code) && job.attempts < job.max_attempts;
    const delaySec = 30 * 2 ** Math.max(job.attempts - 1, 0);
    const status = retry ? "queued" : "failed";
    await supabase
      .from("ai_invoice_jobs")
      .update({
        status,
        locked_at: null,
        error_code: err.code,
        error_message: err.message,
        error_recovery: err.recovery,
        next_attempt_at: new Date(Date.now() + (retry ? delaySec * 1000 : 0)).toISOString(),
      })
      .eq("id", job.id);
    await logJobEvent(supabase, job, retry ? "retry_scheduled" : "failed", { code: err.code, message: err.message, attempt: job.attempts, retryInSeconds: retry ? delaySec : null });
    return { jobId: job.id, status, again: false, message: err.message } as ProcessOutcome;
  };

  try {
    const { data: doc, error: docError } = await supabase.from("documents").select("id, storage_path, original_filename, markdown_status").eq("id", job.document_id).single();
    if (docError || !doc) return fail(new ExtractionError("download_failed", "The uploaded file's record could not be found.", "Upload the file again.", 500));
    const { data: blob, error: dlError } = await supabase.storage.from("documents").download(doc.storage_path);
    if (dlError || !blob) return fail(new ExtractionError("download_failed", "The uploaded file could not be retrieved from storage.", "Try again in a minute; if it keeps failing, upload the file again.", 500));
    const buffer = await blob.arrayBuffer();
    if (buffer.byteLength === 0) return fail(new ExtractionError("empty_file", "The file is empty (0 bytes).", "Upload the file again — the original may not have copied properly."));

    // the server decides what the file is (the browser's guess is not trusted), and fingerprints it
    const detected = detectFormat(new Uint8Array(buffer), doc.original_filename);
    const sha = await sha256Hex(buffer);
    if (job.file_sha256 !== sha || job.detected_format !== detected.format) {
      await supabase.from("ai_invoice_jobs").update({ file_sha256: sha, detected_format: detected.format, detected_mime: detected.mime, file_size: buffer.byteLength }).eq("id", job.id);
      job.file_sha256 = sha;
    }
    if (detected.format === "unsupported") {
      return fail(new ExtractionError("unsupported_file", `"${doc.original_filename}" is not a PDF, image, XML, Excel or Word file (its content was checked, not only its name).`, "Upload a PDF, photo / screenshot, XML e-invoice, Excel or Word file."));
    }

    // Word: the text is taken out first (MarkItDown) in its own step, so neither step runs past the time limit
    const adapter = adapterFor(detected.format);
    let markdown: string | null = null;
    if (adapter?.needsMarkdown) {
      if (doc.markdown_status !== "done" && doc.markdown_status !== "failed") {
        const outcome = await ensureDocumentMarkdown(supabase, doc.id);
        await logJobEvent(supabase, job, "text_extracted", { status: outcome.status, note: outcome.note });
        await supabase.from("ai_invoice_jobs").update({ status: "queued", locked_at: null, attempts: Math.max(job.attempts - 1, 0) }).eq("id", job.id);
        return { jobId: job.id, status: "queued", again: true };
      }
      const { data: md } = await supabase.from("documents").select("markdown_text").eq("id", doc.id).single();
      markdown = md?.markdown_text ?? null;
    }

    await logJobEvent(supabase, job, "processing_started", { attempt: job.attempts, format: detected.format, extensionMismatch: detected.extensionMismatch });
    const read = await readInvoice({ buffer, filename: doc.original_filename, detected, markdown, provider: getInvoiceReaderProvider(), requestStartedAt });
    const inv = read.invoice;
    if (detected.extensionMismatch) inv.issues.unshift(detected.extensionMismatch);

    const edited: EditedInvoice = { header: { ...inv.header }, lines: inv.lines.map((l) => ({ ...l })), supplierId: null, purchaseOrderId: null, autoCountInvoiceNo: null, department: null, remarks: null };
    const checks = await computeChecks(supabase, job, edited, inv.fields);
    if (checks.supplier.reliable && checks.supplier.best) edited.supplierId = checks.supplier.best.id;
    if (checks.po.purchaseOrderId && checks.po.how === "po_number") edited.purchaseOrderId = checks.po.purchaseOrderId;

    const readerNeedsReview = (read.report?.needsReview ?? false) || inv.issues.length > 0;
    const status = statusFor(checks, readerNeedsReview, false);
    const report = {
      format: detected.format,
      legibility: read.report?.legibility ?? (read.provider === "xml" ? "good" : "unknown"),
      inspection: read.report?.inspection ?? null,
      pages: read.report?.pages ?? [],
      documentType: read.report?.documentTypeLabel ?? (read.provider === "xml" ? "E-invoice (XML)" : null),
      typeWarning: read.report?.typeWarning ?? null,
      issues: inv.issues,
      fields: inv.fields,
      chatText: inv.chatText,
      isChatScreenshot: inv.isChatScreenshot,
      readerNeedsReview,
      valuesWithheld: read.report?.valuesWithheld ?? false,
    };
    const original = { provider: read.provider, model: read.model, readAt: new Date().toISOString(), raw: read.raw, header: inv.header, lines: inv.lines };

    const { error: upError } = await supabase
      .from("ai_invoice_jobs")
      .update({
        status,
        locked_at: null,
        provider: read.provider,
        model: read.model,
        original: original as unknown as Json,
        edited: edited as unknown as Json,
        report: report as unknown as Json,
        checks: checks as unknown as Json,
        needs_review: status !== "extracted",
        ...searchColumns(edited),
      })
      .eq("id", job.id);
    if (upError) throw upError;
    await logJobEvent(supabase, job, "extracted", { status, provider: read.provider, model: read.model, lines: inv.lines.length, duplicates: checks.duplicates.length, ms: Date.now() - requestStartedAt });
    return { jobId: job.id, status, again: false };
  } catch (err) {
    if (err instanceof ExtractionError) return fail(err);
    const message = err instanceof Error ? err.message : String(err);
    return fail(new ExtractionError("unexpected", `Reading failed unexpectedly (${message.slice(0, 200)}).`, "It will be tried again automatically; if it keeps failing, enter the invoice manually.", 500));
  }
}
