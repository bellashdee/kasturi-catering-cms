"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { errorMessage } from "@/lib/actionResult";
import { deleteProductionOrder, updateProductionOrderQuick } from "@/lib/driver/recordActions";
import { rememberDeleted } from "@/components/driver/RecordUndoBanner";

const inputClass = "mt-1 h-9 w-full rounded-md border border-border-strong bg-white px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[11.5px] font-semibold text-text-secondary";
const btn = "rounded-md border border-border-strong bg-white px-2.5 py-1 text-[12px] font-semibold text-text hover:border-primary hover:text-primary disabled:opacity-50";

/** Edit (Save / Cancel) and Delete (with Undo) of one production order in the Production Schedule. */
export function ProductionOrderRowActions({ id, initial, detailHref }: { id: string; initial: { plannedDate: string; paxCount: string; assignedStaff: string; prepTimeMinutes: string; notes: string }; detailHref: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof initial, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function run(work: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, after?: (r: Record<string, unknown>) => void) {
    setBusy(true);
    setError(null);
    try {
      const r = await work();
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
        return;
      }
      after?.(r);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run(
      () =>
        updateProductionOrderQuick({
          id,
          plannedDate: form.plannedDate,
          paxCount: form.paxCount.trim() ? Number(form.paxCount) : null,
          assignedStaff: form.assignedStaff,
          prepTimeMinutes: form.prepTimeMinutes.trim() ? Number(form.prepTimeMinutes) : null,
          notes: form.notes,
        }),
      () => setEditing(false),
    );
  }

  function remove() {
    if (!window.confirm(t("Delete this production order? You can undo it right after."))) return;
    void run(
      () => deleteProductionOrder(id),
      (r) => rememberDeleted(r.undo as Parameters<typeof rememberDeleted>[0]),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!editing && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className={btn}>
            Edit
          </button>
          <button type="button" disabled={busy} onClick={remove} className={`${btn} text-danger`}>
            Delete
          </button>
          <Link href={detailHref} className="text-[12px] font-semibold text-text-secondary hover:underline">
            Open (status, ingredients)
          </Link>
        </div>
      )}
      {editing && (
        <form onSubmit={save} className="rounded-lg border border-border bg-white p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div>
              <label className={labelClass}>Planned Date *</label>
              <input type="date" required value={form.plannedDate} onChange={(e) => set("plannedDate", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Pax</label>
              <input type="number" min={1} step="any" value={form.paxCount} onChange={(e) => set("paxCount", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Assigned staff</label>
              <input value={form.assignedStaff} onChange={(e) => set("assignedStaff", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Prep time (minutes)</label>
              <input type="number" min={0} step={1} value={form.prepTimeMinutes} onChange={(e) => set("prepTimeMinutes", e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className={labelClass}>Notes</label>
              <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60">
              {busy ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
                setForm(initial);
              }}
              className={btn}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}
