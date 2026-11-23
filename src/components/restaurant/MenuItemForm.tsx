"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMenuItem, setItemFlags } from "@/lib/restaurant/menuActions";
import { STATIONS, type Category, type MenuItem } from "@/lib/restaurant/menuData";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_GRID_3, SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** One menu item: the details (code, name, category, price, station, preparation time, portion, FeedMe name) and its flags. An item is never deleted: it is deactivated. */
export function MenuItemForm({ companyId, item, categories, canEdit, canPrice, query }: { companyId: string; item?: MenuItem; categories: Category[]; canEdit: boolean; canPrice: boolean; query: string }) {
  const router = useRouter();
  const [f, setF] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    description: item?.description ?? "",
    categoryId: item?.category_id ?? "",
    price: item?.price === null || item?.price === undefined ? "" : String(item.price),
    station: item?.station ?? "",
    prep: item?.prep_minutes === null || item?.prep_minutes === undefined ? "" : String(item.prep_minutes),
    portion: item?.portion_text ?? "",
    feedme: item?.feedme_name ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...patch }));
    setSaved(false);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await saveMenuItem({
        companyId,
        id: item?.id,
        code: f.code,
        name: f.name,
        description: f.description,
        categoryId: f.categoryId,
        price: num(f.price),
        station: f.station,
        prepMinutes: num(f.prep),
        portionText: f.portion,
        feedmeName: f.feedme,
      });
      if (!r.ok) setError(r.error);
      else if (!item) router.push(`/restaurant/menu/${r.id}${query}`);
      else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function flag(patch: { isAvailable?: boolean; isActive?: boolean }) {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const r = await setItemFlags(item.id, patch);
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const dis = !canEdit;
  return (
    <form onSubmit={save} className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-bold text-text">{item ? "Menu item" : "New menu item"}</div>
        {item && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={item.is_active ? "success" : "neutral"}>{item.is_active ? "Active" : "Deactivated"}</StatusBadge>
            <StatusBadge tone={item.is_available ? "success" : "warning"}>{item.is_available ? "Available" : "Temporarily unavailable"}</StatusBadge>
          </div>
        )}
      </div>
      {error && <div role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {saved && <div role="status" className="mb-3 rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">Saved.</div>}
      <div className={SPEND_GRID_3}>
        <div>
          <label className={SPEND_LABEL}>Code (SKU) *</label>
          <input value={f.code} onChange={(e) => set({ code: e.target.value })} disabled={dis} maxLength={30} className={SPEND_INPUT} required />
        </div>
        <div className="sm:col-span-2">
          <label className={SPEND_LABEL}>Name *</label>
          <input value={f.name} onChange={(e) => set({ name: e.target.value })} disabled={dis} className={SPEND_INPUT} required />
        </div>
        <div>
          <label className={SPEND_LABEL}>Category</label>
          <Select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })} disabled={dis} className={SPEND_INPUT}>
            <option value="">— none —</option>
            {categories.filter((c) => c.is_active || c.id === f.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={SPEND_LABEL}>Menu price (RM)</label>
          <input inputMode="decimal" type="number" min="0" step="0.01" value={f.price} onChange={(e) => set({ price: e.target.value })} disabled={dis || !canPrice} className={SPEND_INPUT} />
          <div className={SPEND_HINT}>{canPrice ? "The price on the menu, before the 10% service charge and SST that FeedMe adds on the bill" : "Only a Manager or an Admin sets the price. The price is before service charge and SST"}</div>
        </div>
        <div>
          <label className={SPEND_LABEL}>Kitchen station</label>
          <Select value={f.station} onChange={(e) => set({ station: e.target.value })} disabled={dis} className={SPEND_INPUT}>
            <option value="">— none —</option>
            {STATIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <label className={SPEND_LABEL}>Preparation time (minutes)</label>
          <input inputMode="numeric" type="number" min="0" max="600" step="1" value={f.prep} onChange={(e) => set({ prep: e.target.value })} disabled={dis} className={SPEND_INPUT} />
        </div>
        <div>
          <label className={SPEND_LABEL}>Portion size</label>
          <input value={f.portion} onChange={(e) => set({ portion: e.target.value })} disabled={dis} className={SPEND_INPUT} placeholder="e.g. 1 fish, about 450 g" />
        </div>
        <div>
          <label className={SPEND_LABEL}>FeedMe product name</label>
          <input value={f.feedme} onChange={(e) => set({ feedme: e.target.value })} disabled={dis} className={SPEND_INPUT} placeholder="As written in FeedMe" />
          <div className={SPEND_HINT}>So the sales of this item can be matched later</div>
        </div>
        <div className="sm:col-span-3">
          <label className={SPEND_LABEL}>Description</label>
          <input value={f.description} onChange={(e) => set({ description: e.target.value })} disabled={dis} className={SPEND_INPUT} />
        </div>
      </div>
      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy} className={SPEND_SAVE_BTN}>{busy ? "Saving..." : item ? "Save the item" : "Create the item"}</button>
          {item && (
            <>
              <button type="button" disabled={busy} onClick={() => flag({ isAvailable: !item.is_available })} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
                {item.is_available ? "Mark temporarily unavailable" : "Mark available again"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (item.is_active && !window.confirm("Deactivate this item? It stays in the records and in the reports; it is not deleted.")) return;
                  void flag({ isActive: !item.is_active });
                }}
                className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-danger"
              >
                {item.is_active ? "Deactivate" : "Activate again"}
              </button>
            </>
          )}
        </div>
      )}
    </form>
  );
}
