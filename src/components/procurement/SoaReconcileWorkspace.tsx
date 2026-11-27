"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actionResult";
import { StatusBadge } from "@/components/StatusBadge";
import { fileTypeFromMime, uploadDocument } from "@/lib/documents/upload";
import { LINE_STATUS_LABEL, LINE_TYPE_LABEL, lineTone } from "@/lib/procurement/soaReconcileLabels";
import type { SoaLineType, Suggestion } from "@/lib/procurement/soaMatch";
import {
  approveException,
  approveForPayment,
  attachSupportingDocument,
  cancelReconciliation,
  completeReconciliation,
  confirmMatch,
  deleteStatementLine,
  reopenReconciliation,
  resolveLine,
  runMatching,
  saveManualLine,
  saveStatedBalances,
  saveStatementLines,
  undoMatch,
  verifyReconciliation,
} from "@/lib/procurement/soaReconcileActions";

export type WorkspaceLine = {
  id: string;
  source: "supplier" | "ours";
  lineNo: number | null;
  date: string | null;
  dateText: string | null;
  type: string;
  reference: string | null;
  description: string | null;
  amount: number;
  balance: number | null;
  status: string;
  method: string | null;
  confirmed: boolean;
  matchedTable: string | null;
  matchedId: string | null;
  matchedRef: string | null;
  matchedDate: string | null;
  matchedAmount: number | null;
  suggestions: Suggestion[];
  likelyCause: string | null;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const btn = "h-8 rounded-lg border border-border-strong bg-surface px-2.5 text-[12px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const primary = "h-9 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white disabled:opacity-50";
const area = "mt-1 block w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-text";

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  return { pending, error, run };
}

/** One discrepancy written up: who resolved it and how. Empty text removes the resolution. */
function ResolveBox({ line, editable }: { line: WorkspaceLine; editable: boolean }) {
  const { pending, error, run } = useAct();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(line.resolution ?? "");
  if (line.status === "matched" && !line.resolution) return null;
  return (
    <div className="mt-1">
      {line.resolution && !open && (
        <div className="rounded-md bg-success-bg px-2 py-1 text-[12px] text-success">
          Resolved: {line.resolution}
          {line.resolvedBy ? ` — ${line.resolvedBy}, ${line.resolvedAt ? new Date(line.resolvedAt).toLocaleDateString("en-GB") : ""}` : ""}
        </div>
      )}
      {editable && !open && (
        <button type="button" className="mt-1 text-[12px] font-semibold text-primary hover:underline" onClick={() => setOpen(true)}>
          {line.resolution ? "Change resolution" : "Write resolution"}
        </button>
      )}
      {open && (
        <div className="mt-1">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="How this was resolved (e.g. supplier will issue a CN; invoice keyed in on 2/12; payment in transit, cleared 1/12)" className={area} />
          <div className="mt-1 flex gap-1.5">
            <button type="button" disabled={pending} className={btn} onClick={() => run(() => resolveLine(line.id, text), () => setOpen(false))}>
              Save
            </button>
            <button type="button" className={btn} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
      {error && <div className="text-[12px] font-semibold text-danger">{error}</div>}
    </div>
  );
}

function LineEditor({ reconId, line, onDone }: { reconId: string; line?: WorkspaceLine; onDone: () => void }) {
  const { pending, error, run } = useAct();
  const [date, setDate] = useState(line?.date ?? line?.dateText ?? "");
  const [type, setType] = useState<SoaLineType>((line?.type as SoaLineType) ?? "invoice");
  const [reference, setReference] = useState(line?.reference ?? "");
  const [description, setDescription] = useState(line?.description ?? "");
  const [amount, setAmount] = useState(line ? String(Math.abs(line.amount)) : "");
  const [balance, setBalance] = useState(line?.balance !== null && line?.balance !== undefined ? String(line.balance) : "");
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-surface-alt p-2.5 sm:grid-cols-6">
      <label className="text-[11.5px] font-semibold text-text-secondary">
        Date
        <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="05/11/2026" className={area} />
      </label>
      <label className="text-[11.5px] font-semibold text-text-secondary">
        Type
        <select value={type} onChange={(e) => setType(e.target.value as SoaLineType)} className={area}>
          {Object.entries(LINE_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11.5px] font-semibold text-text-secondary">
        Reference
        <input value={reference} onChange={(e) => setReference(e.target.value)} className={area} />
      </label>
      <label className="text-[11.5px] font-semibold text-text-secondary">
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={area} />
      </label>
      <label className="text-[11.5px] font-semibold text-text-secondary">
        Amount (RM)
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={area} />
      </label>
      <label className="text-[11.5px] font-semibold text-text-secondary">
        Balance (RM, optional)
        <input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" className={area} />
      </label>
      <div className="flex items-center gap-1.5 sm:col-span-6">
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() =>
            run(
              () => saveManualLine(reconId, { lineId: line?.id, date, type, reference, description, amount: Number(amount.replace(/,/g, "")), balance: balance.trim() ? Number(balance.replace(/,/g, "")) : null }),
              onDone,
            )
          }
        >
          Save line
        </button>
        <button type="button" className={btn} onClick={onDone}>
          Close
        </button>
        {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
      </div>
    </div>
  );
}

function SupplierLineRow({ reconId, line, editable, oursOpen }: { reconId: string; line: WorkspaceLine; editable: boolean; oursOpen: WorkspaceLine[] }) {
  const { pending, error, run } = useAct();
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState("");
  const outside = false;
  return (
    <tr className="align-top">
      <td className="px-3 py-2 text-[12px] text-text-muted">{line.lineNo}</td>
      <td className="px-3 py-2 tabular-nums">
        {dmy(line.date)}
        {line.dateText && line.date === null ? <div className="text-[11px] text-danger">as printed: {line.dateText}</div> : null}
      </td>
      <td className="px-3 py-2">{LINE_TYPE_LABEL[line.type] ?? line.type}</td>
      <td className="px-3 py-2">
        <div className="font-semibold text-text">{line.reference || "—"}</div>
        {line.description && <div className="text-[11.5px] text-text-secondary">{line.description}</div>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{money(line.amount)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{money(line.balance)}</td>
      <td className="min-w-[15rem] px-3 py-2">
        {line.type === "opening" ? (
          <span className="text-[12px] text-text-muted">Opening balance</span>
        ) : (
          <>
            <StatusBadge tone={lineTone(line.status)}>{LINE_STATUS_LABEL[line.status] ?? line.status}</StatusBadge>
            {line.matchedRef && (
              <div className="mt-1 text-[12px] text-text">
                Ours: <b>{line.matchedRef}</b> · {dmy(line.matchedDate)} · RM {money(line.matchedAmount)}
                <span className="text-text-muted"> ({line.method === "exact" ? "exact" : line.method === "fuzzy" ? "suggestion confirmed" : line.method === "manual" ? "matched by hand" : "linked"})</span>
              </div>
            )}
            {line.likelyCause && <div className="mt-0.5 text-[11.5px] text-text-secondary">{line.likelyCause}</div>}
            {editable && line.suggestions.length > 0 && !line.confirmed && (
              <div className="mt-1 space-y-1">
                {line.suggestions.map((s) => (
                  <div key={s.id} className="rounded-md border border-warning/40 bg-warning-bg px-2 py-1 text-[11.5px] text-text">
                    Suggested: <b>{s.ref}</b> · {dmy(s.date)} · RM {money(s.amount)} — {s.reason}
                    <button type="button" disabled={pending} className="ml-1.5 font-semibold text-primary hover:underline" onClick={() => run(() => confirmMatch(line.id, { table: s.table, id: s.id }, "fuzzy"))}>
                      Confirm match
                    </button>
                  </div>
                ))}
              </div>
            )}
            {editable && line.status !== "matched" && !line.confirmed && oursOpen.length > 0 && (
              <div className="mt-1 flex items-center gap-1">
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-8 max-w-[14rem] rounded-md border border-border-strong bg-surface px-1.5 text-[11.5px]">
                  <option value="">Match by hand with…</option>
                  {oursOpen.map((o) => (
                    <option key={o.id} value={`${o.matchedTable}|${o.matchedId}`}>
                      {o.matchedRef} · {dmy(o.matchedDate)} · RM {money(o.matchedAmount)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!pick || pending}
                  className={btn}
                  onClick={() => {
                    const [table, id] = pick.split("|");
                    run(() => confirmMatch(line.id, { table: table as Suggestion["table"], id }, "manual"));
                  }}
                >
                  Match
                </button>
              </div>
            )}
            {editable && line.confirmed && (
              <button type="button" disabled={pending} className="mt-1 text-[12px] font-semibold text-text-secondary hover:underline" onClick={() => run(() => undoMatch(line.id))}>
                Undo match
              </button>
            )}
            <ResolveBox line={line} editable={editable} />
          </>
        )}
        {error && <div className="text-[12px] font-semibold text-danger">{error}</div>}
        {editing && (
          <div className="mt-2">
            <LineEditor reconId={reconId} line={line} onDone={() => setEditing(false)} />
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {editable && !editing && (
          <div className="flex flex-col items-end gap-1">
            <button type="button" className="text-[12px] font-semibold text-primary hover:underline" onClick={() => setEditing(true)}>
              Correct
            </button>
            <button
              type="button"
              disabled={pending || outside}
              className="text-[12px] font-semibold text-danger hover:underline"
              onClick={() => {
                if (window.confirm("Remove this line? Only for a line the reader got wrong (the SOA file itself is kept).")) run(() => deleteStatementLine(line.id));
              }}
            >
              Remove
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function SoaLinesBoard({ reconId, lines, editable }: { reconId: string; lines: WorkspaceLine[]; editable: boolean }) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const supplier = lines.filter((l) => l.source === "supplier");
  const ours = lines.filter((l) => l.source === "ours");
  const counts = new Map<string, number>();
  for (const l of lines) if (l.type !== "opening") counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
  const shown = supplier.filter((l) => filter === "all" || l.status === filter || (filter === "open" && l.status !== "matched" && !l.resolution && l.type !== "opening"));
  const shownOurs = ours.filter((l) => filter === "all" || l.status === filter || (filter === "open" && !l.resolution));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5 text-[12px]">
        {[["all", "All lines"], ["open", "Open (not matched, not resolved)"], ...Object.entries(LINE_STATUS_LABEL)].map(([k, v]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-2.5 py-1 font-semibold ${filter === k ? "border-primary text-primary" : "border-border text-text-secondary"}`}>
            {v}
            {counts.get(k) ? ` (${counts.get(k)})` : ""}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="text-[14px] font-bold text-text">{`Lines on the supplier's SOA (${supplier.length})`}</div>
          {editable && (
            <button type="button" className={btn} onClick={() => setAdding((v) => !v)}>
              {adding ? "Close" : "Add a line the reader missed"}
            </button>
          )}
        </div>
        {adding && (
          <div className="px-4 pt-2">
            <LineEditor reconId={reconId} onDone={() => setAdding(false)} />
          </div>
        )}
        <table className="mt-2 w-full min-w-[980px] text-[13px]">
          <thead>
            <tr className="border-y border-border bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-secondary">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2 text-right">Amount (RM)</th>
              <th className="px-3 py-2 text-right">Balance (RM)</th>
              <th className="px-3 py-2">Status · our record</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-5 text-center text-[12.5px] text-text-muted">
                  {supplier.length === 0 ? "No line read from the statement yet. Read it again or key in the lines." : "No line with this status."}
                </td>
              </tr>
            ) : (
              shown.map((l) => <SupplierLineRow key={l.id} reconId={reconId} line={l} editable={editable} oursOpen={ours} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <div className="px-4 pt-3 text-[14px] font-bold text-text">{`Our records in the period not on the supplier's SOA (${ours.length})`}</div>
        <table className="mt-2 w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-y border-border bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-secondary">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Our reference</th>
              <th className="px-3 py-2 text-right">Amount (RM)</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shownOurs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-5 text-center text-[12.5px] text-text-muted">
                  Every record of ours in the period is on the supplier&apos;s SOA.
                </td>
              </tr>
            ) : (
              shownOurs.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-3 py-2 tabular-nums">{dmy(l.date)}</td>
                  <td className="px-3 py-2">{LINE_TYPE_LABEL[l.type] ?? l.type}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-text">{l.reference || "—"}</div>
                    <div className="text-[11.5px] text-text-secondary">{l.description}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(l.amount)}</td>
                  <td className="min-w-[16rem] px-3 py-2">
                    <StatusBadge tone={lineTone(l.status)}>{LINE_STATUS_LABEL[l.status] ?? l.status}</StatusBadge>
                    {l.likelyCause && <div className="mt-0.5 text-[11.5px] text-text-secondary">{l.likelyCause}</div>}
                    <ResolveBox line={l} editable={editable} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The buttons of the work, in order: read again / match again, complete, verify, Finance approval, exception, reopen, cancel. */
export function SoaReconcileActions(props: {
  reconId: string;
  status: string;
  canManage: boolean;
  canApprove: boolean;
  verified: boolean;
  exception: boolean;
  documentId: string | null;
  statedOpening: number | null;
  statedClosing: number | null;
}) {
  const { reconId, status, canManage, canApprove, verified, exception } = props;
  const { pending, error, run } = useAct();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [opening, setOpening] = useState(props.statedOpening === null ? "" : String(props.statedOpening));
  const [closing, setClosing] = useState(props.statedClosing === null ? "" : String(props.statedClosing));
  const open = ["not_reconciled", "in_progress", "discrepancy_found"].includes(status);

  async function readAgain() {
    if (!props.documentId) return;
    setBusy("The AI reader is reading the statement again (up to a minute)…");
    try {
      const res = await fetch("/api/extract-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: props.documentId, kind: "supplier_soa" }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.configured === false) {
        setBusy(null);
        return window.alert([body.error ?? body.message, body.hint].filter(Boolean).join(" ") || "The statement could not be read.");
      }
      const x = (body.extracted ?? {}) as Record<string, unknown>;
      run(() =>
        saveStatementLines(reconId, {
          items: Array.isArray(x.items) ? (x.items as Record<string, unknown>[]) : [],
          openingBalance: x.opening_balance,
          closingBalance: x.closing_balance,
          statementDate: x.statement_date,
          source: "extracted",
          note: Array.isArray(body.report?.issues) ? body.report.issues.join(" ") : "",
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  const ask = (label: string) => {
    const v = window.prompt(label);
    return v === null ? null : v;
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm print:hidden">
      <div className="text-[14px] font-bold text-text">Next step</div>
      {open && canManage && (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending || !!busy || !props.documentId} className={btn} onClick={readAgain}>
              Read the SOA again
            </button>
            <button type="button" disabled={pending} className={btn} onClick={() => run(() => runMatching(reconId))}>
              Match again with our records
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-[12px] font-semibold text-text-secondary">
            <label>
              Supplier&apos;s stated opening (RM)
              <input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" placeholder="as printed" className="mt-1 block h-8 w-36 rounded-md border border-border-strong bg-surface px-2 text-[12.5px]" />
            </label>
            <label>
              Supplier&apos;s stated closing (RM)
              <input value={closing} onChange={(e) => setClosing(e.target.value)} inputMode="decimal" placeholder="as printed" className="mt-1 block h-8 w-36 rounded-md border border-border-strong bg-surface px-2 text-[12.5px]" />
            </label>
            <button
              type="button"
              disabled={pending}
              className={btn}
              onClick={() => run(() => saveStatedBalances(reconId, { opening: opening.trim() ? Number(opening.replace(/,/g, "")) : null, closing: closing.trim() ? Number(closing.replace(/,/g, "")) : null }))}
            >
              Save balances
            </button>
          </div>
          <label className="text-[12px] font-semibold text-text-secondary">
            Remarks of the reconciliation
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className={area} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} className={primary} onClick={() => run(() => completeReconciliation(reconId, text))}>
              Complete reconciliation
            </button>
            <button
              type="button"
              disabled={pending}
              className={btn}
              onClick={() => {
                const r = ask("Why is this reconciliation cancelled?");
                if (r) run(() => cancelReconciliation(reconId, r));
              }}
            >
              Cancel reconciliation
            </button>
          </div>
        </>
      )}
      {open && canApprove && !exception && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() => {
            const r = ask("Exception approval (Finance): why may this reconciliation be completed with the open discrepancies?");
            if (r) run(() => approveException(reconId, r));
          }}
        >
          Approve exception (Finance)
        </button>
      )}
      {status === "reconciled" && !verified && (canManage || canApprove) && (
        <button type="button" disabled={pending} className={primary} onClick={() => run(() => verifyReconciliation(reconId))}>
          Verify reconciliation
        </button>
      )}
      {status === "reconciled" && verified && canApprove && (
        <button
          type="button"
          disabled={pending}
          className={primary}
          onClick={() => {
            const r = ask("Approve for payment. Note (optional):");
            if (r !== null) run(() => approveForPayment(reconId, r));
          }}
        >
          Approve for payment (Finance)
        </button>
      )}
      {status === "reconciled" && verified && !canApprove && <div className="text-[12.5px] text-text-secondary">Waiting for Finance (Ms. Penny Chan / Ms. Nabilah) to approve the payment.</div>}
      {["reconciled", "approved_for_payment"].includes(status) && (canManage || canApprove) && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() => {
            const r = ask("Why is the reconciliation reopened?");
            if (r) run(() => reopenReconciliation(reconId, r));
          }}
        >
          Reopen
        </button>
      )}
      {busy && <div className="text-[12.5px] text-text-secondary">{busy}</div>}
      {error && <div className="text-[12.5px] font-semibold text-danger">{error}</div>}
      {!canManage && !canApprove && <div className="text-[12.5px] text-text-secondary">You can view this reconciliation; Finance / Admin work on it.</div>}
    </div>
  );
}

/** A supporting document kept with the reconciliation (the supplier's reply, a proof of payment, an invoice copy). */
export function SoaAttachDocument({ reconId, companyId }: { reconId: string; companyId: string }) {
  const { pending, error, run } = useAct();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What is it (e.g. supplier's reply)" className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-[12.5px]" />
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[12px]" />
      <button
        type="button"
        disabled={!file || pending || busy}
        className={btn}
        onClick={async () => {
          if (!file) return;
          setBusy(true);
          try {
            const doc = await uploadDocument({ companyId, module: "supplier-procurement", fileType: fileTypeFromMime(file), file });
            run(() => attachSupportingDocument(reconId, doc.id, label), () => { setFile(null); setLabel(""); });
          } finally {
            setBusy(false);
          }
        }}
      >
        Attach
      </button>
      {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
    </div>
  );
}
