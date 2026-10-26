"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { formatPrice } from "@/lib/format";
import { deletePurchaseOrder, restorePurchaseOrder, updatePurchaseOrder, updatePurchaseOrderStatus, type PurchaseOrderSnapshot } from "@/lib/procurement/actions";
import { PO_STATUS_LABEL } from "@/lib/procurement/constants";
import { eventsText, purchaseOrderMessage, whatsappLink } from "@/lib/procurement/whatsapp";
import { StatusBadge } from "@/components/StatusBadge";
import { PurchaseOrderStatusSelect } from "@/components/procurement/PurchaseOrderStatusSelect";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Select } from "@/components/ui/Select";

export type BoardItem = { id: string; itemName: string; quantity: number; unit: string | null; unitPrice: number };
export type BoardOrder = { id: string; poNumber: string; orderDate: string; status: string; total: number; sourceEvents: string | null; companyName: string; items: BoardItem[] };
export type BoardSupplier = { id: string; name: string; phone: string | null; contactPerson: string | null; orders: BoardOrder[] };

type EditItem = { itemName: string; quantity: string; unit: string; unitPrice: string };

const COMMON_UNITS = ["kg", "g", "pcs", "pack", "box", "carton", "bag", "bottle", "can", "litre", "ml", "tray", "bunch", "dozen", "tin", "roll", "set", "head"];
const inputClass = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

function statusTone(status: string): "success" | "danger" | "info" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  if (status === "sent" || status === "acknowledged") return "info";
  return "warning";
}

const qty = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * Purchase orders by supplier. Each order shows its events (name and date) and the items to order with their quantities; it can be
 * edited (Save / Cancel), deleted (with Undo) and sent to the supplier on WhatsApp, which opens the chat with the list typed in.
 */
export function PurchaseOrdersBoard({ suppliers, query }: { suppliers: BoardSupplier[]; query: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [undo, setUndo] = useState<{ snapshot: PurchaseOrderSnapshot; label: string } | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const shown = useMemo(() => {
    const words = search.trim().toUpperCase().split(/\s+/).filter(Boolean);
    return suppliers
      .map((s) => ({
        ...s,
        orders: s.orders.filter((o) => {
          if (status && o.status !== status) return false;
          const hay = `${s.name} ${o.poNumber} ${o.sourceEvents ?? ""} ${o.companyName} ${o.items.map((i) => i.itemName).join(" ")}`.toUpperCase();
          return words.every((w) => hay.includes(w));
        }),
      }))
      .filter((s) => s.orders.length > 0);
  }, [suppliers, search, status]);

  async function putBack() {
    if (!undo) return;
    setUndoBusy(true);
    setUndoError(null);
    try {
      const r = await restorePurchaseOrder(undo.snapshot);
      if (!r.ok) {
        setUndoError(r.error);
        return;
      }
      setUndo(null);
      router.refresh();
    } catch (err) {
      setUndoError(errorMessage(err, "Could not put the purchase order back."));
    } finally {
      setUndoBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {undo && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-bg px-4 py-2.5 text-[13px] text-text">
          <span>{t("Deleted: {po}", { po: undo.label })}</span>
          <span className="flex items-center gap-3">
            {undoError && <span className="text-danger">{undoError}</span>}
            <button type="button" disabled={undoBusy} onClick={putBack} className="font-bold text-primary hover:underline disabled:opacity-50">
              {undoBusy ? "Putting back..." : "Undo"}
            </button>
            <button type="button" onClick={() => setUndo(null)} className="font-semibold text-text-muted hover:text-text">
              Close
            </button>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier, event, item or PO number" aria-label="Search" className={`${inputClass} max-w-md flex-1`} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={`${inputClass} w-auto`}>
          <option value="">All statuses</option>
          {Object.entries(PO_STATUS_LABEL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
      </div>

      {shown.length === 0 && <div className="rounded-xl border border-border bg-surface px-5 py-8 text-center text-[13.5px] text-text-muted shadow-sm">No purchase orders to show.</div>}

      {shown.map((s) => (
        <section key={s.id} className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
            <div>
              <div className="text-[15px] font-extrabold text-text">{s.name}</div>
              <div className="text-[12px] text-text-muted">
                {s.phone ? <>WhatsApp / phone: {s.phone}</> : "No phone number saved for this supplier."}
                {!s.phone && (
                  <>
                    {" "}
                    <Link href={`/supplier-procurement/${s.id}/edit${query}`} className="font-semibold text-primary hover:underline">
                      Add the phone number
                    </Link>
                  </>
                )}
              </div>
            </div>
            <div className="text-[12.5px] font-semibold text-text-secondary">{s.orders.length} {s.orders.length === 1 ? "order" : "orders"}</div>
          </div>
          <div className="divide-y divide-border">
            {s.orders.map((o) => (
              <OrderBlock key={o.id} order={o} supplier={s} query={query} onDeleted={(snapshot) => { setUndoError(null); setUndo({ snapshot, label: o.poNumber }); }} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function OrderBlock({ order, supplier, query, onDeleted }: { order: BoardOrder; supplier: BoardSupplier; query: string; onDeleted: (snapshot: PurchaseOrderSnapshot) => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState(order.orderDate);
  const [events, setEvents] = useState(order.sourceEvents ?? "");
  const [items, setItems] = useState<EditItem[]>([]);

  const message = purchaseOrderMessage({
    companyName: order.companyName,
    contactPerson: supplier.contactPerson,
    poNumber: order.poNumber,
    orderDate: order.orderDate,
    sourceEvents: order.sourceEvents,
    items: order.items.map((i) => ({ itemName: i.itemName, quantity: i.quantity, unit: i.unit })),
  });
  const link = whatsappLink(supplier.phone, message);

  function startEdit() {
    setOrderDate(order.orderDate);
    setEvents(order.sourceEvents ?? "");
    setItems(order.items.map((i) => ({ itemName: i.itemName, quantity: qty(i.quantity), unit: i.unit ?? "", unitPrice: String(i.unitPrice) })));
    setError(null);
    setEditing(true);
  }

  const setItem = (index: number, patch: Partial<EditItem>) => setItems((prev) => prev.map((it, n) => (n === index ? { ...it, ...patch } : it)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updatePurchaseOrder(order.id, {
        orderDate,
        sourceEvents: events,
        items: items.filter((i) => i.itemName.trim()).map((i) => ({ itemName: i.itemName.trim(), quantity: Number(i.quantity), unit: i.unit.trim() || undefined, unitPrice: i.unitPrice === "" ? 0 : Number(i.unitPrice) })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the purchase order."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("Delete purchase order {po}? You can undo it straight after.", { po: order.poNumber }))) return;
    setBusy(true);
    setError(null);
    try {
      const r = await deletePurchaseOrder(order.id);
      if (!r.ok || !r.restore) {
        setError(r.error ?? "Could not delete the purchase order.");
        return;
      }
      onDeleted(r.restore);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete the purchase order."));
    } finally {
      setBusy(false);
    }
  }

  /** WhatsApp opens in its own tab; a draft order is marked as sent (it can be set back with the status box). */
  async function sent() {
    if (order.status !== "draft") return;
    try {
      await updatePurchaseOrderStatus(order.id, "sent");
      router.refresh();
    } catch {
      /* the status can still be changed by hand */
    }
  }

  const total = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-3 bg-surface-alt/40 px-5 py-4">
        <div className="text-[13.5px] font-bold text-text">Edit {order.poNumber}</div>
        {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
          <div>
            <label className={labelClass}>Order date *</label>
            <input type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={`${inputClass} mt-1`} />
          </div>
          <div>
            <label className={labelClass}>Event name and date</label>
            <input value={events} onChange={(e) => setEvents(e.target.value)} maxLength={500} placeholder="e.g. Majlis Perkahwinan Ali (25/12/2026)" className={`${inputClass} mt-1`} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex min-w-[640px] flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-2 text-[12px] font-bold text-text-secondary">
              <div>Item to order</div>
              <div>Qty</div>
              <div>Unit</div>
              <div>Unit price (RM)</div>
              <div className="text-right">Total (RM)</div>
              <div />
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem] items-center gap-2">
                <input value={item.itemName} onChange={(e) => setItem(i, { itemName: e.target.value })} aria-label="Item" className={inputClass} />
                <input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} aria-label="Qty" className={inputClass} />
                <input list="board-units" maxLength={20} value={item.unit} onChange={(e) => setItem(i, { unit: e.target.value })} aria-label="Unit" className={inputClass} />
                <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} aria-label="Unit price (RM)" className={inputClass} />
                <div className="text-right text-[13px] font-bold tabular-nums text-text">{((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toFixed(2)}</div>
                <button type="button" onClick={() => setItems((prev) => prev.filter((_, n) => n !== i))} disabled={items.length === 1} className="text-right text-xs font-semibold text-danger disabled:opacity-40">
                  Remove
                </button>
              </div>
            ))}
            <datalist id="board-units">
              {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
            </datalist>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setItems((prev) => [...prev, { itemName: "", quantity: "1", unit: "", unitPrice: "" }])} className="text-[12.5px] font-semibold text-primary">
            + Add Item
          </button>
          <div className="text-[13.5px] font-bold text-text">Total: {formatPrice(total)}</div>
        </div>
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={() => setEditing(false)} disabled={busy} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/supplier-procurement/orders/${order.id}${query}`} className="text-[14px] font-bold text-text hover:underline">{order.poNumber}</Link>
            <StatusBadge tone={statusTone(order.status)}>{PO_STATUS_LABEL[order.status] ?? order.status}</StatusBadge>
          </div>
          <div className="mt-0.5 text-[12.5px] text-text-secondary">{order.companyName} · Order date {order.orderDate}</div>
          <div className="mt-0.5 text-[13px] text-text">
            <span className="font-semibold">Event: </span>
            {order.sourceEvents ? eventsText(order.sourceEvents) : <span className="text-text-muted">not linked to an event</span>}
          </div>
        </div>
        <PurchaseOrderStatusSelect poId={order.id} status={order.status} />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[11.5px] font-bold uppercase tracking-wide text-text-muted">
              <th className="py-1.5 pr-3">Item to order</th>
              <th className="px-3 py-1.5 text-right">Qty</th>
              <th className="px-3 py-1.5">Unit</th>
              <th className="px-3 py-1.5 text-right">Unit price</th>
              <th className="py-1.5 pl-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {order.items.map((i) => (
              <tr key={i.id}>
                <td className="py-1.5 pr-3 font-semibold text-text">{i.itemName}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-text">{qty(i.quantity)}</td>
                <td className="px-3 py-1.5 text-text-secondary">{i.unit ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-text-secondary">{i.unitPrice.toFixed(2)}</td>
                <td className="py-1.5 pl-3 text-right font-bold tabular-nums text-text">{(i.quantity * i.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-2 text-right text-[12.5px] font-bold text-text">Total</td>
              <td className="pt-2 text-right text-[14px] font-extrabold tabular-nums text-text">{formatPrice(order.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" onClick={sent} className="rounded-lg bg-[#1FA855] px-3.5 py-2 text-[13px] font-bold text-white hover:opacity-90">
            Send to supplier on WhatsApp
          </a>
        ) : (
          <button type="button" disabled title="Save the supplier's phone number first" className="cursor-not-allowed rounded-lg bg-[#1FA855] px-3.5 py-2 text-[13px] font-bold text-white opacity-40">
            Send to supplier on WhatsApp
          </button>
        )}
        <button type="button" onClick={startEdit} disabled={busy} className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-semibold text-text hover:border-primary hover:text-primary">
          Edit
        </button>
        <button type="button" onClick={remove} disabled={busy} className="rounded-lg border border-danger/40 bg-surface px-3.5 py-2 text-[13px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-60">
          {busy ? "Deleting..." : "Delete"}
        </button>
        <Link href={`/supplier-procurement/orders/${order.id}${query}`} className="ml-auto text-[12.5px] font-semibold text-text-secondary hover:text-text hover:underline">
          Open order / record invoice
        </Link>
      </div>
      {error && <div role="alert" className="mt-2 text-[12px] text-danger">{error}</div>}
    </div>
  );
}
