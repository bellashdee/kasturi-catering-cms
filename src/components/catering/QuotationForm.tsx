"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createQuotation } from "@/lib/catering/actions";
import { formatCurrency } from "@/lib/format";
import type { QuotationSeedRow } from "@/lib/catering/days";

type Row = { itemName: string; quantity: string; unitPrice: string; discountPercent: string };

const emptyRow: Row = { itemName: "", quantity: "1", unitPrice: "", discountPercent: "0" };

function lineTotal(row: Row): number {
  const qty = Number(row.quantity) || 0;
  const price = Number(row.unitPrice) || 0;
  const discount = Number(row.discountPercent) || 0;
  return qty * price * (1 - discount / 100);
}

const seedToRows = (seed: QuotationSeedRow[]): Row[] =>
  seed.map((r) => ({ itemName: r.itemName, quantity: String(r.quantity), unitPrice: String(r.unitPrice), discountPercent: "0" }));

export function QuotationForm({ companyId, eventId, seedRows = [] }: { companyId: string; eventId: string; seedRows?: QuotationSeedRow[] }) {
  const router = useRouter();
  const [quotationNumber, setQuotationNumber] = useState(() => `Q-${Date.now().toString().slice(-6)}`);
  const [rows, setRows] = useState<Row[]>(seedRows.length > 0 ? seedToRows(seedRows) : [{ ...emptyRow }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => rows.reduce((t, r) => t + lineTotal(r), 0), [rows]);

  function updateRow(i: number, field: keyof Row, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...emptyRow }]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validRows = rows.filter((r) => r.itemName.trim() && Number(r.unitPrice) > 0);
    if (validRows.length === 0) {
      setError("Add at least one item with a name and price.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createQuotation({
        companyId,
        eventId,
        quotationNumber,
        items: validRows.map((r) => ({
          itemName: r.itemName,
          quantity: Number(r.quantity) || 0,
          unitPrice: Number(r.unitPrice) || 0,
          discountPercent: Number(r.discountPercent) || 0,
        })),
      });
      router.push(`/catering/${eventId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div>
        <label className="text-[12.5px] font-semibold text-text-secondary">Quotation Number</label>
        <input value={quotationNumber} onChange={(e) => setQuotationNumber(e.target.value)} className="mt-1.5 h-10 w-full max-w-xs rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
      </div>

      {seedRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs text-text-secondary">
          <span>Lines were filled from the event (one per day, pax × price per pax). Check them and edit if needed.</span>
          <button type="button" onClick={() => setRows(seedToRows(seedRows))} className="font-semibold text-primary">
            Refill from event
          </button>
        </div>
      )}

      <div className="rounded-lg border border-border">
        <div className="grid grid-cols-[2fr_0.8fr_1fr_0.8fr_1fr_0.4fr] gap-2 border-b border-border bg-surface-alt px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
          <div>Item</div>
          <div>Qty</div>
          <div>Price (RM)</div>
          <div>Discount %</div>
          <div>Total</div>
          <div></div>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[2fr_0.8fr_1fr_0.8fr_1fr_0.4fr] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
            <input value={row.itemName} onChange={(e) => updateRow(i, "itemName", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" placeholder="e.g. Nasi Briyani Set" />
            <input type="number" min="0" step="0.5" value={row.quantity} onChange={(e) => updateRow(i, "quantity", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" />
            <input type="number" min="0" step="0.01" value={row.unitPrice} onChange={(e) => updateRow(i, "unitPrice", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" />
            <input type="number" min="0" max="100" step="1" value={row.discountPercent} onChange={(e) => updateRow(i, "discountPercent", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" />
            <div className="text-[13px] font-semibold text-text">{formatCurrency(lineTotal(row))}</div>
            <button type="button" onClick={() => removeRow(i)} className="text-xs font-semibold text-danger">✕</button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addRow} className="self-start text-[12.5px] font-semibold text-primary">
        + Add Item
      </button>

      <div className="flex justify-end border-t border-border pt-3 text-[15px] font-bold text-text">
        Total: {formatCurrency(total)}
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Quotation"}
        </button>
      </div>
    </form>
  );
}
