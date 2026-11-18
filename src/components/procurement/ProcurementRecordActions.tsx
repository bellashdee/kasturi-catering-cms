"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import {
  deleteProcurementRequest,
  deleteSupplier,
  deleteSupplierInvoice,
  restoreProcurementRequest,
  restoreSupplier,
  restoreSupplierInvoice,
  updateProcurementRequest,
  updateSupplierInvoice,
  type InvoiceSnapshot,
  type RequestSnapshot,
  type SupplierRow,
} from "@/lib/procurement/actions";
import { AREA, BTN, BTN_GHOST, Dialog, ErrorLine, FIELD, LABEL } from "@/components/priority/ui";
import { RecordActions } from "@/components/shared/RecordActions";
import { AutoCountInvoiceField } from "@/components/procurement/AutoCountInvoiceField";

/** Delete (and Undo) of a supplier on its page; the supplier list is shown again when the bar is closed. */
export function SupplierDeleteAction({ supplierId, name, listHref }: { supplierId: string; name: string; listHref: string }) {
  const router = useRouter();
  return (
    <RecordActions<SupplierRow>
      onDelete={() => deleteSupplier(supplierId)}
      onRestore={(row) => restoreSupplier(row)}
      afterClose={() => router.push(listHref)}
      confirmText={`Delete the supplier "${name}"?`}
    />
  );
}

export type InvoiceEditData = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  department: string;
  autoCountInvoiceNo: string;
  items: { itemCode: string; itemName: string; uom: string; quantity: string; unitPrice: string; discount: string; lineTotal: string }[];
};

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

/** Edit (Save / Cancel) and Delete (Undo) of a supplier invoice; the figures are saved exactly as typed. */
export function InvoiceActions({ invoice, listHref }: { invoice: InvoiceEditData; listHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(invoice.invoiceNumber);
  const [date, setDate] = useState(invoice.invoiceDate);
  const [due, setDue] = useState(invoice.dueDate);
  const [amount, setAmount] = useState(invoice.amount);
  const [department, setDepartment] = useState(invoice.department);
  const [autoCountNo, setAutoCountNo] = useState(invoice.autoCountInvoiceNo);
  const [items, setItems] = useState(invoice.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setItem = (i: number, patch: Partial<InvoiceEditData["items"][number]>) => setItems((prev) => prev.map((it, n) => (n === i ? { ...it, ...patch } : it)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updateSupplierInvoice(invoice.id, {
        invoiceNumber: number,
        invoiceDate: date,
        dueDate: due,
        amount: num(amount),
        department,
        autoCountInvoiceNo: autoCountNo,
        items: items.map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, uom: i.uom, quantity: num(i.quantity), unitPrice: num(i.unitPrice), discount: i.discount.trim() === "" ? undefined : num(i.discount), lineTotal: num(i.lineTotal) })),
      });
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

  const cell = "h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-primary";
  return (
    <>
      <RecordActions<InvoiceSnapshot>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deleteSupplierInvoice(invoice.id)}
        onRestore={(row) => restoreSupplierInvoice(row)}
        afterClose={() => router.push(listHref)}
        confirmText={`Delete invoice ${invoice.invoiceNumber}?`}
      />
      {open && (
        <Dialog title={`Edit invoice ${invoice.invoiceNumber}`} onClose={() => setOpen(false)} wide>
          <form onSubmit={save} className="flex flex-col gap-4">
            <ErrorLine message={error} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Invoice number *</label>
                <input required className={FIELD} value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Amount (RM) *</label>
                <input required type="number" step="any" min="0" className={FIELD} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Invoice date *</label>
                <input required type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Due date *</label>
                <input required type="date" className={FIELD} value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Department</label>
                <input className={FIELD} value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <AutoCountInvoiceField value={autoCountNo} onChange={setAutoCountNo} inputClassName={FIELD} labelClassName={LABEL} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className={LABEL}>Lines (exactly as printed on the invoice)</span>
                <button type="button" className="text-[12.5px] font-semibold text-primary" onClick={() => setItems((p) => [...p, { itemCode: "", itemName: "", uom: "", quantity: "", unitPrice: "", discount: "", lineTotal: "" }])}>
                  + Add line
                </button>
              </div>
              <div className="overflow-x-auto">
                <div className="flex min-w-[760px] flex-col gap-1.5">
                  <div className="grid grid-cols-[0.8fr_2fr_0.6fr_0.7fr_0.8fr_0.7fr_0.9fr_3.5rem] gap-1.5 text-[11.5px] font-bold text-text-secondary">
                    <div>Code</div><div>Item</div><div>UOM</div><div>Qty</div><div>Unit price</div><div>Discount</div><div>Line total</div><div />
                  </div>
                  {items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[0.8fr_2fr_0.6fr_0.7fr_0.8fr_0.7fr_0.9fr_3.5rem] items-center gap-1.5">
                      <input className={cell} value={it.itemCode} onChange={(e) => setItem(i, { itemCode: e.target.value })} aria-label="Code" />
                      <input className={cell} value={it.itemName} onChange={(e) => setItem(i, { itemName: e.target.value })} aria-label="Item" />
                      <input className={cell} value={it.uom} onChange={(e) => setItem(i, { uom: e.target.value })} aria-label="UOM" />
                      <input className={cell} type="number" step="any" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} aria-label="Qty" />
                      <input className={cell} type="number" step="any" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} aria-label="Unit price" />
                      <input className={cell} type="number" step="any" value={it.discount} onChange={(e) => setItem(i, { discount: e.target.value })} aria-label="Discount" />
                      <input className={cell} type="number" step="any" value={it.lineTotal} onChange={(e) => setItem(i, { lineTotal: e.target.value })} aria-label="Line total" />
                      <button type="button" className="text-right text-xs font-semibold text-danger" onClick={() => setItems((p) => p.filter((_, n) => n !== i))}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-1.5 text-[11.5px] text-text-muted">Nothing is calculated for you: every number is saved as you type it.</p>
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

export type RequestEditData = { id: string; itemName: string; quantity: string; estimatedCost: string; department: string; reason: string; status: string };

/** Edit (Save / Cancel) and Delete (Undo) of an item request that is not a purchase order yet. */
export function RequestEditActions({ request, listHref, onGone }: { request: RequestEditData; listHref?: string; onGone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState(request.itemName);
  const [quantity, setQuantity] = useState(request.quantity);
  const [cost, setCost] = useState(request.estimatedCost);
  const [department, setDepartment] = useState(request.department);
  const [reason, setReason] = useState(request.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (request.status === "converted") return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updateProcurementRequest(request.id, { itemName: item, quantity: Number(quantity), estimatedCost: cost.trim() === "" ? null : Number(cost), department, reason });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordActions<RequestSnapshot>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deleteProcurementRequest(request.id)}
        onRestore={(row) => restoreProcurementRequest(row)}
        afterClose={() => (listHref ? router.push(listHref) : (onGone ?? (() => router.refresh()))())}
        confirmText={`Delete the request for "${request.itemName}"?`}
      />
      {open && (
        <Dialog title="Edit item request" onClose={() => setOpen(false)}>
          <form onSubmit={save} className="flex flex-col gap-3">
            <ErrorLine message={error} />
            <div>
              <label className={LABEL}>Item *</label>
              <input required className={FIELD} value={item} onChange={(e) => setItem(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Quantity *</label>
                <input required type="number" step="any" min="0" className={FIELD} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Estimated cost (RM)</label>
                <input type="number" step="any" min="0" className={FIELD} value={cost} onChange={(e) => setCost(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Department</label>
              <input className={FIELD} value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Reason</label>
              <textarea className={AREA} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
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
