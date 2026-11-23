"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCategory, setCategoryActive } from "@/lib/restaurant/menuActions";
import type { Category } from "@/lib/restaurant/menuData";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

/** The categories of the menu (Fresh Seafood, Fish, Grilled ...): add one, rename one, deactivate one. A category is never deleted. */
export function CategoriesPanel({ companyId, categories, canEdit }: { companyId: string; categories: Category[]; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const r = await work();
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Something went wrong. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <summary className="cursor-pointer text-[15px] font-bold text-text">Categories ({categories.filter((c) => c.is_active).length})</summary>
      <div className="mt-3 flex flex-col gap-3">
        {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] ${c.is_active ? "border-border-strong text-text" : "border-border text-text-muted line-through"}`}>
              {editing?.id === c.id ? (
                <input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} className="h-6 w-32 rounded border border-border-strong px-1 text-[12.5px]" />
              ) : (
                c.name
              )}
              {canEdit && (
                editing?.id === c.id ? (
                  <button type="button" disabled={busy} onClick={async () => { if (await run(() => saveCategory({ companyId, id: c.id, name: editing.name, sortOrder: c.sort_order }))) setEditing(null); }} className="font-semibold text-primary">Save</button>
                ) : (
                  <>
                    <button type="button" onClick={() => setEditing({ id: c.id, name: c.name })} className="font-semibold text-primary">Rename</button>
                    <button type="button" disabled={busy} onClick={() => run(() => setCategoryActive(c.id, !c.is_active))} className="font-semibold text-danger">{c.is_active ? "Deactivate" : "Activate"}</button>
                  </>
                )
              )}
              {!c.is_active && <StatusBadge tone="neutral">Deactivated</StatusBadge>}
            </span>
          ))}
        </div>
        {canEdit && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => saveCategory({ companyId, name, sortOrder: categories.length + 1 }))) setName("");
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div>
              <label className={SPEND_LABEL}>New category</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${SPEND_INPUT} w-56`} required />
            </div>
            <button type="submit" disabled={busy} className={SPEND_SAVE_BTN}>Add</button>
          </form>
        )}
      </div>
    </details>
  );
}
