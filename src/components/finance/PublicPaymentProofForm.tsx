"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SALES_AGENTS } from "@/lib/catering/constants";
import { requestProofUpload, submitPaymentProof } from "@/lib/finance/paymentProofActions";
import { PAYMENT_REMARK_OPTIONS, PROOF_ACCEPT, PROOF_MAX_BYTES, PUBLIC_PAYMENT_METHODS } from "@/lib/finance/paymentProof";
import { todayInMalaysia } from "@/lib/format";
import { Select } from "@/components/ui/Select";

const inputClass =
  "mt-1.5 h-11 w-full rounded-lg border border-border-strong px-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[13px] font-semibold text-text-secondary";

/**
 * The form a sales agent uses (no login) to tell the office that a customer has paid: the payment date, how it was paid (cash /
 * transfer / cheque), the reference or receipt number, the amount, the customer's invoice / order number and whether it is a deposit
 * or the full payment. A photo of the receipt can be attached. The office checks it before anything is recorded.
 */
export function PublicPaymentProofForm({ companySlug }: { companySlug: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [salesAgent, setSalesAgent] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => todayInMalaysia());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [website, setWebsite] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ invoice: string; matched: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (file && file.size > PROOF_MAX_BYTES) {
      setError("The proof file must be smaller than 10 MB.");
      return;
    }
    try {
      let proofPath: string | undefined;
      if (file) {
        setStep("uploading");
        const permission = await requestProofUpload(companySlug, { name: file.name, type: file.type, size: file.size });
        if (!permission.ok || !permission.path || !permission.token) throw new Error(permission.error ?? "Could not prepare the upload.");
        const { error: uploadError } = await createClient().storage.from("documents").uploadToSignedUrl(permission.path, permission.token, file, { contentType: file.type || undefined });
        if (uploadError) throw new Error("The proof could not be uploaded. Check your connection and try again.");
        proofPath = permission.path;
      }

      setStep("saving");
      const result = await submitPaymentProof(companySlug, {
        salesAgent,
        invoiceNumber,
        paymentDate,
        paymentMethod,
        amount: amount ? Number(amount) : undefined,
        reference,
        remarks,
        proofPath,
        proofFilename: file?.name,
        proofMime: file?.type || undefined,
        website,
      });
      if (!result.ok) throw new Error(result.error ?? "Something went wrong.");
      setSent({ invoice: invoiceNumber, matched: !!result.matched });
      // keep the sales agent selected so several proofs can be sent one after another
      setInvoiceNumber("");
      setPaymentMethod("");
      setAmount("");
      setReference("");
      setRemarks("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setStep("idle");
  }

  const busy = step !== "idle";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {sent && (
        <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2.5 text-[14px] text-success">
          <span className="font-semibold">Thank you.</span> {`The payment details for invoice ${sent.invoice} were sent to the office.`}{" "}
          {!sent.matched && "The invoice number was not found in the system, so the office will check it."} You can send another one below.
        </div>
      )}
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2.5 text-[14px] text-danger">{error}</div>}

      <div>
        <label className={labelClass} htmlFor="pp-agent">Sales agent *</label>
        <Select id="pp-agent" required value={salesAgent} onChange={(e) => setSalesAgent(e.target.value)} className={inputClass}>
          <option value="">Select your name</option>
          {SALES_AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="pp-date">Payment date *</label>
          <input id="pp-date" type="date" required max={todayInMalaysia()} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="pp-method">Payment method *</label>
          <Select id="pp-method" required value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
            <option value="">Select how the customer paid</option>
            {PUBLIC_PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="pp-ref">Reference / receipt no. *</label>
          <input id="pp-ref" required maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} placeholder="Transfer reference, cheque no. or receipt no." autoComplete="off" />
        </div>
        <div>
          <label className={labelClass} htmlFor="pp-amount">Amount paid (RM) *</label>
          <input id="pp-amount" type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="pp-invoice">Customer invoice / order no. *</label>
          <input id="pp-invoice" required maxLength={100} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputClass} placeholder="The number on the customer's invoice or order" autoComplete="off" />
        </div>
        <div>
          <label className={labelClass} htmlFor="pp-remarks">Remarks *</label>
          <Select id="pp-remarks" required value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass}>
            <option value="">Deposit or full payment</option>
            {PAYMENT_REMARK_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="pp-proof">Receipt / proof of payment (optional, photo or PDF, up to 10 MB)</label>
        <input
          id="pp-proof"
          ref={fileInput}
          type="file"
          accept={PROOF_ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full rounded-lg border border-dashed border-border-strong bg-surface-alt px-3 py-3 text-[14px] text-text file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-white"
        />
        {file && <div className="mt-1 text-[13px] text-text-secondary">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div>}
      </div>

      {/* hidden honeypot field: people never see or fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website</label>
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-3 text-[15px] font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
        {step === "uploading" ? "Uploading the proof..." : step === "saving" ? "Sending..." : "Send payment details"}
      </button>
    </form>
  );
}
