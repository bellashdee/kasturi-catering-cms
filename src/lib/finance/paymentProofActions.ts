"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SALES_AGENTS } from "@/lib/catering/constants";
import { INTAKE_COMPANIES, INTAKE_HOURLY_LIMIT, QUOTATION_NOTIFY_EMAIL, SITE_URL } from "@/lib/catering/intake";
import { confirmedPaymentDate } from "@/lib/format";
import { recordAudit } from "@/lib/audit";
import { escapeHtml, sendNotificationEmail } from "@/lib/notify/email";
import { recordCustomerPayment } from "@/lib/finance/actions";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_REMARK_OPTIONS,
  PROOF_ALLOWED_EXTENSIONS,
  PROOF_MAX_BYTES,
  proofExtension,
  proofFolder,
  type PaymentProofInput,
} from "@/lib/finance/paymentProof";

type Result = { ok: boolean; error?: string };

const BUCKET = "documents";
const clean = (s: string | undefined, max: number) => {
  const v = s?.trim();
  if (!v) return null;
  if (v.length > max) throw new Error("One of the fields is too long.");
  return v;
};

/**
 * Public (no login), step 1: gives the browser a one-time permission to upload ONE proof file into this company's payment-proof
 * folder. The company comes from the link, the file type and size are checked here, and nothing else can be written.
 */
export async function requestProofUpload(companySlug: string, file: { name: string; type: string; size: number }): Promise<{ ok: boolean; error?: string; path?: string; token?: string }> {
  try {
    const company = INTAKE_COMPANIES[companySlug];
    if (!company) throw new Error("This link is not valid.");
    const ext = proofExtension(file.name);
    if (!PROOF_ALLOWED_EXTENSIONS.includes(ext)) throw new Error("The proof must be a photo (JPG, PNG, WEBP, HEIC) or a PDF.");
    if (!(file.size > 0) || file.size > PROOF_MAX_BYTES) throw new Error("The proof file must be smaller than 10 MB.");
    const path = `${proofFolder(company.id)}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error("Could not prepare the upload. Please try again.");
    return { ok: true, path, token: data.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not prepare the upload." };
  }
}

/**
 * Public (no login), step 2: stores the payment proof as "pending". It is matched to the customer invoice by the invoice
 * number (when that number exists for this company); nothing is recorded as a payment until the office approves it.
 */
export async function submitPaymentProof(companySlug: string, input: PaymentProofInput): Promise<Result & { matched?: boolean }> {
  try {
    const company = INTAKE_COMPANIES[companySlug];
    if (!company) throw new Error("This link is not valid.");
    if (input.website?.trim()) return { ok: true, matched: true }; // a bot filled the hidden field
    if (!SALES_AGENTS.includes(input.salesAgent)) throw new Error("Select your name from the sales agent list.");
    const invoiceNumber = clean(input.invoiceNumber, 100);
    if (!invoiceNumber) throw new Error("Enter the invoice number.");
    const paymentDate = confirmedPaymentDate(input.paymentDate || undefined);
    if (!PAYMENT_METHOD_LABEL[input.paymentMethod]) throw new Error("Select how the customer paid.");
    if (!(input.amount !== undefined && input.amount > 0)) throw new Error("Enter the amount paid (more than 0).");
    const reference = clean(input.reference, 200);
    if (!reference) throw new Error("Enter the reference / receipt number.");
    const remarks = clean(input.remarks, 1000);
    if (!remarks || !PAYMENT_REMARK_OPTIONS.includes(remarks)) throw new Error("Select Deposit or Full payment.");

    const admin = createAdminClient();

    // the receipt / proof is optional; when there is one the file must really be there, and not too big (the browser's word is not enough)
    let proofPath: string | null = null;
    if (input.proofPath) {
      if (!input.proofPath.startsWith(`${proofFolder(company.id)}/`) || input.proofPath.includes("..")) throw new Error("The proof file is not valid. Please upload it again.");
      const folder = proofFolder(company.id);
      const fileName = input.proofPath.slice(folder.length + 1);
      const { data: found } = await admin.storage.from(BUCKET).list(folder, { search: fileName, limit: 5 });
      const object = found?.find((f) => f.name === fileName);
      if (!object) throw new Error("The proof file was not uploaded. Please choose it again.");
      const size = Number((object.metadata as { size?: number } | null)?.size ?? 0);
      if (size > PROOF_MAX_BYTES) {
        await admin.storage.from(BUCKET).remove([input.proofPath]);
        throw new Error("The proof file must be smaller than 10 MB.");
      }
      proofPath = input.proofPath;
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("payment_proof_submissions").select("id", { count: "exact", head: true }).eq("company_id", company.id).gte("created_at", since);
    if ((count ?? 0) >= INTAKE_HOURLY_LIMIT) throw new Error("Too many submissions right now. Please try again in a while.");

    const escaped = invoiceNumber.replace(/[\\%_]/g, "\\$&");
    const { data: invoice } = await admin.from("customer_invoices").select("id").eq("company_id", company.id).ilike("invoice_number", escaped).limit(1).maybeSingle();

    const { error } = await admin.from("payment_proof_submissions").insert({
      company_id: company.id,
      sales_agent: input.salesAgent,
      invoice_number: invoiceNumber,
      customer_invoice_id: invoice?.id ?? null,
      payment_date: paymentDate,
      payment_method: input.paymentMethod,
      amount: input.amount,
      reference,
      remarks,
      proof_path: proofPath,
      proof_filename: clean(input.proofFilename, 200),
      proof_mime: clean(input.proofMime, 100),
    });
    if (error) throw new Error("Could not save. Please try again.");

    // tell the office; the proof is already saved, so a missing or failing email never fails the form
    try {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL).replace(/\/$/, "");
      const reviewUrl = `${siteUrl}/finance/payment-proofs`;
      const to = process.env.QUOTATION_NOTIFY_EMAIL ?? QUOTATION_NOTIFY_EMAIL;
      await sendNotificationEmail({
        to,
        subject: `Payment proof: ${invoiceNumber} (${input.salesAgent})`,
        text: `${input.salesAgent} sent a customer payment proof (${company.name}).\nInvoice: ${invoiceNumber}\nDate: ${paymentDate}\nMethod: ${PAYMENT_METHOD_LABEL[input.paymentMethod]}\nAmount: RM ${input.amount.toFixed(2)} (${remarks})\nReference: ${reference}\n\nReview it here: ${reviewUrl}\nNothing is recorded as a payment until you approve it.`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px"><h3 style="margin:0 0 8px">Payment proof from ${escapeHtml(input.salesAgent)}</h3><p>${escapeHtml(company.name)}<br>Invoice <b>${escapeHtml(invoiceNumber)}</b> · ${escapeHtml(paymentDate)} · ${escapeHtml(PAYMENT_METHOD_LABEL[input.paymentMethod])}</p><p><a href="${reviewUrl}">Review and approve</a></p><p style="color:#5a6577;font-size:12px">Nothing is recorded as a payment until you approve it.</p></div>`,
      });
    } catch {
      // ignored on purpose
    }
    return { ok: true, matched: !!invoice };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save. Please try again." };
  }
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/**
 * Approves a proof: records the customer payment on the invoice (the same way a payment recorded by hand is), so the invoice
 * becomes Partly Paid or Paid. The proof is claimed first, so pressing the button twice (or two people at once) records the
 * payment once; if recording fails the proof goes back to pending.
 */
export async function approvePaymentProof(proofId: string, input: { customerInvoiceId: string; amount: number; paymentDate: string }): Promise<Result> {
  try {
    const { supabase, userId } = await requireUser();
    if (!(input.amount > 0)) throw new Error("Enter the amount paid (more than 0).");
    const paymentDate = confirmedPaymentDate(input.paymentDate || undefined);

    const { data: proof, error } = await supabase.from("payment_proof_submissions").select("*").eq("id", proofId).single();
    if (error || !proof) throw new Error("This payment proof was not found.");
    if (proof.status !== "pending") throw new Error("This payment proof has already been reviewed.");
    const { data: invoice } = await supabase.from("customer_invoices").select("id, company_id, invoice_number").eq("id", input.customerInvoiceId).single();
    if (!invoice || invoice.company_id !== proof.company_id) throw new Error("Choose the customer invoice this payment is for.");

    const { data: claimed } = await supabase
      .from("payment_proof_submissions")
      .update({ status: "approved", customer_invoice_id: invoice.id, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", proofId)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) throw new Error("This payment proof has already been reviewed.");

    try {
      await recordCustomerPayment({
        companyId: proof.company_id,
        customerInvoiceId: invoice.id,
        amount: input.amount,
        paymentDate,
        paymentReference: proof.reference ?? undefined,
        paymentRemarks: `Proof sent by ${proof.sales_agent} (${PAYMENT_METHOD_LABEL[proof.payment_method] ?? proof.payment_method})`,
      });
    } catch (err) {
      await supabase.from("payment_proof_submissions").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", proofId);
      throw err;
    }
    await recordAudit({ companyId: proof.company_id, relatedTable: "customer_invoices", relatedId: invoice.id, action: "payment_proof_approved", newValue: `${invoice.invoice_number} · RM ${input.amount.toFixed(2)} · ${paymentDate}` });
    revalidatePath("/finance/payment-proofs");
    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${invoice.id}`);
    revalidatePath("/finance/outstanding");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not approve. Please try again." };
  }
}

export async function rejectPaymentProof(proofId: string, note?: string): Promise<Result> {
  try {
    const { supabase, userId } = await requireUser();
    const { data, error } = await supabase
      .from("payment_proof_submissions")
      .update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString(), review_note: note?.trim().slice(0, 500) || null })
      .eq("id", proofId)
      .eq("status", "pending")
      .select("id, company_id, invoice_number");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("This payment proof has already been reviewed.");
    await recordAudit({ companyId: data[0].company_id, relatedTable: "payment_proof_submissions", relatedId: proofId, action: "rejected", newValue: data[0].invoice_number });
    revalidatePath("/finance/payment-proofs");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reject. Please try again." };
  }
}

/** A short-lived link to open the proof (only people with access to the company can get it). */
export async function getPaymentProofUrl(proofId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const { supabase } = await requireUser();
    const { data: proof, error } = await supabase.from("payment_proof_submissions").select("proof_path").eq("id", proofId).single();
    if (error || !proof) throw new Error("This payment proof was not found.");
    if (!proof.proof_path) throw new Error("No receipt or proof file was attached to this payment.");
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(proof.proof_path, 300);
    if (urlError || !data) throw new Error("Could not open the proof file.");
    // open the file through this site's own address too (supabase.co may not be reachable from every network)
    const direct = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (direct && host && data.signedUrl.startsWith(direct)) {
      const proto = h.get("x-forwarded-proto") ?? (/^localhost|^127./.test(host) ? "http" : "https");
      return { ok: true, url: data.signedUrl.replace(direct, `${proto}://${host}/supabase`) };
    }
    return { ok: true, url: data.signedUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not open the proof file." };
  }
}
