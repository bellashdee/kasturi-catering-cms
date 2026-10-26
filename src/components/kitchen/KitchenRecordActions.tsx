"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import {
  deleteIngredient,
  deleteMenu,
  deletePurchaseRequest,
  restoreIngredient,
  restoreMenu,
  restorePurchaseRequest,
  updateMenu,
  updatePurchaseRequest,
  type IngredientRow,
  type MenuSnapshot,
  type PurchaseRequestRow,
} from "@/lib/kitchen/actions";
import { MENU_CATEGORY_LABEL } from "@/lib/kitchen/constants";
import { AREA, BTN, BTN_GHOST, Dialog, ErrorLine, FIELD, LABEL } from "@/components/priority/ui";
import { RecordActions } from "@/components/shared/RecordActions";

/** Edit (Save / Cancel) and Delete (Undo) of a purchase request that is not received yet. */
export function PurchaseRequestRecordActions({ id, name, quantity, unit, requiredDate, notes, status }: { id: string; name: string; quantity: string; unit: string; requiredDate: string; notes: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(quantity);
  const [unitText, setUnitText] = useState(unit);
  const [date, setDate] = useState(requiredDate);
  const [note, setNote] = useState(notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status === "completed") return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updatePurchaseRequest(id, { quantity: Number(qty), unit: unitText, requiredDate: date, notes: note });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordActions<PurchaseRequestRow>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deletePurchaseRequest(id)}
        onRestore={(row) => restorePurchaseRequest(row)}
        confirmText={`Delete the purchase request for "${name}"?`}
      />
      {open && (
        <Dialog title={`Edit purchase request: ${name}`} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="flex flex-col gap-3">
            <ErrorLine message={error} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Quantity *</label>
                <input required type="number" step="any" min="0" className={FIELD} value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Unit</label>
                <input className={FIELD} value={unitText} onChange={(e) => setUnitText(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Required date</label>
              <input type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Notes</label>
              <textarea className={AREA} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
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

/** Delete (and Undo) of an ingredient on its page; the list is shown again when the bar is closed. */
export function IngredientDeleteAction({ id, name, listHref }: { id: string; name: string; listHref: string }) {
  const router = useRouter();
  return (
    <RecordActions<IngredientRow>
      onDelete={() => deleteIngredient(id)}
      onRestore={(row) => restoreIngredient(row)}
      afterClose={() => router.push(listHref)}
      confirmText={`Delete the ingredient "${name}"?`}
    />
  );
}

export type MenuEditData = { id: string; name: string; description: string; items: { name: string; category: string; pricePerPax: string }[] };

/** Edit (Save / Cancel) and Delete (Undo) of a menu and its items. */
export function MenuActions({ menu, listHref }: { menu: MenuEditData; listHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(menu.name);
  const [description, setDescription] = useState(menu.description);
  const [items, setItems] = useState(menu.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setItem = (i: number, patch: Partial<MenuEditData["items"][number]>) => setItems((p) => p.map((it, n) => (n === i ? { ...it, ...patch } : it)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updateMenu(menu.id, { name, description, items: items.map((i) => ({ name: i.name, category: i.category, pricePerPax: i.pricePerPax.trim() === "" ? null : Number(i.pricePerPax) })) });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the menu."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordActions<MenuSnapshot>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deleteMenu(menu.id)}
        onRestore={(row) => restoreMenu(row)}
        afterClose={() => router.push(listHref)}
        confirmText={`Delete the menu "${menu.name}" with its ${menu.items.length} item(s)?`}
      />
      {open && (
        <Dialog title={`Edit menu: ${menu.name}`} onClose={() => setOpen(false)} wide>
          <form onSubmit={save} className="flex flex-col gap-3">
            <ErrorLine message={error} />
            <div>
              <label className={LABEL}>Menu name *</label>
              <input required className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Description</label>
              <input className={FIELD} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className={LABEL}>Items</span>
                <button type="button" className="text-[12.5px] font-semibold text-primary" onClick={() => setItems((p) => [...p, { name: "", category: Object.keys(MENU_CATEGORY_LABEL)[0], pricePerPax: "" }])}>
                  + Add item
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[2fr_1.2fr_0.9fr_3.5rem] items-center gap-1.5">
                    <input className="h-9 rounded-md border border-border-strong px-2 text-[13px]" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} aria-label="Item" />
                    <select className="h-9 rounded-md border border-border-strong bg-surface px-2 text-[13px]" value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} aria-label="Category">
                      {Object.entries(MENU_CATEGORY_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <input className="h-9 rounded-md border border-border-strong px-2 text-[13px]" type="number" step="any" min="0" placeholder="RM / pax" value={it.pricePerPax} onChange={(e) => setItem(i, { pricePerPax: e.target.value })} aria-label="Price per pax" />
                    <button type="button" className="text-right text-xs font-semibold text-danger" onClick={() => setItems((p) => p.filter((_, n) => n !== i))}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
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
