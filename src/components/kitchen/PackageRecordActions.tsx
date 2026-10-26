"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { deletePackageMenu, restorePackageMenu, updatePackageMenu, type PackageSnapshot } from "@/lib/kitchen/packages/actions";
import { PACKAGE_MEAL_TYPE_LABEL } from "@/lib/kitchen/constants";
import { AREA, BTN, BTN_GHOST, Dialog, ErrorLine, FIELD, LABEL } from "@/components/priority/ui";
import { RecordActions } from "@/components/shared/RecordActions";
import { Select } from "@/components/ui/Select";

export type PackageEditData = { id: string; name: string; pricePerPax: string; minimumPax: string; includedItems: string; specialRequirements: string; items: { mealType: string; itemName: string }[] };

/** Edit (Save / Cancel) and Delete (Undo) of a package menu. */
export function PackageActions({ pkg, listHref }: { pkg: PackageEditData; listHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pkg.name);
  const [price, setPrice] = useState(pkg.pricePerPax);
  const [minimum, setMinimum] = useState(pkg.minimumPax);
  const [included, setIncluded] = useState(pkg.includedItems);
  const [special, setSpecial] = useState(pkg.specialRequirements);
  const [items, setItems] = useState(pkg.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setItem = (i: number, patch: Partial<PackageEditData["items"][number]>) => setItems((p) => p.map((it, n) => (n === i ? { ...it, ...patch } : it)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await updatePackageMenu(pkg.id, { name, pricePerPax: Number(price), minimumPax: Number(minimum), includedItems: included, specialRequirements: special, items });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the package."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordActions<PackageSnapshot>
        onEdit={() => { setError(null); setOpen(true); }}
        onDelete={() => deletePackageMenu(pkg.id)}
        onRestore={(row) => restorePackageMenu(row)}
        afterClose={() => router.push(listHref)}
        confirmText={`Delete the package "${pkg.name}"?`}
      />
      {open && (
        <Dialog title={`Edit package: ${pkg.name}`} onClose={() => setOpen(false)} wide>
          <form onSubmit={save} className="flex flex-col gap-3">
            <ErrorLine message={error} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className={LABEL}>Package name *</label>
                <input required className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Price per pax (RM) *</label>
                <input required type="number" step="any" min="0" className={FIELD} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Minimum pax *</label>
                <input required type="number" step="1" min="0" className={FIELD} value={minimum} onChange={(e) => setMinimum(e.target.value)} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className={LABEL}>Menu lines</span>
                <button type="button" className="text-[12.5px] font-semibold text-primary" onClick={() => setItems((p) => [...p, { mealType: "lunch", itemName: "" }])}>
                  + Add line
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_3fr_3.5rem] items-center gap-1.5">
                    <Select className="h-9 rounded-md border border-border-strong bg-surface px-2 text-[13px]" value={it.mealType} onChange={(e) => setItem(i, { mealType: e.target.value })} aria-label="Meal">
                      {Object.entries(PACKAGE_MEAL_TYPE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </Select>
                    <input className="h-9 rounded-md border border-border-strong px-2 text-[13px]" value={it.itemName} onChange={(e) => setItem(i, { itemName: e.target.value })} aria-label="Menu line" />
                    <button type="button" className="text-right text-xs font-semibold text-danger" onClick={() => setItems((p) => p.filter((_, n) => n !== i))}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className={LABEL}>Included items</label>
              <textarea className={AREA} rows={2} value={included} onChange={(e) => setIncluded(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Special requirements</label>
              <textarea className={AREA} rows={2} value={special} onChange={(e) => setSpecial(e.target.value)} />
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
