"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerInvoice, type CustomerInvoiceInput } from "@/lib/finance/actions";

type Company = { id: string; name: string };
type Customer = { id: string; name: string; company_id: string };

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
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customersForCompany = customers.filter((c) => c.company_id === companyId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("Select a customer.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: CustomerInvoiceInput = {
      companyId,
      customerId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      amount: Number(amount) || 0,
    };
    try {
      const created = await createCustomerInvoice(payload);
      router.push(`/finance-admin/invoices/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

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
        <label className="text-[12.5px] font-semibold text-text-secondary">Amount (RM) *</label>
        <input type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 h-10 w-full max-w-xs rounded-lg border border-border-strong px-3 text-sm outline-none" />
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
