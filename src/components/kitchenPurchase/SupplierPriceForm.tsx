"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordSupplierPrice } from "@/lib/kitchenPurchase/quoteActions";
import { UNITS } from "@/lib/kitchenPurchase/shared";

const input = "h-11 w-full rounded-lg border border-border-strong bg-white px-3 text-[14px] outline-none focus:border-primary";

/** Enter a new offered price for an item. The older prices stay in the history. */
export function SupplierPriceForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ supplierId: "", itemName: "", unit: "KG", price: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await recordSupplierPrice({ supplierId: f.supplierId, itemName: f.itemName, unit: f.unit, pricePerUnit: Number(f.price), note: f.note });
      if (!r.ok) setError(r.error);
      else {
        setF((x) => ({ ...x, itemName: "", price: "", note: "" }));
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="text-[14px] font-bold text-text">Enter a price offered by a supplier</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_9rem]">
        <select value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)} className={input} aria-label="Supplier">
          <option value="">Supplier...</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input value={f.itemName} onChange={(e) => set("itemName", e.target.value)} placeholder="Item name (for example Butter)" className={input} />
        <select value={f.unit} onChange={(e) => set("unit", e.target.value)} className={input} aria-label="Unit">
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))} placeholder="RM per unit" className={input} />
      </div>
      <input value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Note (optional)" className={input} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="h-11 rounded-lg bg-primary px-5 text-[14px] font-bold text-white disabled:opacity-60">
          {busy ? "Saving..." : "Save price"}
        </button>
        {error && (
          <span role="alert" className="text-[13px] text-danger">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
