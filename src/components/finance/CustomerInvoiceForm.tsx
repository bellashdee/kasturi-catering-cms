"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerInvoice, type CustomerInvoiceInput } from "@/lib/finance/actions";
import { DUPLICATE_INVOICE_MESSAGE } from "@/lib/finance/constants";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";

type Company = { id: string; name: string };
type Customer = { id: string; name: string; company_id: string };

type Extracted = {
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  description?: string | null;
  amount?: number | null;
  tax_amount?: number | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CustomerInvoiceForm({ companies, defaultCompanyId, customers }: { companies: Company[]; defaultCompanyId?: string; customers: Customer[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [customerId, setCustomerId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(() => `INV-${Date.now().toString().slice(-8)}`);
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | undefined>(undefined);
  const [extracting, setExtracting] = useState(false);
  const [extractNotice, setExtractNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicatePending, setDuplicatePending] = useState(false);

  const customersForCompany = customers.filter((c) => c.company_id === companyId);
  const total = (Number(amount) || 0) + (Number(taxAmount) || 0);

  async function handleExtract() {
    if (!file) return;
    setExtracting(true);
    setError(null);
    setExtractNotice(null);
    try {
      const doc = await uploadDocument({ companyId, module: "finance", fileType: fileTypeFromMime(file), file });
      setDocumentId(doc.id);
      const res = await fetch("/api/extract-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, kind: "customer_invoice" }),
      });
      const data = await res.json();
      if (data.configured === false) {
        setExtractNotice(data.message);
        return;
      }
      if (data.error) {
        setExtractNotice("Could not read the file automatically — the file is attached, fill in the fields below manually.");
        return;
      }
      const extracted = data.extracted as Extracted;
      if (extracted.invoice_number) setInvoiceNumber(extracted.invoice_number);
      if (extracted.invoice_date) setInvoiceDate(extracted.invoice_date);
      if (extracted.due_date) setDueDate(extracted.due_date);
      if (extracted.description) setDescription(extracted.description);
      if (extracted.amount != null) setAmount(String(extracted.amount));
      if (extracted.tax_amount != null) setTaxAmount(String(extracted.tax_amount));
      setExtractNotice("This information was extracted automatically — check every field below before saving.");
    } catch (err) {
      setExtractNotice(err instanceof Error ? err.message : "Could not process the file.");
    } finally {
      setExtracting(false);
    }
  }

  async function submit(confirmDuplicate: boolean) {
    setSaving(true);
    setError(null);
    const payload: CustomerInvoiceInput = {
      companyId,
      customerId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      description: description || undefined,
      amount: Number(amount) || 0,
      taxAmount: Number(taxAmount) || 0,
      documentId,
      confirmDuplicate,
    };
    try {
      const created = await createCustomerInvoice(payload);
      router.push(`/finance/invoices/${created.id}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (message.includes(DUPLICATE_INVOICE_MESSAGE)) {
        setDuplicatePending(true);
        setError("An invoice with this number already exists for this company.");
      } else {
        setError(message);
      }
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("Select a customer.");
      return;
    }
    setDuplicatePending(false);
    await submit(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
          {duplicatePending && (
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={saving} onClick={() => submit(true)} className="rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                Save anyway
              </button>
              <button type="button" onClick={() => { setDuplicatePending(false); setError(null); }} className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-bold text-text">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border-strong p-3">
        <label className="text-[12.5px] font-semibold text-text-secondary">Upload invoice file (optional — auto-fills fields below)</label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="file"
            accept={ANY_UPLOAD_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block flex-1 text-sm"
          />
          <button type="button" onClick={handleExtract} disabled={!file || extracting} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-bold text-text disabled:opacity-50">
            {extracting ? "Reading..." : "Extract"}
          </button>
        </div>
        {extractNotice && <p className="mt-1.5 text-xs text-text-secondary">{extractNotice}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Company *</label>
          <select required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setCustomerId(""); }} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Customer *</label>
          <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none">
            <option value="">Select customer</option>
            {customersForCompany.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {customersForCompany.length === 0 && (
            <p className="mt-1 text-xs text-text-muted">No customers found for this company yet — add one in Catering first.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Invoice Number *</label>
          <input required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none" />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Invoice Date *</label>
          <input type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none" />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Due Date *</label>
          <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none" />
        </div>
      </div>

      <div>
        <label className="text-[12.5px] font-semibold text-text-secondary">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Amount (RM) *</label>
          <input type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none" />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Tax / SST (RM)</label>
          <input type="number" min="0" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none" />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Total (RM)</label>
          <div className="mt-1.5 flex h-10 w-full items-center rounded-lg border border-border-strong bg-surface-alt px-3 text-sm font-semibold text-text">
            {total.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Invoice"}
        </button>
      </div>
    </form>
  );
}
