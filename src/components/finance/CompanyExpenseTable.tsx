"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { deleteCompanyExpense, markExpenseNote, restoreCompanyExpense, updateCompanyExpense, type CompanyExpenseRow } from "@/lib/finance/actions";
import { departmentChoices } from "@/lib/finance/constants";
import { AREA, BTN, BTN_GHOST, BTN_SM_GHOST, Dialog, FIELD, LABEL } from "@/components/priority/ui";
import { Select } from "@/components/ui/Select";

export type ExpenseListRow = {
  id: string;
  /** where it was keyed in: only "Company Expenses" can be edited here, the others are changed on their own page */
  source: string;
  companyName: string;
  category: string;
  department: string | null;
  amount: number;
  expenseDate: string;
  notes: string | null;
  /** marked as a credit note (money back, shown as minus) or a debit note */
  note?: "credit_note" | "debit_note" | null;
};

const NOTE_LABEL = { credit_note: "Credit Note", debit_note: "Debit Note" } as const;

type Draft = { id: string; category: string; department: string; amount: string; expenseDate: string; notes: string };

/** Where a cost that is not keyed in on this page is changed. */
const SOURCE_PAGE: Record<string, { href: string; label: string }> = {
  "Petty Cash": { href: "/spending/petty-cash", label: "Open Petty Cash" },
  "Finance Payments": { href: "/finance/payments", label: "Open Payments" },
};

/**
 * Every cost of the companies, the same ones Monthly Costing adds up. The expenses keyed in here have Edit and Delete (a deleted one can
 * be put back with Undo); the others (petty cash, rental and utilities ...) show where they come from and open their own page.
 */
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

  function mark(r: ExpenseListRow, value: string) {
    const noteType = value === "credit_note" || value === "debit_note" ? value : null;
    setError(null);
    start(async () => {
      const result = await markExpenseNote(r.id, noteType);
      if (!result.ok) setError(result.error);
      else router.refresh();
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

      <div className="grid grid-cols-[0.9fr_0.9fr_1fr_0.9fr_0.9fr_1.4fr_auto] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
        <div>Date</div>
        <div>From</div>
        <div>Category</div>
        <div>Amount</div>
        <div>Department</div>
        <div>Company / Notes</div>
        <div>Action</div>
      </div>
      {rows.map((e) => (
        <div key={`${e.source}-${e.id}`} className="grid grid-cols-[0.9fr_0.9fr_1fr_0.9fr_0.9fr_1.4fr_auto] items-center border-b border-border px-5 py-3 text-[13.5px] last:border-b-0">
          <div className="text-text-secondary">{e.expenseDate}</div>
          <div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.source === "Company Expenses" ? "bg-surface-alt text-text-secondary" : "bg-info-bg text-primary"}`}>{e.source}</span>
          </div>
          <div>
            <div className="font-semibold text-text">{e.category}</div>
            {e.note && (
              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${e.note === "credit_note" ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}>
                {NOTE_LABEL[e.note]}
              </span>
            )}
          </div>
          <div className={e.note === "credit_note" ? "font-semibold text-success" : "text-text-secondary"}>{e.amount < 0 ? `− ${formatCurrency(Math.abs(e.amount))}` : formatCurrency(e.amount)}</div>
          <div className="text-text-secondary">{e.department ?? "—"}</div>
          <div className="truncate text-text-muted" title={e.notes ?? ""}>
            {e.companyName}
            {e.notes ? ` · ${e.notes}` : ""}
          </div>
          {e.source === "Company Expenses" ? (
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Mark as credit note or debit note"
                value={e.note ?? ""}
                disabled={pending}
                onChange={(ev) => mark(e, ev.target.value)}
                className="h-8 rounded-md border border-border-strong bg-surface px-1.5 text-[12px] font-semibold text-text"
              >
                <option value="">Mark…</option>
                <option value="credit_note">Credit Note</option>
                <option value="debit_note">Debit Note</option>
                {e.note && <option value="none">Remove mark</option>}
              </select>
              <button type="button" className={BTN_SM_GHOST} onClick={() => edit(e)}>
                Edit
              </button>
              <button type="button" className={BTN_SM_GHOST} disabled={pending} onClick={() => remove(e)}>
                Delete
              </button>
            </div>
          ) : SOURCE_PAGE[e.source] ? (
            <Link href={SOURCE_PAGE[e.source].href} className={BTN_SM_GHOST}>
              {SOURCE_PAGE[e.source].label}
            </Link>
          ) : (
            <span className="text-[12px] text-text-muted">—</span>
          )}
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
