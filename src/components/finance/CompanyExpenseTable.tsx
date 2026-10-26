"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { deleteCompanyExpense, restoreCompanyExpense, updateCompanyExpense, type CompanyExpenseRow } from "@/lib/finance/actions";
import { departmentChoices } from "@/lib/finance/constants";
import { AREA, BTN, BTN_GHOST, BTN_SM_GHOST, Dialog, FIELD, LABEL } from "@/components/priority/ui";
import { Select } from "@/components/ui/Select";

export type ExpenseListRow = {
  id: string;
  companyName: string;
  category: string;
  department: string | null;
  amount: number;
  expenseDate: string;
  notes: string | null;
};

type Draft = { id: string; category: string; department: string; amount: string; expenseDate: string; notes: string };

/** The company expenses with Edit and Delete on every row; a deleted expense can be put back with Undo. */
export function CompanyExpenseTable({ rows, categories }: { rows: ExpenseListRow[]; categories: string[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ row: CompanyExpenseRow; label: string } | null>(null);
  const [pending, start] = useTransition();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  function edit(r: ExpenseListRow) {
    setError(null);
    setDraft({ id: r.id, category: r.category, department: r.department ?? "", amount: String(r.amount), expenseDate: r.expenseDate, notes: r.notes ?? "" });
  }

  function save() {
    if (!draft) return;
    setError(null);
    start(async () => {
      try {
        await updateCompanyExpense(draft.id, {
          category: draft.category,
          department: draft.department,
          amount: Number(draft.amount),
          expenseDate: draft.expenseDate,
          notes: draft.notes,
        });
        setDraft(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function remove(r: ExpenseListRow) {
    if (!window.confirm(`Delete this expense (${r.category} · ${formatCurrency(r.amount)})? You can undo it right after.`)) return;
    setError(null);
    start(async () => {
      try {
        const deleted = await deleteCompanyExpense(r.id);
        setUndo({ row: deleted, label: `${r.category} · ${formatCurrency(r.amount)}` });
        if (undoTimer.current) clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setUndo(null), 15000);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function undoDelete() {
    if (!undo) return;
    const row = undo.row;
    start(async () => {
      try {
        await restoreCompanyExpense(row);
        setUndo(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  const categoryChoices = draft && !categories.includes(draft.category) ? [...categories, draft.category] : categories;

  return (
    <div>
      {(undo || error) && !draft && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-alt px-5 py-2.5 text-[13px]">
          {error && <span className="font-semibold text-danger">{error}</span>}
          {undo && (
            <>
              <span className="text-text">{`Deleted: ${undo.label}`}</span>
              <button type="button" className={BTN_SM_GHOST} disabled={pending} onClick={undoDelete}>
                Undo
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-[0.9fr_1fr_0.9fr_0.9fr_1.4fr_auto] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
        <div>Date</div>
        <div>Category</div>
        <div>Amount</div>
        <div>Department</div>
        <div>Company / Notes</div>
        <div>Action</div>
      </div>
      {rows.map((e) => (
        <div key={e.id} className="grid grid-cols-[0.9fr_1fr_0.9fr_0.9fr_1.4fr_auto] items-center border-b border-border px-5 py-3 text-[13.5px] last:border-b-0">
          <div className="text-text-secondary">{e.expenseDate}</div>
          <div className="font-semibold text-text">{e.category}</div>
          <div className="text-text-secondary">{formatCurrency(e.amount)}</div>
          <div className="text-text-secondary">{e.department ?? "—"}</div>
          <div className="truncate text-text-muted" title={e.notes ?? ""}>
            {e.companyName}
            {e.notes ? ` · ${e.notes}` : ""}
          </div>
          <div className="flex gap-1.5">
            <button type="button" className={BTN_SM_GHOST} onClick={() => edit(e)}>
              Edit
            </button>
            <button type="button" className={BTN_SM_GHOST} disabled={pending} onClick={() => remove(e)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {draft && (
        <Dialog title="Edit expense" onClose={() => setDraft(null)}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Category *</label>
                <Select required className={FIELD} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {categoryChoices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={LABEL}>Expense Date *</label>
                <input required type="date" className={FIELD} value={draft.expenseDate} onChange={(e) => setDraft({ ...draft, expenseDate: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Amount (RM) *</label>
                <input required type="number" step="0.01" min="0" className={FIELD} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Department</label>
                <Select className={FIELD} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })}>
                  <option value="">Select department (optional)</option>
                  {departmentChoices(draft.department).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className={LABEL}>Description / Notes</label>
              <textarea rows={3} className={AREA} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2.5">
              <button type="button" className={BTN_GHOST} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
