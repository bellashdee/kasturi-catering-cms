"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import {
  deleteCustomer,
  deleteEvent,
  deleteQuotation,
  restoreCustomer,
  restoreEvent,
  restoreQuotation,
  updateCustomer,
  updateQuotation,
  type CustomerRow,
  type EventSnapshot,
  type QuotationSnapshot,
} from "@/lib/catering/actions";
import { AREA, BTN, BTN_GHOST, Dialog, ErrorLine, FIELD, LABEL } from "@/components/priority/ui";
import { RecordActions } from "@/components/shared/RecordActions";

/** Delete (and Undo) of an event on its page; the event list is shown again when the bar is closed. */
export function EventDeleteAction({ eventId, name, listHref }: { eventId: string; name: string; listHref: string }) {
  const router = useRouter();
  return (
    <RecordActions<EventSnapshot>
      onDelete={() => deleteEvent(eventId)}
      onRestore={(row) => restoreEvent(row)}
      afterClose={() => router.push(listHref)}
      confirmText={`Delete the event "${name}"?`}
    />
  );
}

export type QuotationEditData = { id: string; number: string; status: string; items: { itemName: string; quantity: string; unitPrice: string; discountPercent: string }[] };

/** Edit (Save / Cancel) and Delete (Undo) of a quotation that is not accepted yet. */
export function QuotationRecordActions({ quotation }: { quotation: QuotationEditData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(quotation.number);
  const [items, setItems] = useState(quotation.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (quotation.status === "accepted") return null;
  const setItem = (i: number, patch: Partial<QuotationEditData["items"][number]>) => setItems((p) => p.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  const total = items.reduce((t, i) => t + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) * (1 - (Number(i.discountPercent) || 0) / 100), 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updateQuotation(quotation.id, { quotationNumber: number, items: items.map((i) => ({ itemName: i.itemName, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountPercent: Number(i.discountPercent) || 0 })) });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the quotation."));
    } finally {
      setBusy(false);
    }
  }

  const cell = "h-9 rounded-md border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-primary";
  return (
    <>
      <RecordActions<QuotationSnapshot>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deleteQuotation(quotation.id)}
        onRestore={(row) => restoreQuotation(row)}
        confirmText={`Delete quotation ${quotation.number}?`}
      />
      {open && (
        <Dialog title={`Edit quotation ${quotation.number}`} onClose={() => setOpen(false)} wide>
          <form onSubmit={save} className="flex flex-col gap-3">
            <ErrorLine message={error} />
            <div>
              <label className={LABEL}>Quotation number *</label>
              <input required className={FIELD} value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className={LABEL}>Items</span>
                <button type="button" className="text-[12.5px] font-semibold text-primary" onClick={() => setItems((p) => [...p, { itemName: "", quantity: "1", unitPrice: "", discountPercent: "0" }])}>
                  + Add item
                </button>
              </div>
              <div className="overflow-x-auto">
                <div className="flex min-w-[560px] flex-col gap-1.5">
                  <div className="grid grid-cols-[2.4fr_0.8fr_1fr_0.9fr_3.5rem] gap-1.5 text-[11.5px] font-bold text-text-secondary">
                    <div>Item</div><div>Qty</div><div>Unit price (RM)</div><div>Discount %</div><div />
                  </div>
                  {items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[2.4fr_0.8fr_1fr_0.9fr_3.5rem] items-center gap-1.5">
                      <input className={cell} value={it.itemName} onChange={(e) => setItem(i, { itemName: e.target.value })} aria-label="Item" />
                      <input className={cell} type="number" step="any" min="0" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} aria-label="Qty" />
                      <input className={cell} type="number" step="any" min="0" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} aria-label="Unit price" />
                      <input className={cell} type="number" step="any" min="0" max="100" value={it.discountPercent} onChange={(e) => setItem(i, { discountPercent: e.target.value })} aria-label="Discount %" />
                      <button type="button" className="text-right text-xs font-semibold text-danger" onClick={() => setItems((p) => p.filter((_, n) => n !== i))}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 text-right text-[13.5px] font-bold text-text">Total: RM {total.toFixed(2)}</div>
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

export type CustomerEditData = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  registrationNo: string;
  billingAddress: string;
  deliveryAddress: string;
  area: string;
  creditTerm: string;
  notes: string;
};

/** Edit (Save / Cancel) and Delete (Undo) of a customer on its page. */
export function CustomerActions({ customer, listHref }: { customer: CustomerEditData; listHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(customer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<CustomerEditData>) => setF((p) => ({ ...p, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updateCustomer(customer.id, { name: f.name, contactPerson: f.contactPerson, phone: f.phone, email: f.email, registrationNo: f.registrationNo, billingAddress: f.billingAddress, deliveryAddress: f.deliveryAddress, area: f.area, creditTerm: f.creditTerm, notes: f.notes });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the customer."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordActions<CustomerRow>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deleteCustomer(customer.id)}
        onRestore={(row) => restoreCustomer(row)}
        afterClose={() => router.push(listHref)}
        confirmText={`Delete the customer "${customer.name}"?`}
      />
      {open && (
        <Dialog title={`Edit customer: ${customer.name}`} onClose={() => setOpen(false)} wide>
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><ErrorLine message={error} /></div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Name *</label>
              <input required className={FIELD} value={f.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Contact person</label>
              <input className={FIELD} value={f.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Phone</label>
              <input className={FIELD} value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Email</label>
              <input type="email" className={FIELD} value={f.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Registration no.</label>
              <input className={FIELD} value={f.registrationNo} onChange={(e) => set({ registrationNo: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Billing address</label>
              <input className={FIELD} value={f.billingAddress} onChange={(e) => set({ billingAddress: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Delivery address</label>
              <input className={FIELD} value={f.deliveryAddress} onChange={(e) => set({ deliveryAddress: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Area</label>
              <input className={FIELD} value={f.area} onChange={(e) => set({ area: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Credit term</label>
              <input className={FIELD} value={f.creditTerm} onChange={(e) => set({ creditTerm: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Notes</label>
              <textarea className={AREA} rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
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
