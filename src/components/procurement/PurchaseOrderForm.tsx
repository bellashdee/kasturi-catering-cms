"use client";

import { todayInMalaysia } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseOrder, type PurchaseOrderInput } from "@/lib/procurement/actions";
import type { ItemSuggestion } from "@/lib/procurement/itemSuggestions";
import { ItemNameInput } from "@/components/procurement/ItemNameInput";

type Company = { id: string; name: string };
type Supplier = { id: string; name: string; company_id: string };
type Item = { itemName: string; quantity: string; unitPrice: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function emptyItem(): Item {
  return { itemName: "", quantity: "1", unitPrice: "" };
}

function todayIso(): string {
  return todayInMalaysia();
}

export function PurchaseOrderForm({
  companies,
  defaultCompanyId,
  suppliers,
  procurementRequestId,
  defaultItemName,
  defaultQuantity,
  suggestions = [],
}: {
  companies: Company[];
  defaultCompanyId?: string;
  suppliers: Supplier[];
  procurementRequestId?: string;
  defaultItemName?: string;
  defaultQuantity?: string;
  /** Names offered while typing an item: items ordered before, stock items, menu ingredients. */
  suggestions?: ItemSuggestion[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState(() => `PO-${Date.now().toString().slice(-8)}`);
  const [orderDate, setOrderDate] = useState(todayIso());
  const [items, setItems] = useState<Item[]>([
    defaultItemName ? { itemName: defaultItemName, quantity: defaultQuantity ?? "1", unitPrice: "" } : emptyItem(),
  ]);

  const suppliersForCompany = suppliers.filter((s) => s.company_id === companyId);
  const suggestionsForCompany = suggestions.filter((s) => s.companyId === companyId);
  const total = items.reduce((t, i) => t + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  /** Picking a listed item fills its name and, when the price box is still empty, the last price it was ordered at. */
  function pickSuggestion(index: number, s: ItemSuggestion) {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = { ...current, itemName: s.name, unitPrice: current.unitPrice === "" && s.lastPrice !== undefined ? String(s.lastPrice) : current.unitPrice };
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError("Select a supplier.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: PurchaseOrderInput = {
      companyId,
      poNumber,
      supplierId,
      orderDate,
      procurementRequestId,
      items: items
        .filter((i) => i.itemName.trim())
        .map((i) => ({ itemName: i.itemName.trim(), quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) || 0 })),
    };
    try {
      const created = await createPurchaseOrder(payload);
      router.push(`/supplier-procurement/orders/${created.id}`);
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
          <label className={labelClass}>Company *</label>
          <select required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setSupplierId(""); }} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Supplier *</label>
          <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
            <option value="">Select supplier</option>
            {suppliersForCompany.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>PO Number *</label>
          <input required value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Order Date *</label>
          <input type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>Items</label>
          <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem()])} className="text-[12.5px] font-semibold text-primary">
            + Add Item
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[2fr_0.8fr_1fr_1fr_auto] items-center gap-2">
              <ItemNameInput value={item.itemName} onChange={(v) => updateItem(i, "itemName", v)} onPick={(s) => pickSuggestion(i, s)} suggestions={suggestionsForCompany} supplierId={supplierId} />
              <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} placeholder="Qty" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} placeholder="Unit Price" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
              <div className="text-[13px] text-text-secondary">RM {((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toFixed(2)}</div>
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={items.length === 1}
                className="text-xs font-semibold text-danger disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-text-muted">Start typing an item (e.g. &quot;bawang&quot;) to see items ordered before, stock items and menu ingredients. You can also type a new item.</p>
        <div className="mt-2 text-right text-[14px] font-bold text-text">Total: RM {total.toFixed(2)}</div>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Purchase Order"}
        </button>
      </div>
    </form>
  );
}
