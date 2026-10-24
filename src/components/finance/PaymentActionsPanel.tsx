"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime } from "@/lib/documents/upload";
import { attachPaymentVoucher, recordPayment } from "@/lib/finance/paymentActions";
import { formatRM } from "@/lib/finance/payments";
import { requestExtraction } from "@/lib/importFlow/extractClient";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]";
const labelClass = "text-[12px] font-semibold text-text-secondary";

function sameName(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

type PayRow = { key: number; amount: string; paidDate: string; reference: string; note: string; proof: File | null };

/**
 * Mark as Paid: one row per payment made, each with its amount paid, actual payment date and payment reference (and, if there is one,
 * the receipt and a note). When the amounts do not cover what is to be paid, another row can be added; what is left is shown as the
 * balance and stays to be paid. Payments already recorded are listed above, in "Payments made".
 */
export function MarkPaidForm({ paymentId, companyId, maxDate, total, paidSoFar, detailsPending }: { paymentId: string; companyId: string; maxDate: string; total: number; paidSoFar: number; detailsPending: boolean }) {
  const router = useRouter();
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const balance = round2(Math.max(total - paidSoFar, 0));
  const [rows, setRows] = useState<PayRow[]>([{ key: 1, amount: balance.toFixed(2), paidDate: maxDate, reference: "", note: "", proof: null }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entered = round2(rows.reduce((t, r) => t + (Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0), 0));
  const left = round2(balance - entered);
  const partial = left > 0.004;
  const over = left < -0.004;

  const patch = (key: number, change: Partial<PayRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const addRow = () => setRows((prev) => [...prev, { key: Math.max(...prev.map((r) => r.key)) + 1, amount: Math.max(left, 0).toFixed(2), paidDate: maxDate, reference: "", note: "", proof: null }]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (over) {
      setError(`The amounts are more than the balance (${formatRM(balance)}).`);
      return;
    }
    setBusy(true);
    setError(null);
    let done = 0;
    try {
      for (const [i, r] of rows.entries()) {
        let proofDocumentId: string | undefined;
        if (r.proof) {
          const doc = await uploadDocument({ companyId, module: "finance", fileType: fileTypeFromMime(r.proof), file: r.proof });
          proofDocumentId = doc.id;
        }
        const result = await recordPayment(paymentId, { amount: Number(r.amount), paidDate: r.paidDate, paymentReference: r.reference, note: r.note, proofDocumentId });
        if (!result.ok) {
          setError(`${rows.length > 1 ? `Payment ${i + 1}: ` : ""}${result.error}${done > 0 ? ` (payments before it were saved)` : ""}`);
          if (done > 0) router.refresh();
          return;
        }
        done += 1;
      }
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
      <div className="text-[12.5px] text-text-secondary">{`To pay: ${formatRM(total)}${paidSoFar > 0 ? ` · paid so far ${formatRM(paidSoFar)}` : ""} · balance ${formatRM(balance)}`}</div>

      {rows.map((r, i) => (
        <div key={r.key} className="rounded-xl border border-border bg-surface-alt p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12.5px] font-bold text-text">{rows.length > 1 || partial ? `Payment ${i + 1}` : "Payment"}</div>
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} className="text-[12px] font-semibold text-danger hover:underline">
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Amount paid (RM) *</label>
              <input type="number" required min="0.01" max={balance} step="0.01" value={r.amount} onChange={(e) => patch(r.key, { amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Actual Payment Date *</label>
              <input type="date" required max={maxDate} value={r.paidDate} onChange={(e) => patch(r.key, { paidDate: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Payment Reference *</label>
              <input required value={r.reference} onChange={(e) => patch(r.key, { reference: e.target.value })} className={inputClass} placeholder="Transfer / cheque reference" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Note (e.g. new receipt no., what it covers)</label>
              <input value={r.note} maxLength={500} onChange={(e) => patch(r.key, { note: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Receipt / Payment Proof (where applicable)</label>
              <input type="file" accept="application/pdf,image/*" onChange={(e) => patch(r.key, { proof: e.target.files?.[0] ?? null })} className="mt-1 block w-full text-[13px]" />
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {partial && (
            <button type="button" onClick={addRow} className="rounded-lg border border-primary px-3 py-1.5 text-[12.5px] font-bold text-primary hover:bg-info-bg">
              + Add another payment
            </button>
          )}
          {over ? (
            <span className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-1.5 text-[12.5px] font-bold text-danger">{`More than the balance by ${formatRM(-left)}`}</span>
          ) : partial ? (
            <span className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-1.5 text-[12.5px] font-bold text-warning">{`Still to pay after this: ${formatRM(left)}`}</span>
          ) : (
            <span className="rounded-lg border border-success/30 bg-success-bg px-3 py-1.5 text-[12.5px] font-bold text-success">This pays the whole balance</span>
          )}
        </div>
        <button type="submit" disabled={busy || over} className="rounded-lg bg-success px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {busy ? "Saving..." : partial ? "Record part payment" : "Confirm — Mark as Paid"}
        </button>
      </div>
      {detailsPending && <div className="text-[12px] text-text-muted">This payment was ticked as paid in the checklist: enter the real amount, date and reference. If less than the whole amount was paid, the rest stays to be paid.</div>}
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
