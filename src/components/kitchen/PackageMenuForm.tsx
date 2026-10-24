"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageNameInput } from "@/components/kitchen/PackageNameInput";
import { createPackageMenu, type PackageMenuInput } from "@/lib/kitchen/packages/actions";
import { PACKAGE_MEAL_TYPE_LABEL } from "@/lib/kitchen/constants";

type Company = { id: string; name: string };
type Item = { mealType: string; itemName: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";
const MEAL_TYPES = Object.keys(PACKAGE_MEAL_TYPE_LABEL);

function emptyItem(): Item {
  return { mealType: "breakfast", itemName: "" };
}

export function PackageMenuForm({ companies, defaultCompanyId, existing }: { companies: Company[]; defaultCompanyId?: string; existing: { companyId: string; name: string }[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [name, setName] = useState("");
  const [pricePerPax, setPricePerPax] = useState("");
  const [minimumPax, setMinimumPax] = useState("1");
  const [includedItems, setIncludedItems] = useState("");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const companyNames = useMemo(() => existing.filter((e) => e.companyId === companyId).map((e) => e.name), [existing, companyId]);
  const exists = useMemo(() => {
    const n = name.trim().replace(/\s+/g, " ").toUpperCase();
    return n !== "" && companyNames.some((x) => x.trim().replace(/\s+/g, " ").toUpperCase() === n);
  }, [name, companyNames]);

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
    const payload: PackageMenuInput = {
      companyId,
      name,
      pricePerPax: Number(pricePerPax) || 0,
      minimumPax: Number(minimumPax) || 1,
      includedItems: includedItems || undefined,
      specialRequirements: specialRequirements || undefined,
      items,
    };
    try {
      const created = await createPackageMenu(payload);
      router.push(`/kitchen/packages/${created.id}`);
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
          <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Package Name *</label>
          <PackageNameInput required value={name} onChange={setName} names={companyNames} className={inputClass} placeholder="Search or type a package name" />
          {exists && <div className="mt-1 text-[12px] font-semibold text-warning">A package with this name already exists. Check the list before creating another.</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Price per Pax (RM) *</label>
          <input type="number" min="0" step="0.01" required value={pricePerPax} onChange={(e) => setPricePerPax(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Minimum Pax *</label>
          <input type="number" min="1" required value={minimumPax} onChange={(e) => setMinimumPax(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>Menu Items (by meal slot)</label>
          <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem()])} className="text-[12.5px] font-semibold text-primary">
            + Add Item
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2">
              <select value={item.mealType} onChange={(e) => updateItem(i, "mealType", e.target.value)} className="h-9 rounded-lg border border-border-strong px-2 text-[13px]">
                {MEAL_TYPES.map((m) => <option key={m} value={m}>{PACKAGE_MEAL_TYPE_LABEL[m]}</option>)}
              </select>
              <input value={item.itemName} onChange={(e) => updateItem(i, "itemName", e.target.value)} placeholder="Item name" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
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

      <div>
        <label className={labelClass}>Included Items (summary)</label>
        <textarea value={includedItems} onChange={(e) => setIncludedItems(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div>
        <label className={labelClass}>Special Requirements</label>
        <textarea value={specialRequirements} onChange={(e) => setSpecialRequirements(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Package"}
        </button>
      </div>
    </form>
  );
}
