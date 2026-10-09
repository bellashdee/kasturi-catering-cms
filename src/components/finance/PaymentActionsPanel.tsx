"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime } from "@/lib/documents/upload";
import { attachPaymentVoucher, markPaymentPaid } from "@/lib/finance/paymentActions";
import { requestExtraction } from "@/lib/importFlow/extractClient";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]";
const labelClass = "text-[12px] font-semibold text-text-secondary";

function sameName(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

/** Mark as Paid: actual payment date + payment reference (+ proof when there is one). Pending becomes Paid; history stays in the audit trail. */
export function MarkPaidForm({ paymentId, companyId, maxDate }: { paymentId: string; companyId: string; maxDate: string }) {
  const router = useRouter();
  const [paidDate, setPaidDate] = useState(maxDate);
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let proofDocumentId: string | undefined;
      if (proof) {
        const doc = await uploadDocument({ companyId, module: "finance", fileType: fileTypeFromMime(proof), file: proof });
        proofDocumentId = doc.id;
      }
      await markPaymentPaid(paymentId, { paidDate, paymentReference: reference, proofDocumentId });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark as paid.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Actual Payment Date *</label>
          <input type="date" required max={maxDate} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Payment Reference *</label>
          <input required value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} placeholder="Transfer / cheque reference" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Payment Proof (where applicable)</label>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="rounded-lg bg-success px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {busy ? "Saving..." : "Confirm — Mark as Paid"}
        </button>
      </div>
    </form>
  );
}

/**
 * Upload the Payment Voucher for this payment. The voucher is read (when AI reading is available) and checked against the
 * company of the payment, so it is never filed under the wrong company.
 */
export function VoucherUpload({ paymentId, companyId, companyName, currentVoucherNo }: { paymentId: string; companyId: string; companyName: string; currentVoucherNo: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [voucherNo, setVoucherNo] = useState(currentVoucherNo ?? "");
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setBusy("read");
    setError(null);
    setWarning(null);
    try {
      const doc = await uploadDocument({ companyId, module: "finance", fileType: fileTypeFromMime(file), file });
      setDocumentId(doc.id);
      const { res, result } = await requestExtraction(doc.id, "finance_payment");
      const extracted = res.ok && result.extracted ? (result.extracted as { voucher_number?: string | null; company_name?: string | null }) : null;
      if (extracted?.voucher_number) setVoucherNo(extracted.voucher_number);
      if (extracted?.company_name && !sameName(extracted.company_name, companyName)) {
        setWarning(`This voucher is for "${extracted.company_name}", but this payment belongs to ${companyName}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!documentId) return;
    setBusy("save");
    setError(null);
    try {
      await attachPaymentVoucher(paymentId, { documentId, voucherNumber: voucherNo });
      setFile(null);
      setDocumentId(null);
      setWarning(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach the voucher.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div>
        <label className={labelClass}>Payment Voucher (PDF / Excel / CSV / screenshot / photo)</label>
        <input type="file" accept="application/pdf,image/*,.xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setDocumentId(null); setWarning(null); setConfirmed(false); }} className="mt-1 block w-full text-[13px]" />
      </div>
      {file && !documentId && (
        <div className="flex justify-end">
          <button type="button" onClick={() => void upload()} disabled={busy !== null} className="rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary disabled:opacity-60">
            {busy === "read" ? "Uploading & reading..." : "Upload voucher"}
          </button>
        </div>
      )}
      {documentId && (
        <>
          <div>
            <label className={labelClass}>Voucher No.</label>
            <input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} className={inputClass} />
          </div>
          <div className="rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px] text-text-secondary">
            Payment Of: <span className="font-bold text-text">{companyName}</span>
          </div>
          {warning && (
            <div className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-[12.5px] text-danger">
              <div className="font-bold">⚠ {warning}</div>
              <label className="mt-1.5 flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                I confirm this voucher belongs to {companyName}
              </label>
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={() => void save()} disabled={busy !== null || (!!warning && !confirmed)} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
              {busy === "save" ? "Saving..." : "Confirm & Attach Voucher"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
