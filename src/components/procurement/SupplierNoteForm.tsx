"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplierNote, updateSupplierNote, type NoteInput } from "@/lib/procurement/noteActions";
import type { ItemSuggestion } from "@/lib/procurement/itemSuggestions";
import { ItemNameInput } from "@/components/procurement/ItemNameInput";
import { Select } from "@/components/ui/Select";
import { gridEnterKey, useFormShortcuts } from "@/lib/formShortcuts";
import { todayInMalaysia } from "@/lib/format";

type Company = { id: string; name: string };
type Supplier = { id: string; name: string; company_id: string };
type InvoiceOption = { id: string; invoiceNumber: string; supplierId: string; companyId: string };
type Item = { itemCode: string; itemName: string; quantity: string; uom: string; unitPrice: string };
export type NoteInitial = { supplierId: string; noteNumber: string; noteDate: string; supplierInvoiceId: string; reason: string; items: Item[] };

const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const cellClass = "h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";
const emptyItem = (): Item => ({ itemCode: "", itemName: "", quantity: "1", uom: "", unitPrice: "" });
const COLS = "grid-cols-[minmax(0,0.9fr)_minmax(0,2.2fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.1fr)_4.5rem]";

/** A credit note or debit note of a supplier: keyed in like an accounting system (Enter moves on, Insert adds a row, Ctrl+S saves). */
export function SupplierNoteForm({
  noteType,
  companies,
  defaultCompanyId,
  suppliers,
  invoices,
  suggestions = [],
  noteId,
  initial,
}: {
  noteType: "credit" | "debit";
  companies: Company[];
  defaultCompanyId?: string;
  suppliers: Supplier[];
  invoices: InvoiceOption[];
  suggestions?: ItemSuggestion[];
  noteId?: string;
  initial?: NoteInitial;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [noteNumber, setNoteNumber] = useState(initial?.noteNumber ?? `${noteType === "credit" ? "CN" : "DN"}-${Date.now().toString().slice(-8)}`);
  const [noteDate, setNoteDate] = useState(initial?.noteDate ?? todayInMalaysia());
  const [invoiceId, setInvoiceId] = useState(initial?.supplierInvoiceId ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [items, setItems] = useState<Item[]>(initial?.items?.length ? initial.items : [emptyItem()]);

  const word = noteType === "credit" ? "Credit Note" : "Debit Note";
  const suppliersForCompany = suppliers.filter((s) => s.company_id === companyId);
  const invoicesForSupplier = invoices.filter((i) => i.supplierId === supplierId);
  const suggestionsForCompany = suggestions.filter((s) => s.companyId === companyId);
  const total = items.reduce((t, i) => t + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

  const addRow = () => setItems((prev) => [...prev, emptyItem()]);
  useFormShortcuts(
    { save: () => formRef.current?.requestSubmit(), addRow, removeRow: (index) => setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== index) : prev)) },
    gridRef,
    items.length,
  );

  function update(index: number, field: keyof Item, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function pick(index: number, s: ItemSuggestion) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, itemName: s.name, itemCode: it.itemCode || s.code || "", uom: it.uom || s.unit || "", unitPrice: it.unitPrice === "" && s.lastPrice !== undefined ? String(s.lastPrice) : it.unitPrice } : it,
      ),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const payload: NoteInput = {
      companyId,
      supplierId,
      noteType,
      noteNumber,
      noteDate,
      supplierInvoiceId: invoiceId || undefined,
      reason,
      items: items.map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, quantity: Number(i.quantity) || 0, uom: i.uom, unitPrice: Number(i.unitPrice) || 0 })),
    };
    const result = noteId ? await updateSupplierNote(noteId, payload) : await createSupplierNote(payload);
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push(`/supplier-procurement/notes/${result.id}`);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company *</label>
          <Select required disabled={!!noteId} value={companyId} onChange={(e) => { setCompanyId(e.target.value); setSupplierId(""); setInvoiceId(""); }} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Supplier *</label>
          <Select required value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setInvoiceId(""); }} className={inputClass}>
            <option value="">Select supplier</option>
            {suppliersForCompany.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>{word} No. *</label>
          <input required value={noteNumber} onChange={(e) => setNoteNumber(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" required value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>For invoice (optional)</label>
          <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className={inputClass}>
            <option value="">Not linked</option>
            {invoicesForSupplier.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber}</option>)}
          </Select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Reason</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={noteType === "credit" ? "e.g. goods returned, wrong price charged" : "e.g. extra charge, price difference"} className={inputClass} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>Items</label>
          <button type="button" onClick={addRow} className="text-[12.5px] font-semibold text-primary">+ Add Item (Insert)</button>
        </div>
        <div className="overflow-x-auto pb-1">
          <div ref={gridRef} onKeyDown={(e) => gridEnterKey(e, gridRef.current, addRow, items.length)} className="flex min-w-[760px] flex-col gap-2">
            <div className={`grid ${COLS} gap-2 text-[12.5px] font-bold text-text-secondary`}>
              <div>Code</div><div>Item</div><div>Qty</div><div>UOM</div><div>Unit price (RM)</div><div className="text-right">Amount (RM)</div><div />
            </div>
            {items.map((item, i) => (
              <div key={i} data-row={i} className={`grid ${COLS} items-center gap-2`}>
                <input value={item.itemCode} onChange={(e) => update(i, "itemCode", e.target.value)} placeholder="Code" aria-label="Item code" className={cellClass} />
                <ItemNameInput value={item.itemName} onChange={(v) => update(i, "itemName", v)} onPick={(s) => pick(i, s)} suggestions={suggestionsForCompany} supplierId={supplierId} />
                <input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => update(i, "quantity", e.target.value)} aria-label="Quantity" className={cellClass} />
                <input maxLength={20} value={item.uom} onChange={(e) => update(i, "uom", e.target.value)} placeholder="kg, pcs" aria-label="UOM" className={cellClass} />
                <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => update(i, "unitPrice", e.target.value)} placeholder="0.00" aria-label="Unit price" className={cellClass} />
                <div className="text-right text-[14px] font-bold tabular-nums text-text">{((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toFixed(2)}</div>
                <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} disabled={items.length === 1} className="text-right text-xs font-semibold text-danger disabled:opacity-40">Remove</button>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-text-muted">Shortcuts: Enter = next box (a new row after the last box) · Tab = complete the item · Insert or Alt+N = new row · Ctrl+Delete = remove row · Ctrl+S = save.</p>
        <div className="mt-2 text-right text-[14px] font-bold text-text">Total: RM {total.toFixed(2)}</div>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : noteId ? "Save Changes" : `Save ${word}`}
        </button>
      </div>
    </form>
  );
}
