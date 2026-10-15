"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPurchaseOrdersFromList, fillSuggestedSuppliers, type OrdersFromListResult } from "@/lib/purchaseList/actions";
import { StatusBadge } from "@/components/StatusBadge";

export type SupplierGroup = {
  /** The supplier written on the lines ("" = none chosen yet). */
  supplier: string;
  /** true when it is a real supplier of the company (so a purchase order can be made for it). */
  known: boolean;
  lines: { id: string; name: string; quantity: number | null; unit: string | null; poId: string | null; poNumber: string | null }[];
};

const qty = (n: number | null) => (n === null ? "—" : String(Math.round(n * 1000) / 1000));

/**
 * "Order by supplier": the lines of the list grouped by the supplier that supplies them, and one button that makes a draft
 * purchase order for each supplier (with the item, quantity and unit of every line).
 */
export function PurchaseListOrderPanel({ listId, groups, canOrder, query }: { listId: string; groups: SupplierGroup[]; canOrder: boolean; query: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"fill" | "order" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<OrdersFromListResult | null>(null);

  async function fill() {
    setBusy("fill");
    setMessage(null);
    const r = await fillSuggestedSuppliers(listId);
    setBusy(null);
    setMessage(r.ok ? (r.filled ? `Suppliers filled in for ${r.filled} line(s).` : "No supplier could be suggested for the blank lines (no stock supplier or earlier order found).") : r.error ?? "Could not fill in the suppliers.");
    if (r.ok) router.refresh();
  }

  async function order() {
    if (!window.confirm("Create a draft purchase order for each supplier below? Lines that already have an order are skipped.")) return;
    setBusy("order");
    setMessage(null);
    const r = await createPurchaseOrdersFromList(listId);
    setBusy(null);
    setResult(r);
    if (r.ok) router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-text">Order by supplier</div>
          <p className="mt-0.5 max-w-2xl text-[13px] text-text-secondary">
            The lines below are grouped by the supplier that supplies them. Each supplier gets one draft purchase order with the item, quantity and unit.
          </p>
        </div>
        {canOrder && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={fill} disabled={busy !== null} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text disabled:opacity-60">
              {busy === "fill" ? "Filling in..." : "Fill in suppliers"}
            </button>
            <button type="button" onClick={order} disabled={busy !== null} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
              {busy === "order" ? "Creating..." : "Create purchase orders"}
            </button>
          </div>
        )}
      </div>

      {message && <div className="mt-3 rounded-lg border border-border bg-surface-alt px-3 py-2 text-[13px] text-text">{message}</div>}
      {result && !result.ok && <div className="mt-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{result.error}</div>}
      {result?.ok && (
        <div className="mt-3 rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">
          <div className="font-bold">Purchase orders created (draft):</div>
          <ul className="mt-1">
            {result.created?.map((c) => (
              <li key={c.id}>
                <Link href={`/supplier-procurement/orders/${c.id}${query}`} className="font-semibold underline">{c.poNumber}</Link> · {c.supplier} · {c.lines} item(s)
              </li>
            ))}
          </ul>
        </div>
      )}
      {result?.skipped && result.skipped.length > 0 && (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] text-text">
          <div className="font-bold">Not ordered yet:</div>
          <ul className="mt-1 list-disc pl-5">
            {result.skipped.map((s) => (
              <li key={s.reason}>{s.reason}: {s.items.join(", ")}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.supplier || "none"} className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-alt px-3 py-2">
              <div className="min-w-0 truncate text-[14px] font-bold text-text">{g.supplier || "No supplier chosen"}</div>
              {!g.supplier ? <StatusBadge tone="warning">Choose a supplier</StatusBadge> : !g.known ? <StatusBadge tone="warning">Not in supplier list</StatusBadge> : <StatusBadge tone="success">Supplier</StatusBadge>}
            </div>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left text-[12.5px] font-bold text-text-secondary">
                  <th className="px-3 py-1.5">Item</th>
                  <th className="px-3 py-1.5 text-right">Qty</th>
                  <th className="px-3 py-1.5">Unit</th>
                  <th className="px-3 py-1.5">Order</th>
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium text-text">{l.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-text">{qty(l.quantity)}</td>
                    <td className="px-3 py-1.5 text-text-secondary">{l.unit ?? "—"}</td>
                    <td className="px-3 py-1.5 text-text-secondary">
                      {l.poId ? <Link href={`/supplier-procurement/orders/${l.poId}${query}`} className="font-semibold text-primary">{l.poNumber}</Link> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
