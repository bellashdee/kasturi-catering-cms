"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { createSupplierInvoice } from "@/lib/procurement/actions";
import type { AiInvoiceJobRow, Json } from "@/lib/supabase/types";
import { HEADER_FIELDS, REQUIRED_FOR_APPROVAL, FIELD_LABEL, type CanonicalInvoice } from "./schema";
import { computeChecks, logJobEvent, searchColumns, statusFor, type EditedInvoice, type StoredChecks } from "./process";

const PATH = "/supplier-procurement/ai-invoices";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

async function loadJob(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string): Promise<AiInvoiceJobRow> {
  const { data, error } = await supabase.from("ai_invoice_jobs").select("*").eq("id", jobId).single();
  if (error || !data) throw new Error("This invoice could not be found (or you do not have access to it).");
  return data;
}

const fieldsOf = (job: AiInvoiceJobRow) => (((job.report as { fields?: CanonicalInvoice["fields"] } | null)?.fields) ?? {}) as CanonicalInvoice["fields"];

/**
 * Registers an uploaded file as a job waiting for the AI reader. The same device sending the same outbox item twice (after
 * reconnecting) gets the first job back. Warns, never blocks, when the same file was uploaded before.
 */
export async function registerAiInvoiceUpload(input: {
  companyId: string;
  documentId: string;
  filename: string;
  sha256: string | null;
  size: number;
  detectedFormat: string;
  mime: string;
  clientUploadId?: string | null;
}): Promise<ActionResult<{ jobId: string; sameFileJobs: { id: string; filename: string; status: string; createdAt: string }[] }>> {
  return runAction(async () => {
    const { supabase, userId } = await signedIn();
    if (input.clientUploadId) {
      const { data: existing } = await supabase.from("ai_invoice_jobs").select("id").eq("created_by", userId).eq("client_upload_id", input.clientUploadId).maybeSingle();
      if (existing) return { jobId: existing.id, sameFileJobs: [] };
    }
    const sameFile = input.sha256
      ? (await supabase.from("ai_invoice_jobs").select("id, original_filename, status, created_at").eq("company_id", input.companyId).eq("file_sha256", input.sha256).neq("status", "rejected").limit(5)).data ?? []
      : [];
    const { data, error } = await supabase
      .from("ai_invoice_jobs")
      .insert({
        company_id: input.companyId,
        document_id: input.documentId,
        original_filename: input.filename,
        file_sha256: input.sha256,
        file_size: input.size,
        detected_format: input.detectedFormat,
        detected_mime: input.mime,
        client_upload_id: input.clientUploadId ?? null,
        status: "queued",
      })
      .select("id, company_id")
      .single();
    if (error) throw error;
    await logJobEvent(supabase, data, "uploaded", { filename: input.filename, format: input.detectedFormat, size: input.size, sameFileAs: sameFile.map((j) => j.id), offlineQueued: !!input.clientUploadId });
    revalidatePath(PATH);
    return { jobId: data.id, sameFileJobs: sameFile.map((j) => ({ id: j.id, filename: j.original_filename, status: j.status, createdAt: j.created_at })) };
  }, "Could not add the invoice to the reading queue.");
}

const EDITABLE: AiInvoiceJobRow["status"][] = ["extracted", "needs_review", "duplicate"];

/** Saves the reviewer's corrections (the reading of the file itself is kept unchanged) and runs every check again. */
export async function saveAiInvoiceEdits(jobId: string, edited: EditedInvoice): Promise<ActionResult<{ status: AiInvoiceJobRow["status"]; checks: StoredChecks }>> {
  return runAction(async () => {
    const { supabase, userId } = await signedIn();
    const job = await loadJob(supabase, jobId);
    if (!EDITABLE.includes(job.status)) throw new Error(`This invoice is ${job.status.replace("_", " ")} and can no longer be edited.`);
    const before = (job.edited ?? null) as EditedInvoice | null;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of HEADER_FIELDS) {
      const a = before?.header?.[f] ?? null;
      const b = edited.header[f] ?? null;
      if (a !== b) changes[f] = { from: a, to: b };
    }
    if (JSON.stringify(before?.lines ?? []) !== JSON.stringify(edited.lines)) changes.lines = { from: before?.lines?.length ?? 0, to: edited.lines.length };
    for (const k of ["supplierId", "purchaseOrderId", "autoCountInvoiceNo", "department", "remarks"] as const) {
      if ((before?.[k] ?? null) !== (edited[k] ?? null)) changes[k] = { from: before?.[k] ?? null, to: edited[k] ?? null };
    }
    const checks = await computeChecks(supabase, job, edited, fieldsOf(job));
    const readerNeedsReview = !!(job.report as { readerNeedsReview?: boolean } | null)?.readerNeedsReview;
    // a person has now looked at every value: the reader's own doubts no longer hold the invoice in review once all is consistent
    const status = statusFor(checks, readerNeedsReview && Object.keys(changes).length === 0, job.duplicate_override);
    const { error } = await supabase
      .from("ai_invoice_jobs")
      .update({ edited: edited as unknown as Json, checks: checks as unknown as Json, status, needs_review: status !== "extracted", reviewed_by: userId, ...searchColumns(edited) })
      .eq("id", jobId);
    if (error) throw error;
    if (Object.keys(changes).length) await logJobEvent(supabase, job, "edited", { changes });
    revalidatePath(PATH);
    return { status, checks };
  }, "Could not save the changes.");
}

/**
 * The only way an AI-read invoice reaches the accounts: a person approves it. It is saved as a supplier invoice exactly as
 * reviewed (event costing / Event P&L through the AutoCount invoice no.; suppliers are paid by the monthly payment voucher).
 */
export async function approveAiInvoice(
  jobId: string,
  edited: EditedInvoice,
  confirm: { warnings: boolean; poDifferences: boolean },
): Promise<ActionResult<{ supplierInvoiceId: string }>> {
  return runAction(async () => {
    const { supabase, userId } = await signedIn();
    const job = await loadJob(supabase, jobId);
    if (job.status === "approved") throw new Error("This invoice was already approved.");
    if (!EDITABLE.includes(job.status)) throw new Error(`This invoice is ${job.status.replace("_", " ")} and cannot be approved.`);

    const h = edited.header;
    const missing = REQUIRED_FOR_APPROVAL.filter((f) => h[f] === null || h[f] === "").map((f) => FIELD_LABEL[f]);
    if (missing.length) throw new Error(`Fill in ${missing.join(", ")} from the invoice before approving.`);
    if (!edited.supplierId) throw new Error("Choose the supplier from the supplier list before approving.");
    if (typeof h.total_amount !== "number") throw new Error("The grand total must be a number.");
    for (const [n, l] of edited.lines.entries()) {
      if (!l.description || l.quantity === null || l.unit_price === null || l.line_total === null) {
        throw new Error(`Line ${n + 1}: fill in the description, quantity, unit price and amount exactly as on the invoice (or remove the line).`);
      }
    }

    // fresh checks at the moment of approval (another invoice may have been saved meanwhile)
    const checks = await computeChecks(supabase, job, edited, fieldsOf(job));
    if (checks.duplicates.length && !job.duplicate_override) throw new Error("This invoice may be a duplicate. Open the duplicate warning and confirm it is not one before approving.");
    const hardDuplicate = checks.duplicates.find((d) => d.kind === "same_invoice_no");
    if (hardDuplicate) throw new Error(`${hardDuplicate.message} It cannot be saved twice.`);
    const problems = checks.validation.filter((c) => !c.ok && c.severity !== "info");
    if ((problems.length || checks.lowConfidenceFields.length || !checks.company.reliable) && !confirm.warnings) {
      throw new Error("Some checks need attention. Tick that you have checked them against the original invoice.");
    }
    if (checks.po.purchaseOrderId && !checks.po.matched && !confirm.poDifferences) {
      throw new Error("The invoice differs from its purchase order. Tick that you have checked the differences.");
    }

    const result = await createSupplierInvoice({
      companyId: job.company_id,
      supplierId: edited.supplierId,
      invoiceNumber: String(h.invoice_number),
      invoiceDate: String(h.invoice_date),
      dueDate: String(h.due_date),
      amount: h.total_amount,
      department: edited.department ?? undefined,
      autoCountInvoiceNo: edited.autoCountInvoiceNo ?? undefined,
      remarks: edited.remarks ?? undefined,
      documentId: job.document_id,
      items: edited.lines.map((l) => ({
        itemCode: l.item_code ?? undefined,
        itemName: l.description as string,
        uom: l.unit ?? undefined,
        quantity: l.quantity as number,
        unitPrice: l.unit_price as number,
        discount: l.discount ?? undefined,
        lineTotal: l.line_total as number,
      })),
    });
    if (!result.ok) throw new Error(result.error);
    if (edited.purchaseOrderId) await supabase.from("supplier_invoices").update({ purchase_order_id: edited.purchaseOrderId }).eq("id", result.id);

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("ai_invoice_jobs")
      .update({ status: "approved", needs_review: false, approved_by: userId, approved_at: now, reviewed_by: userId, supplier_invoice_id: result.id, edited: edited as unknown as Json, checks: checks as unknown as Json, ...searchColumns(edited) })
      .eq("id", jobId);
    if (error) throw error;
    await logJobEvent(supabase, job, "approved", {
      supplierInvoiceId: result.id,
      confirmedWarnings: confirm.warnings ? problems.map((p) => p.message) : [],
      confirmedPoDifferences: confirm.poDifferences ? checks.po.differences : [],
    });
    revalidatePath(PATH);
    revalidatePath("/supplier-procurement/invoices");
    return { supplierInvoiceId: result.id };
  }, "Could not approve the invoice.");
}

export async function rejectAiInvoice(jobId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await signedIn();
    if (!reason.trim()) throw new Error("Write why the invoice is rejected.");
    const job = await loadJob(supabase, jobId);
    if (job.status === "approved") throw new Error("An approved invoice cannot be rejected here; correct the saved supplier invoice instead.");
    const { error } = await supabase.from("ai_invoice_jobs").update({ status: "rejected", rejected_by: userId, rejected_at: new Date().toISOString(), reject_reason: reason.trim(), locked_at: null }).eq("id", jobId);
    if (error) throw error;
    await logJobEvent(supabase, job, "rejected", { reason: reason.trim() });
    revalidatePath(PATH);
    return {};
  }, "Could not reject the invoice.");
}

/** Sends the file through the reader again (a fresh reading; the previous one is kept in the audit trail). */
export async function reprocessAiInvoice(jobId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await signedIn();
    const job = await loadJob(supabase, jobId);
    if (job.status === "approved") throw new Error("An approved invoice cannot be read again.");
    if (job.status === "processing") throw new Error("This invoice is being read right now.");
    const { error } = await supabase
      .from("ai_invoice_jobs")
      .update({ status: "queued", attempts: 0, next_attempt_at: new Date().toISOString(), error_code: null, error_message: null, error_recovery: null, locked_at: null, duplicate_override: false })
      .eq("id", jobId);
    if (error) throw error;
    await logJobEvent(supabase, job, "reprocess_requested", { previousStatus: job.status, previousModel: job.model, previousReading: job.original });
    revalidatePath(PATH);
    return {};
  }, "Could not send the invoice for reading again.");
}

/** The reviewer confirms a duplicate warning is wrong (the warning and this decision stay in the audit trail). */
export async function overrideAiInvoiceDuplicate(jobId: string, reason: string): Promise<ActionResult<{ status: AiInvoiceJobRow["status"] }>> {
  return runAction(async () => {
    const { supabase } = await signedIn();
    if (!reason.trim()) throw new Error("Write why this is not a duplicate.");
    const job = await loadJob(supabase, jobId);
    const checks = job.checks as unknown as StoredChecks | null;
    if (checks?.duplicates.some((d) => d.kind === "same_invoice_no")) throw new Error("An invoice with this number from this supplier is already saved, so it cannot be saved again.");
    const readerNeedsReview = !!(job.report as { readerNeedsReview?: boolean } | null)?.readerNeedsReview;
    const status = checks ? statusFor(checks, readerNeedsReview, true) : "needs_review";
    const { error } = await supabase.from("ai_invoice_jobs").update({ duplicate_override: true, status }).eq("id", jobId);
    if (error) throw error;
    await logJobEvent(supabase, job, "duplicate_overridden", { reason: reason.trim(), warnings: checks?.duplicates.map((d) => d.message) ?? [] });
    revalidatePath(PATH);
    return { status };
  }, "Could not save the decision.");
}

/** A short-lived link to the original file for the review screen (the bucket is private). */
export async function aiInvoiceFileUrl(jobId: string): Promise<ActionResult<{ url: string; text: string | null }>> {
  return runAction(async () => {
    const { supabase } = await signedIn();
    const job = await loadJob(supabase, jobId);
    const { data: doc } = await supabase.from("documents").select("storage_path, markdown_text").eq("id", job.document_id).single();
    if (!doc) throw new Error("The original file could not be found.");
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60 * 30);
    if (error || !data) throw new Error("The original file could not be opened.");
    let text: string | null = null;
    if (job.detected_format === "xml") {
      const { data: blob } = await supabase.storage.from("documents").download(doc.storage_path);
      text = blob ? (await blob.text()).slice(0, 200_000) : null;
    } else if (job.detected_format === "word" || job.detected_format === "word_legacy") text = doc.markdown_text?.slice(0, 200_000) ?? null;
    return { url: data.signedUrl, text };
  }, "Could not open the original file.");
}
