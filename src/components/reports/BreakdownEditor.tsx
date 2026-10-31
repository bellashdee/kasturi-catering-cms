"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { deleteBreakdownItem, deleteBreakdownSales, saveBreakdownItem, saveBreakdownSales } from "@/lib/monthlyBreakdown/actions";
import type { BreakdownItem, BreakdownLine } from "@/lib/monthlyBreakdown/restoranBara";
import { SectionCard } from "@/components/dashboard/SectionCard";

type Draft = { label: string; budget: string; note: string; values: string[] };

const money = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const toDraft = (r: BreakdownItem): Draft => ({ label: r.label, budget: r.budget === null ? "" : String(r.budget), note: r.note ?? "", values: r.values.map((v) => (v === null ? "" : String(v))) });
const blank = (): Draft => ({ label: "", budget: "", note: "", values: Array(12).fill("") });
const num = (s: string) => (s.trim() === "" ? null : Number(s));

const btn = "h-8 rounded-lg px-3 text-[12px] font-semibold";

/**
 * The editable rows behind one line of the Monthly Breakdown: every row can be edited (all twelve months), saved, cancelled or deleted,
 * and a new item can be added. The total sales row (kind "sales") is the sales kept in monthly_sales; the other lines are breakdown_items.
 */
export function BreakdownEditor({
  id,
  title,
  source,
  kind,
  companyId,
  year,
  rows,
  canEdit,
  children,
}: {
  id: string;
  title: string;
  /** where the figures are saved, so the heading of the report leads to the place they can be checked */
  source: string;
  kind: "sales" | BreakdownLine;
  companyId: string;
  year: number;
  rows: BreakdownItem[];
  canEdit: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sales = kind === "sales";

  function begin(key: string, d: Draft) {
    setEditing(key);
    setDraft(d);
    setError(null);
  }
  function cancel() {
    setEditing(null);
    setError(null);
  }
  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await work();
      if (res.ok) {
        setEditing(null);
        setError(null);
        router.refresh();
      } else {
        setError(res.error ?? "Could not save.");
      }
    });
  }
  function save(row: BreakdownItem | null) {
    const values = draft.values.map(num);
    if (values.some((v) => v !== null && !Number.isFinite(v))) return setError("Every amount must be a number (leave a month empty if it is not entered yet).");
    if (sales) return run(() => saveBreakdownSales(companyId, year, values));
    const budget = num(draft.budget);
    if (budget !== null && !Number.isFinite(budget)) return setError("The amount (avg/mth) must be a number.");
    run(() => saveBreakdownItem({ id: row?.id, companyId, year, line: kind, label: draft.label, budget, note: draft.note || null, values }));
  }
  function remove(row: BreakdownItem) {
    const what = sales ? `all the total sales saved for ${year}` : `"${row.label}"`;
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
    run(() => (sales ? deleteBreakdownSales(companyId, year) : deleteBreakdownItem(companyId, row.id)));
  }

  const input = "h-8 w-[5.2rem] rounded-md border border-border-strong px-1.5 text-right text-[12.5px]";
  const actions = (row: BreakdownItem | null) => (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button type="button" disabled={pending} onClick={() => save(row)} className={`${btn} bg-primary text-white disabled:opacity-50`}>{pending ? "Saving…" : "Save"}</button>
      <button type="button" disabled={pending} onClick={cancel} className={`${btn} border border-border-strong text-text`}>Cancel</button>
      {row && <button type="button" disabled={pending} onClick={() => remove(row)} className={`${btn} border border-danger text-danger`}>Delete</button>}
    </div>
  );

  return (
    <div id={id} className="scroll-mt-4">
      <SectionCard title={title}>
        <p className="mb-2 text-[12px] text-text-secondary">Saved in <span className="font-mono">{source}</span>. Edit a row, then Save; Cancel leaves it as it was.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">
                <th className="px-2 py-2">Item</th>
                {!sales && <th className="px-2 py-2 text-right">Amount (avg/mth)</th>}
                {MONTH_LABEL.map((m) => <th key={m} className="px-2 py-2 text-right">{m.slice(0, 3)}</th>)}
                {canEdit && <th className="px-2 py-2 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                editing === r.id ? (
                  <tr key={r.id} className="border-b border-border bg-info-bg/30 align-top">
                    <td className="px-2 py-2">
                      {sales ? <span className="font-semibold text-text">{r.label}</span> : (
                        <div className="flex flex-col gap-1">
                          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Item name" className="h-8 w-44 rounded-md border border-border-strong px-1.5 text-[12.5px]" />
                          <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Note (optional)" className="h-8 w-44 rounded-md border border-border-strong px-1.5 text-[12.5px]" />
                        </div>
                      )}
                    </td>
                    {!sales && <td className="px-2 py-2 text-right"><input type="number" step="0.01" min="0" value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} className={input} /></td>}
                    {draft.values.map((v, m) => (
                      <td key={m} className="px-1 py-2 text-right"><input type="number" step="0.01" min="0" value={v} onChange={(e) => setDraft({ ...draft, values: draft.values.map((x, i) => (i === m ? e.target.value : x)) })} className={input} aria-label={`${r.label} ${MONTH_LABEL[m]}`} /></td>
                    ))}
                    <td className="px-2 py-2">{actions(r)}</td>
                  </tr>
                ) : (
                  <tr key={r.id} className="border-b border-border">
                    <td className="px-2 py-2 font-semibold text-text">{r.label}{r.note && <span className="ml-1 font-normal text-text-secondary">({r.note})</span>}</td>
                    {!sales && <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{money(r.budget)}</td>}
                    {r.values.map((v, m) => <td key={m} className={`px-2 py-2 text-right tabular-nums ${v === null ? "text-text-secondary" : "text-text"}`}>{money(v)}</td>)}
                    {canEdit && <td className="px-2 py-2 text-right"><button type="button" disabled={editing !== null} onClick={() => begin(r.id, toDraft(r))} className={`${btn} border border-border-strong text-text disabled:opacity-40`}>Edit</button></td>}
                  </tr>
                ),
              )}
              {editing === "new" && (
                <tr className="border-b border-border bg-info-bg/30 align-top">
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Item name" className="h-8 w-44 rounded-md border border-border-strong px-1.5 text-[12.5px]" />
                      <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Note (optional)" className="h-8 w-44 rounded-md border border-border-strong px-1.5 text-[12.5px]" />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right"><input type="number" step="0.01" min="0" value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} className={input} /></td>
                  {draft.values.map((v, m) => (
                    <td key={m} className="px-1 py-2 text-right"><input type="number" step="0.01" min="0" value={v} onChange={(e) => setDraft({ ...draft, values: draft.values.map((x, i) => (i === m ? e.target.value : x)) })} className={input} aria-label={`New item ${MONTH_LABEL[m]}`} /></td>
                  ))}
                  <td className="px-2 py-2">{actions(null)}</td>
                </tr>
              )}
              {rows.length === 0 && editing !== "new" && (
                <tr><td colSpan={15} className="px-2 py-3 text-text-secondary">Nothing entered yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {error && <p className="mt-2 text-[12.5px] font-semibold text-danger">{error}</p>}
        {canEdit && !sales && editing === null && (
          <button type="button" onClick={() => begin("new", blank())} className={`${btn} mt-3 border border-border-strong text-text`}>+ Add item</button>
        )}
        {children}
      </SectionCard>
    </div>
  );
}
