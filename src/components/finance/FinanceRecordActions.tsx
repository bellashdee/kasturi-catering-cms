"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import {
  deleteCustomerInvoice,
  deleteCustomerPayment,
  deletePettyCashClaim,
  restoreCustomerInvoice,
  restoreCustomerPayment,
  restorePettyCashClaim,
  updateCustomerInvoice,
  updateCustomerPayment,
  updatePettyCashClaim,
  type CustomerInvoiceRow,
  type CustomerPaymentRow,
  type PettyCashTransactionRow,
} from "@/lib/finance/actions";
import { todayInMalaysia } from "@/lib/format";
import { AREA, BTN, BTN_GHOST, Dialog, ErrorLine, FIELD, LABEL } from "@/components/priority/ui";
import { RecordActions } from "@/components/shared/RecordActions";
import { CompanyChips } from "@/components/pettyCash/CompanyChips";
import { INVOICE_NO_LABEL, INVOICE_NO_PLACEHOLDER } from "@/components/spending/formStyles";
import { MultiChoiceSelect } from "@/components/ui/MultiChoiceSelect";
import { PETTY_CASH_CATEGORIES, joinCategories, splitCategories } from "@/lib/operationPettyCash/constants";
import { splitCompanies } from "@/lib/pettyCash/companies";
import { ANY_UPLOAD_ACCEPT, uploadReceipt } from "@/lib/documents/upload";

export type InvoiceEditData = { id: string; number: string; invoiceDate: string; dueDate: string; amount: string; taxAmount: string; description: string };

/** Edit (Save / Cancel) and Delete (Undo) of a customer invoice on its page. */
export function CustomerInvoiceActions({ invoice, listHref }: { invoice: InvoiceEditData; listHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(invoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<InvoiceEditData>) => setF((p) => ({ ...p, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updateCustomerInvoice(invoice.id, { invoiceNumber: f.number, invoiceDate: f.invoiceDate, dueDate: f.dueDate, amount: Number(f.amount), taxAmount: f.taxAmount.trim() === "" ? 0 : Number(f.taxAmount), description: f.description });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the invoice."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordActions<CustomerInvoiceRow>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deleteCustomerInvoice(invoice.id)}
        onRestore={(row) => restoreCustomerInvoice(row)}
        afterClose={() => router.push(listHref)}
        confirmText={`Delete invoice ${invoice.number}?`}
      />
      {open && (
        <Dialog title={`Edit invoice ${invoice.number}`} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><ErrorLine message={error} /></div>
            <div>
              <label className={LABEL}>Invoice number *</label>
              <input required className={FIELD} value={f.number} onChange={(e) => set({ number: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Amount (RM) *</label>
              <input required type="number" step="any" min="0" className={FIELD} value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Invoice date *</label>
              <input required type="date" className={FIELD} value={f.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Due date *</label>
              <input required type="date" className={FIELD} value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Tax (RM)</label>
              <input type="number" step="any" min="0" className={FIELD} value={f.taxAmount} onChange={(e) => set({ taxAmount: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Description</label>
              <textarea className={AREA} rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2.5 sm:col-span-2">
              <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={busy}>
                {busy ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

/** Edit (Save / Cancel) and Delete (Undo) of one payment of a customer invoice. */
export function CustomerPaymentActions({ payment }: { payment: { id: string; amount: string; paymentDate: string; reference: string; remarks: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(payment.amount);
  const [date, setDate] = useState(payment.paymentDate);
  const [reference, setReference] = useState(payment.reference);
  const [remarks, setRemarks] = useState(payment.remarks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updateCustomerPayment(payment.id, { amount: Number(amount), paymentDate: date, paymentReference: reference, paymentRemarks: remarks });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the payment."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordActions<CustomerPaymentRow>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deleteCustomerPayment(payment.id)}
        onRestore={(row) => restoreCustomerPayment(row)}
        confirmText={`Delete this payment of RM ${payment.amount}?`}
      />
      {open && (
        <Dialog title="Edit payment" onClose={() => setOpen(false)}>
          <form onSubmit={save} className="flex flex-col gap-3">
            <ErrorLine message={error} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Amount (RM) *</label>
                <input required type="number" step="any" min="0" className={FIELD} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Payment date *</label>
                <input required type="date" max={todayInMalaysia()} className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Payment reference</label>
              <input className={FIELD} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Remarks</label>
              <textarea className={AREA} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2.5">
              <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={busy}>
                {busy ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export type ClaimEditData = { id: string; type: "expense" | "top_up"; claimant: string; department: string; category: string; description: string; amount: string; date: string; companyId: string; sharedCompanyIds: string[]; /** a receipt is already attached */ hasReceipt?: boolean; /** what it was for, e.g. the event */ remarks?: string; /** the invoice / receipt number as printed */ invoiceNo?: string };

/** Edit (Save / Cancel) and Delete (Undo) of a petty cash staff claim or top-up in the Petty Cash list. */
export function PettyCashClaimActions({ claim, companies }: { claim: ClaimEditData; companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(claim);
  const [companyIds, setCompanyIds] = useState<string[]>([claim.companyId, ...claim.sharedCompanyIds]);
  // receipts / photos added here (several at once), they join the ones attached
  const [receipts, setReceipts] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ClaimEditData>) => setF((p) => ({ ...p, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const where = splitCompanies(companyIds, claim.companyId);
      const uploaded: string[] = [];
      for (const file of receipts) uploaded.push(await uploadReceipt(where.companyId, file));
      const documentId: string | undefined = uploaded[0];
      const extraDocumentIds = uploaded.slice(1);
      const r = await updatePettyCashClaim(claim.id, { claimantName: f.claimant, claimantDepartment: f.department, category: f.category, description: f.description, amount: Number(f.amount), transactionDate: f.date, documentId, extraDocumentIds, remarks: f.remarks ?? "", invoiceNo: f.invoiceNo ?? "", ...where });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setReceipts([]);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordActions<PettyCashTransactionRow>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deletePettyCashClaim(claim.id)}
        onRestore={(row) => restorePettyCashClaim(row)}
        confirmText={`Delete this ${claim.type === "expense" ? "staff claim" : "top-up"} of RM ${claim.amount}?`}
      />
      {open && (
        <Dialog title={claim.type === "expense" ? "Edit staff claim" : "Edit top-up"} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><ErrorLine message={error} /></div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Company * (choose one or more)</label>
              <CompanyChips companies={companies} value={companyIds} onChange={setCompanyIds} />
            </div>
            {claim.type === "expense" && (
              <>
                <div>
                  <label className={LABEL}>Claimant *</label>
                  <input required className={FIELD} value={f.claimant} onChange={(e) => set({ claimant: e.target.value })} />
                </div>
                <div>
                  <label className={LABEL}>Department</label>
                  <input className={FIELD} value={f.department} onChange={(e) => set({ department: e.target.value })} />
                </div>
              </>
            )}
            <div>
              <label className={LABEL}>Date *</label>
              <input required type="date" max={todayInMalaysia()} className={FIELD} value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Amount (RM) *</label>
              <input required type="number" step="any" min="0" className={FIELD} value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
            </div>
            {claim.type === "expense" && (
              <div>
                <label className={LABEL}>Category (choose one or more)</label>
                <MultiChoiceSelect options={PETTY_CASH_CATEGORIES} value={splitCategories(f.category)} onChange={(list) => set({ category: joinCategories(list) })} placeholder="Select category" searchPlaceholder="Search category" />
              </div>
            )}
            <div>
              <label className={LABEL}>{claim.type === "expense" ? "What was bought?" : "Description"}</label>
              <input className={FIELD} value={f.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
            {claim.type === "expense" && (
              <div>
                <label className={LABEL}>{INVOICE_NO_LABEL}</label>
                <input className={FIELD} maxLength={100} value={f.invoiceNo ?? ""} onChange={(e) => set({ invoiceNo: e.target.value })} placeholder={INVOICE_NO_PLACEHOLDER} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={LABEL}>Remarks (optional, e.g. the event it was bought for)</label>
              <input className={FIELD} maxLength={500} value={f.remarks ?? ""} onChange={(e) => set({ remarks: e.target.value })} placeholder="e.g. JDT FC event, 12 Nov" />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Receipt / photo (optional)</label>
              <input type="file" multiple accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setReceipts(Array.from(e.target.files ?? []))} className="mt-1 block w-full text-[13px]" />
              <p className="mt-1 text-[11.5px] text-text-muted">
                {claim.hasReceipt ? "A receipt is already attached. Files chosen here are added to it (several at once)." : "No receipt yet. Choose the photos or files of the receipt (several at once)."}
              </p>
            </div>
            <div className="flex justify-end gap-2.5 sm:col-span-2">
              <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={busy}>
                {busy ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
