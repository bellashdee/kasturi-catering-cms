"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMenu, type MenuInput } from "@/lib/kitchen/actions";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };
type Item = { name: string; category: string; pricePerPax: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function emptyItem(): Item {
  return { name: "", category: "main", pricePerPax: "" };
}

export function MenuForm({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId?: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Item[]>([emptyItem()]);

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: MenuInput = {
      companyId,
      name,
      description: description || undefined,
      items: items
        .filter((i) => i.name.trim())
        .map((i) => ({ name: i.name.trim(), category: i.category, pricePerPax: Number(i.pricePerPax) || 0 })),
    };
    try {
      const created = await createMenu(payload);
      router.push(`/kitchen/menus/${created.id}`);
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
          <Select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Menu Name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Standard Corporate Package" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>Menu Items</label>
          <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem()])} className="text-[12.5px] font-semibold text-primary">
            + Add Item
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-2">
              <input value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Item name" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
              <Select value={item.category} onChange={(e) => updateItem(i, "category", e.target.value)} className="h-9 rounded-lg border border-border-strong px-2 text-[13px]">
                <option value="appetizer">Appetizer</option>
                <option value="main">Main</option>
                <option value="side">Side</option>
                <option value="dessert">Dessert</option>
                <option value="beverage">Beverage</option>
                <option value="other">Other</option>
              </Select>
              <input type="number" min="0" step="0.01" value={item.pricePerPax} onChange={(e) => updateItem(i, "pricePerPax", e.target.value)} placeholder="RM / pax" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
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
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Menu"}
        </button>
      </div>
    </form>
  );
}
