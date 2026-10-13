"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePurchaseList, setAllItemsStatus, updatePurchaseListItem } from "@/lib/purchaseList/actions";
import { PURCHASE_ITEM_STATUSES, PURCHASE_ITEM_STATUS_LABEL, STOCK_STATUS_LABEL } from "@/lib/purchaseList/constants";
import { formatQty } from "@/lib/purchaseList/calc";

export type ItemRow = {
  id: string;
  ingredient_name: string;
  unit: string | null;
  calculated_quantity: number | null;
  final_quantity: number | null;
  rounding_note: string | null;
  stock_status: string;
  stock_available: number | null;
  supplier: string | null;
  remark: string | null;
  status: string;
  flags: string[];
  breakdown: { menuLabel: string; baseQuantity: number | null; basePax: number; unit: string | null; quantity: number | null; note?: string }[];
};

const cell = "h-8 rounded border border-border-strong px-2 text-[12.5px] outline-none print:border-0 print:px-0";

function Row({ item }: { item: ItemRow }) {
  const router = useRouter();
  const [final, setFinal] = useState(item.final_quantity === null ? "" : String(item.final_quantity));
  const [supplier, setSupplier] = useState(item.supplier ?? "");
  const [remark, setRemark] = useState(item.remark ?? "");
  const [status, setStatus] = useState(item.status);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(patch: Parameters<typeof updatePurchaseListItem>[1]) {
    setError(null);
    setSaved(false);
    const result = await updatePurchaseListItem(item.id, patch);
    if (!result.ok) setError(result.error ?? "Could not save.");
    else {
      setSaved(true);
      router.refresh();
    }
  }

  const done = status === "purchased" || status === "received";

  return (
    <tr className={`border-t border-border align-top text-[12.5px] ${done ? "bg-success-bg/40" : ""}`}>
      <td className="px-3 py-2">
        <div className="font-semibold text-text">{item.ingredient_name}</div>
        {item.flags.map((f, i) => <div key={i} className="mt-0.5 text-[10.5px] font-semibold text-warning">⚠ {f}</div>)}
        <details className="mt-1 print:hidden">
          <summary className="cursor-pointer text-[10.5px] text-primary">Where it comes from ({item.breakdown.length})</summary>
          <div className="mt-1 text-[11px] text-text-secondary">
            {item.breakdown.map((b, i) => (
              <div key={i}>
                <span className="font-semibold text-text">{b.menuLabel}</span>: {b.baseQuantity === null ? "blank" : `${formatQty(b.baseQuantity)} ${b.unit ?? ""} per ${b.basePax} pax`} → {b.quantity === null ? "—" : `${formatQty(b.quantity)} ${b.unit ?? ""}`}
                {b.note && <span className="ml-1 text-warning">⚠ {b.note}</span>}
              </div>
            ))}
          </div>
        </details>
      </td>
      <td className="px-3 py-2 font-semibold text-text">{formatQty(item.calculated_quantity, 3)}</td>
      <td className="px-3 py-2 text-text-secondary">{item.unit ?? "—"}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          step="any"
          value={final}
          onChange={(e) => setFinal(e.target.value)}
          onBlur={() => {
            const next = final.trim() === "" ? null : Number(final);
            if (next !== item.final_quantity) save({ finalQuantity: next });
          }}
          className={`${cell} w-24`}
        />
        {item.rounding_note && <div className="mt-0.5 text-[10.5px] text-text-muted">{item.rounding_note}</div>}
      </td>
      <td className="px-3 py-2 text-text-secondary">
        {STOCK_STATUS_LABEL[item.stock_status]}
        {item.stock_available !== null && <div className="text-[10.5px]">{formatQty(item.stock_available)} {item.unit}</div>}
      </td>
      <td className="px-3 py-2"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} onBlur={() => supplier !== (item.supplier ?? "") && save({ supplier })} className={`${cell} w-28`} /></td>
      <td className="px-3 py-2"><input value={remark} onChange={(e) => setRemark(e.target.value)} onBlur={() => remark !== (item.remark ?? "") && save({ remark })} className={`${cell} w-32`} /></td>
      <td className="px-3 py-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            save({ status: e.target.value });
          }}
          className={`${cell} w-28`}
        >
          {PURCHASE_ITEM_STATUSES.map((s) => <option key={s} value={s}>{PURCHASE_ITEM_STATUS_LABEL[s]}</option>)}
        </select>
        {error && <div className="mt-0.5 text-[10.5px] text-danger">{error}</div>}
        {saved && !error && <div className="mt-0.5 text-[10.5px] text-success print:hidden">Saved</div>}
      </td>
    </tr>
  );
}

export function PurchaseListItemsTable({ items }: { items: ItemRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead className="bg-surface-alt">
          <tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
            <th className="px-3 py-2">Ingredient</th>
            <th className="px-3 py-2">Calculated</th>
            <th className="px-3 py-2">Unit</th>
            <th className="px-3 py-2">Buy</th>
            <th className="px-3 py-2">Stock</th>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">Remark</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>{items.map((it) => <Row key={it.id} item={it} />)}</tbody>
      </table>
    </div>
  );
}

export function PurchaseListToolbar({ listId, exportHref }: { listId: string; exportHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markAll(status: string) {
    if (!status) return;
    setBusy(true);
    setError(null);
    const r = await setAllItemsStatus(listId, status);
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Could not update.");
    else router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this purchase list? This cannot be undone.")) return;
    setBusy(true);
    const r = await deletePurchaseList(listId);
    if (!r.ok) {
      setBusy(false);
      setError(r.error ?? "Could not delete.");
      return;
    }
    router.push("/kitchen/purchase-lists");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-semibold text-text">Print / Save as PDF</button>
      <a href={exportHref} className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-semibold text-text">Export Excel</a>
      <select disabled={busy} defaultValue="" onChange={(e) => { markAll(e.target.value); e.target.value = ""; }} className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-[13px]">
        <option value="">Mark all as…</option>
        {PURCHASE_ITEM_STATUSES.map((s) => <option key={s} value={s}>{PURCHASE_ITEM_STATUS_LABEL[s]}</option>)}
      </select>
      <button type="button" disabled={busy} onClick={remove} className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-semibold text-danger">Delete</button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
