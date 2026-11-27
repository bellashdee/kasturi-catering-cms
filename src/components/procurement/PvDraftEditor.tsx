"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actionResult";
import { buildTablePdf } from "@/lib/export/tableExport";
import { fileTypeFromMime, uploadDocument } from "@/lib/documents/upload";
import { approvePvDraft, cancelPvDraft, createPvDraft, recordPvPayment, rejectPvDraft, saveAllocations, submitPvDraft } from "@/lib/procurement/pvDraftActions";
import { PV_STATUS_LABEL } from "@/lib/procurement/soaReconcileLabels";

export type PvInvoice = { id: string; number: string; date: string; amount: number; paid: number; heldElsewhere: number; outstanding: number; onSoa: boolean; monthPv: string | null };
export type PvAllocation = { invoiceId: string; number: string; date: string; amount: number; overReason: string | null; posted: boolean };
export type PvDraftView = {
  id: string;
  status: string;
  total: number;
  remarks: string | null;
  voucherNumber: string | null;
  financePaymentId: string | null;
  rejectionNote: string | null;
  paidDate: string | null;
  paymentReference: string | null;
  preparedBy: string;
  approvedBy: string;
  approvedAt: string | null;
};

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const primary = "h-9 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white disabled:opacity-50";
const field = "mt-1 block h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] text-text";

export function PvDraftEditor(props: {
  reconId: string;
  companyId: string;
  companyName: string;
  supplierName: string;
  period: string;
  reconStatus: string;
  canManage: boolean;
  canApprove: boolean;
  draft: PvDraftView | null;
  invoices: PvInvoice[];
  allocations: PvAllocation[];
  ledgerClosing: number;
}) {
  const { draft, invoices, canManage, canApprove } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editable = !!draft && draft.status === "draft" && canManage;
  const initial = useMemo(() => new Map(props.allocations.map((a) => [a.invoiceId, { amount: String(a.amount), reason: a.overReason ?? "" }])), [props.allocations]);
  const [chosen, setChosen] = useState<Map<string, { amount: string; reason: string }>>(initial);
  const [remarks, setRemarks] = useState(draft?.remarks ?? "");
  const [paidDate, setPaidDate] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);

  const run = (fn: () => Promise<ActionResult>, ok?: string) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        if (ok) setNotice(ok);
        router.refresh();
      }
    });

  const rows = invoices.map((inv) => {
    const c = chosen.get(inv.id);
    const amount = c ? Number(c.amount.replace(/,/g, "")) || 0 : 0;
    return { inv, c, amount, over: amount > inv.outstanding + 0.004 };
  });
  const totalSelected = r2(rows.reduce((t, r) => t + (r.c ? r.amount : 0), 0));
  const totalOutstanding = r2(invoices.reduce((t, i) => t + Math.max(i.outstanding, 0), 0));
  const toggle = (inv: PvInvoice, on: boolean) => {
    const next = new Map(chosen);
    if (on) next.set(inv.id, { amount: String(Math.max(inv.outstanding, 0).toFixed(2)), reason: "" });
    else next.delete(inv.id);
    setChosen(next);
  };
  const setAmount = (id: string, amount: string) => {
    const next = new Map(chosen);
    const c = next.get(id);
    if (c) next.set(id, { ...c, amount });
    setChosen(next);
  };
  const setReason = (id: string, reason: string) => {
    const next = new Map(chosen);
    const c = next.get(id);
    if (c) next.set(id, { ...c, reason });
    setChosen(next);
  };
  const allocationInput = () => rows.filter((r) => r.c).map((r) => ({ invoiceId: r.inv.id, amount: r.amount, overReason: r.c!.reason || undefined }));

  function printVoucher() {
    if (!draft) return;
    buildTablePdf({
      title: `Payment Voucher ${draft.voucherNumber ?? "(draft - no number yet)"}`,
      subtitle: `${props.companyName} · ${PV_STATUS_LABEL[draft.status] ?? draft.status}`,
      columns: ["Invoice no.", "Invoice date", "Paid by this voucher (RM)"],
      rows: props.allocations.map((a) => [a.number, dmy(a.date), money(a.amount)]),
      info: [
        { label: "Pay to", value: props.supplierName },
        { label: "Company", value: props.companyName },
        { label: "SOA period reconciled", value: props.period },
        { label: "Prepared by", value: draft.preparedBy },
        { label: "Approved by", value: draft.approvedAt ? `${draft.approvedBy} · ${dmy(draft.approvedAt)}` : "not approved yet" },
        { label: "Payment", value: draft.paidDate ? `${dmy(draft.paidDate)} · ref ${draft.paymentReference}` : "not paid yet" },
        { label: "Remarks", value: draft.remarks ?? "—" },
      ],
      summary: [{ label: "Total", value: `RM ${money(draft.total)}`, bold: true }],
      signatures: [{ label: "Prepared by", name: draft.preparedBy }, { label: "Approved by (Finance)", name: draft.approvedAt ? draft.approvedBy : undefined }, { label: "Received by" }],
    }).save(`${draft.voucherNumber ?? "payment-voucher-draft"}.pdf`);
  }

  if (!draft) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        {props.reconStatus === "approved_for_payment" && canManage ? (
          <>
            <p className="text-[13px] text-text-secondary">The reconciliation is approved for payment. Open a payment voucher draft to choose the invoices to pay.</p>
            <button type="button" disabled={pending} className={`${primary} mt-2`} onClick={() => run(() => createPvDraft(props.reconId))}>
              Create payment voucher draft
            </button>
          </>
        ) : (
          <p className="text-[13px] text-text-secondary">No payment voucher yet.</p>
        )}
        {error && <div className="mt-2 text-[12.5px] font-semibold text-danger">{error}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="text-[13px] text-text">
          <b>{draft.voucherNumber ?? "Draft voucher (the PV number is given when Finance approves)"}</b> · {PV_STATUS_LABEL[draft.status] ?? draft.status} · total <b>RM {money(draft.total)}</b>
          {draft.rejectionNote && draft.status === "draft" && <div className="text-[12px] text-danger">Returned by Finance: {draft.rejectionNote}</div>}
        </div>
        <button type="button" className={btn} onClick={printVoucher}>
          Print voucher (PDF)
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
          <div className="text-[14px] font-bold text-text">{`Outstanding invoices of ${props.supplierName} (${props.companyName})`}</div>
          {editable && (
            <div className="flex gap-1.5">
              <button type="button" className={btn} onClick={() => setChosen(new Map(invoices.filter((i) => i.outstanding > 0).map((i) => [i.id, { amount: i.outstanding.toFixed(2), reason: "" }])))}>
                Select all
              </button>
              <button type="button" className={btn} onClick={() => setChosen(new Map())}>
                Clear
              </button>
            </div>
          )}
        </div>
        <table className="mt-2 w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-y border-border bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-secondary">
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Invoice (RM)</th>
              <th className="px-3 py-2 text-right">Paid (RM)</th>
              <th className="px-3 py-2 text-right">Held by other PVs (RM)</th>
              <th className="px-3 py-2 text-right">Outstanding (RM)</th>
              <th className="px-3 py-2 text-right">Pay now (RM)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(editable ? rows : rows.filter((r) => r.c)).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-5 text-center text-[12.5px] text-text-muted">
                  {editable ? "This supplier has no outstanding invoice in this company." : "No invoice on this voucher."}
                </td>
              </tr>
            )}
            {(editable ? rows : rows.filter((r) => r.c)).map(({ inv, c, over }) => (
              <tr key={inv.id} className="align-top">
                <td className="px-3 py-2">
                  <input type="checkbox" disabled={!editable || (inv.outstanding <= 0 && !c)} checked={!!c} onChange={(e) => toggle(inv, e.target.checked)} className="h-4 w-4" />
                </td>
                <td className="px-3 py-2">
                  <div className="font-semibold text-text">{inv.number}</div>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    {inv.onSoa ? <span className="rounded bg-success-bg px-1.5 text-success">on supplier SOA</span> : <span className="rounded bg-surface-alt px-1.5 text-text-muted">not on this SOA</span>}
                    {inv.monthPv && <span className="rounded bg-warning-bg px-1.5 text-warning">{`monthly ${inv.monthPv} of this month already paid: check it is not paid twice`}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums">{dmy(inv.date)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(inv.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{money(inv.paid)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{inv.heldElsewhere ? money(inv.heldElsewhere) : "—"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(inv.outstanding)}</td>
                <td className="px-3 py-2 text-right">
                  {c ? (
                    editable ? (
                      <>
                        <input value={c.amount} onChange={(e) => setAmount(inv.id, e.target.value)} inputMode="decimal" className="h-8 w-28 rounded-md border border-border-strong bg-surface px-2 text-right text-[13px] tabular-nums" />
                        {over && (
                          <div className="mt-1 text-left text-[11.5px]">
                            <span className="font-semibold text-danger">More than the outstanding balance.</span>
                            {canApprove ? (
                              <input value={c.reason} onChange={(e) => setReason(inv.id, e.target.value)} placeholder="Reason (authorised by Finance)" className="mt-0.5 block h-8 w-56 rounded-md border border-border-strong px-2 text-[12px]" />
                            ) : (
                              <div className="text-text-secondary">Only the Director of Finance / her PA can authorise paying more.</div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="tabular-nums">{money(Number(c.amount))}</span>
                    )
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 border-t border-border px-4 py-3 text-[13px]">
          <span>
            Outstanding (listed): <b className="tabular-nums">RM {money(totalOutstanding)}</b>
          </span>
          <span>
            Total selected: <b className="tabular-nums">RM {money(totalSelected)}</b>
          </span>
          <span>
            Remaining balance after this payment: <b className="tabular-nums">RM {money(r2(totalOutstanding - totalSelected))}</b>
          </span>
          <span className="text-text-secondary">
            Supplier ledger closing (SOA report): <span className="tabular-nums">RM {money(props.ledgerClosing)}</span>
          </span>
        </div>
      </div>

      {editable && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <label className="text-[12px] font-semibold text-text-secondary">
            Remarks on the voucher
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[13px]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} className={btn} onClick={() => run(() => saveAllocations(draft.id, allocationInput(), remarks), "Saved.")}>
              Save draft
            </button>
            <button
              type="button"
              disabled={pending || totalSelected <= 0}
              className={primary}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const s = await saveAllocations(draft.id, allocationInput(), remarks);
                  if (!s.ok) return setError(s.error);
                  const r = await submitPvDraft(draft.id);
                  if (!r.ok) setError(r.error);
                  router.refresh();
                })
              }
            >
              Save and submit for approval
            </button>
            <button
              type="button"
              disabled={pending}
              className={btn}
              onClick={() => {
                const r = window.prompt("Why is this voucher cancelled?");
                if (r) run(() => cancelPvDraft(draft.id, r));
              }}
            >
              Cancel voucher
            </button>
          </div>
          <p className="text-[12px] text-text-muted">The invoices are not marked paid when the voucher is drafted or approved: only when the payment is recorded.</p>
        </div>
      )}

      {draft.status === "submitted" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
          {canApprove ? (
            <>
              <button type="button" disabled={pending} className={primary} onClick={() => run(() => approvePvDraft(draft.id), "Approved: the voucher has its PV number and is in Admin & Finance → Supplier Payment.")}>
                Approve payment voucher (Finance)
              </button>
              <button
                type="button"
                disabled={pending}
                className={btn}
                onClick={() => {
                  const r = window.prompt("Why is the voucher returned?");
                  if (r) run(() => rejectPvDraft(draft.id, r));
                }}
              >
                Return to the preparer
              </button>
            </>
          ) : (
            <span className="text-[13px] text-text-secondary">Waiting for Finance (Ms. Penny Chan / Ms. Nabilah) to approve.</span>
          )}
          {canManage && (
            <button
              type="button"
              disabled={pending}
              className={btn}
              onClick={() => {
                const r = window.prompt("Why is this voucher cancelled?");
                if (r) run(() => cancelPvDraft(draft.id, r));
              }}
            >
              Cancel voucher
            </button>
          )}
        </div>
      )}

      {draft.status === "approved" && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[13px] text-text">
            {`${draft.voucherNumber} is in Admin & Finance → Supplier Payment as an unpaid supplier payment. Record the payment here once it is made: the invoices are paid only then.`}
          </div>
          {canManage && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[12px] font-semibold text-text-secondary">
                Actual payment date
                <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={field} />
              </label>
              <label className="text-[12px] font-semibold text-text-secondary">
                Payment reference (bank / cheque no.)
                <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${field} w-56`} />
              </label>
              <label className="text-[12px] font-semibold text-text-secondary">
                Proof of payment (optional)
                <input type="file" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="mt-1 block text-[12px]" />
              </label>
              <button
                type="button"
                disabled={pending}
                className={primary}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    try {
                      const doc = proof ? await uploadDocument({ companyId: props.companyId, module: "finance-admin", fileType: fileTypeFromMime(proof), file: proof }) : null;
                      const r = await recordPvPayment(draft.id, { paidDate, reference, proofDocumentId: doc?.id });
                      if (!r.ok) setError(r.error);
                      else setNotice("Payment recorded: the invoices are now paid.");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "The proof could not be uploaded.");
                    }
                    router.refresh();
                  })
                }
              >
                Record final payment
              </button>
            </div>
          )}
          {canApprove && (
            <button
              type="button"
              disabled={pending}
              className={`${btn} w-fit`}
              onClick={() => {
                const r = window.prompt("Void this approved voucher (not paid yet)? Its PV in Admin & Finance is cancelled. Reason:");
                if (r) run(() => cancelPvDraft(draft.id, r));
              }}
            >
              Void voucher (Finance)
            </button>
          )}
        </div>
      )}

      {draft.status === "paid" && (
        <div className="rounded-xl border border-success/40 bg-success-bg px-4 py-3 text-[13px] text-success">
          {`Paid on ${dmy(draft.paidDate)} · ref ${draft.paymentReference}. The invoices on this voucher are posted as paid.`}
        </div>
      )}

      {notice && <div className="text-[12.5px] font-semibold text-success">{notice}</div>}
      {error && <div className="text-[12.5px] font-semibold text-danger">{error}</div>}
    </div>
  );
}
