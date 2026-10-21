"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBudget, updateBudget } from "@/lib/finance/actions";
import { departmentChoices } from "@/lib/finance/constants";
import { AREA, BTN, BTN_GHOST, BTN_SM_GHOST, Dialog, FIELD, LABEL } from "@/components/priority/ui";

/** Edit (amount, department, notes) and Delete of one budget. */
export function BudgetRowActions({ id, label, amount, department, notes }: { id: string; label: string; amount: number; department: string | null; notes: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: String(amount), department: department ?? "", notes: notes ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(task: () => Promise<void>, after?: () => void) {
    setError(null);
    start(async () => {
      try {
        await task();
        after?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        className={BTN_SM_GHOST}
        onClick={() => {
          setError(null);
          setForm({ amount: String(amount), department: department ?? "", notes: notes ?? "" });
          setOpen(true);
        }}
      >
        Edit
      </button>
      <button type="button" className={BTN_SM_GHOST} disabled={pending} onClick={() => window.confirm(`Delete the budget "${label}"?`) && run(() => deleteBudget(id))}>
        Delete
      </button>
      {error && !open && <span className="text-[12px] font-semibold text-danger">{error}</span>}
      {open && (
        <Dialog title={`Edit budget — ${label}`} onClose={() => setOpen(false)}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateBudget(id, { budgetedAmount: Number(form.amount), department: form.department, notes: form.notes }), () => setOpen(false));
            }}
          >
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Budgeted amount (RM) *</label>
                <input required type="number" step="0.01" min="0" className={FIELD} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Department</label>
                <select className={FIELD} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  <option value="">Company-wide (no department)</option>
                  {departmentChoices(form.department).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL}>Notes</label>
              <textarea rows={3} className={AREA} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2.5">
              <button type="button" className={BTN_GHOST} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </span>
  );
}
