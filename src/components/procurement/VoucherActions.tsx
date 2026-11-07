"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAllVouchers, createVoucher, deleteVoucher, refreshVoucher, setVoucherPaid, updateVoucher } from "@/lib/procurement/voucherActions";
import { todayInMalaysia } from "@/lib/format";

const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const inputClass = "h-9 rounded-lg border border-border-strong px-2.5 text-[13px] outline-none focus:border-primary";

/** "Create voucher" for one supplier of the month. */
export function CreateVoucherButton({ companyId, supplierId, monthStart }: { companyId: string; supplierId: string; monthStart: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const result = await createVoucher(companyId, supplierId, monthStart);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/supplier-procurement/vouchers/${result.id}`);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={create} disabled={busy} className={btn}>
        {busy ? "Creating..." : "Create voucher"}
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}

/** "Create all vouchers" of the month for one company. */
export function CreateAllVouchersButton({ companyId, monthStart, missing }: { companyId: string; monthStart: string; missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createAll() {
    if (!window.confirm(`Create ${missing} voucher${missing === 1 ? "" : "s"} for this month?`)) return;
    setBusy(true);
    setMessage(null);
    const result = await createAllVouchers(companyId, monthStart);
    setBusy(false);
    setMessage(result.ok ? `${result.created} voucher${result.created === 1 ? "" : "s"} created.` : result.error);
    if (result.ok) router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {message && <span className="text-[12.5px] text-text-secondary">{message}</span>}
      <button type="button" onClick={createAll} disabled={busy || missing === 0} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50">
        {busy ? "Creating..." : `Create all vouchers (${missing})`}
      </button>
    </div>
  );
}

/** Refresh, edit, mark paid and delete on the voucher page. */
export function VoucherDetailActions({
  voucherId,
  status,
  voucherDate,
  notes,
  paidDate,
  paymentReference,
  listHref,
}: {
  voucherId: string;
  status: string;
  voucherDate: string;
  notes: string;
  paidDate: string | null;
  paymentReference: string | null;
  listHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [date, setDate] = useState(voucherDate);
  const [note, setNote] = useState(notes);
  const [paid, setPaid] = useState(paidDate ?? todayInMalaysia());
  const [reference, setReference] = useState(paymentReference ?? "");
  const isPaid = status === "paid";

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    after?.();
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      <div className="flex flex-wrap justify-end gap-2">
        {!isPaid && (
          <button type="button" disabled={busy} onClick={() => run(() => refreshVoucher(voucherId))} className={btn}>
            Refresh from invoices
          </button>
        )}
        <button type="button" onClick={() => { setEditing((v) => !v); setPaying(false); }} className={btn}>
          Edit
        </button>
        {isPaid ? (
          <button type="button" disabled={busy} onClick={() => run(() => setVoucherPaid(voucherId, false))} className={btn}>
            Mark not paid
          </button>
        ) : (
          <button type="button" onClick={() => { setPaying((v) => !v); setEditing(false); }} className="h-9 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white">
            Mark as paid
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Delete this voucher? The invoices stay as they are. You can create it again.")) run(() => deleteVoucher(voucherId), () => router.push(listHref));
          }}
          className="h-9 rounded-lg border border-danger/40 bg-surface px-3.5 text-[13px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {editing && (
        <div className="flex flex-wrap items-end justify-end gap-2 rounded-lg border border-border bg-surface p-3">
          <label className="text-[12px] font-semibold text-text-secondary">
            Voucher date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} mt-1 block`} />
          </label>
          <label className="text-[12px] font-semibold text-text-secondary">
            Notes
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} mt-1 block w-64`} />
          </label>
          <button type="button" disabled={busy} onClick={() => run(() => updateVoucher(voucherId, { voucherDate: date, notes: note }), () => setEditing(false))} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => { setEditing(false); setDate(voucherDate); setNote(notes); }} className={btn}>
            Cancel
          </button>
        </div>
      )}

      {paying && (
        <div className="flex flex-wrap items-end justify-end gap-2 rounded-lg border border-border bg-surface p-3">
          <label className="text-[12px] font-semibold text-text-secondary">
            Paid on
            <input type="date" value={paid} onChange={(e) => setPaid(e.target.value)} className={`${inputClass} mt-1 block`} />
          </label>
          <label className="text-[12px] font-semibold text-text-secondary">
            Payment reference
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / transfer no." className={`${inputClass} mt-1 block w-56`} />
          </label>
          <button type="button" disabled={busy} onClick={() => run(() => setVoucherPaid(voucherId, true, { paidDate: paid, reference }), () => setPaying(false))} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => setPaying(false)} className={btn}>
            Cancel
          </button>
        </div>
      )}

      {error && <div className="text-[12.5px] text-danger">{error}</div>}
    </div>
  );
}
