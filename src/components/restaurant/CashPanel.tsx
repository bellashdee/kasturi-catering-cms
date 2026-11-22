"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeCashSession, openCashSession, reopenCashSession, updateCashSession } from "@/lib/restaurant/actions";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Select } from "@/components/ui/Select";
import { SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

export type CashView = {
  id: string;
  date: string;
  shift: number;
  opening: number;
  cashExpenses: number;
  withdrawals: number;
  status: string;
  cashIn: number;
  expected: number;
  drafts: number;
  counted: number | null;
  variance: number | null;
  note: string | null;
  reopenReason: string | null;
};

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

function Session({ s, canSell, canManage }: { s: CashView; canSell: boolean; canManage: boolean }) {
  const router = useRouter();
  const [opening, setOpening] = useState(String(s.opening));
  const [expenses, setExpenses] = useState(String(s.cashExpenses));
  const [withdrawals, setWithdrawals] = useState(String(s.withdrawals));
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const r = await work();
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const closed = s.status === "closed";
  // what the till should hold, worked out again from the figures typed (before they are saved)
  const liveExpected = num(opening) + s.cashIn - (num(expenses) || 0) - (num(withdrawals) || 0);

  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-bold text-text">Shift {s.shift}</div>
        <StatusBadge tone={closed ? (Math.abs(s.variance ?? 0) >= 0.005 ? "danger" : "success") : "warning"}>{closed ? "Closed" : "Open"}</StatusBadge>
      </div>
      {error && <div role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}

      {closed ? (
        <div className="grid grid-cols-2 gap-3 text-[13.5px] sm:grid-cols-4">
          <div><div className="text-text-muted">Opening cash</div><div className="font-semibold">{formatCurrency(s.opening)}</div></div>
          <div><div className="text-text-muted">Cash sales (net)</div><div className="font-semibold">{formatCurrency(s.cashIn)}</div></div>
          <div><div className="text-text-muted">Cash expenses / withdrawals</div><div className="font-semibold">{formatCurrency(s.cashExpenses)} / {formatCurrency(s.withdrawals)}</div></div>
          <div><div className="text-text-muted">Expected cash</div><div className="font-semibold">{formatCurrency(s.expected)}</div></div>
          <div><div className="text-text-muted">Counted cash</div><div className="font-semibold">{s.counted === null ? "—" : formatCurrency(s.counted)}</div></div>
          <div><div className="text-text-muted">Difference</div><div className={`font-semibold ${Math.abs(s.variance ?? 0) >= 0.005 ? "text-danger" : "text-success"}`}>{s.variance === null ? "—" : formatCurrency(s.variance)}</div></div>
          {s.note && <div className="col-span-2"><div className="text-text-muted">Reason for the difference</div><div className="font-semibold">{s.note}</div></div>}
          {s.reopenReason && <div className="col-span-2"><div className="text-text-muted">Last reopened because</div><div>{s.reopenReason}</div></div>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={SPEND_LABEL}>Opening cash (RM)</label>
              <input inputMode="decimal" type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={!canSell} className={SPEND_INPUT} />
            </div>
            <div>
              <label className={SPEND_LABEL}>Cash paid out for expenses (RM)</label>
              <input inputMode="decimal" type="number" min="0" step="0.01" value={expenses} onChange={(e) => setExpenses(e.target.value)} disabled={!canSell} className={SPEND_INPUT} />
            </div>
            <div>
              <label className={SPEND_LABEL}>Withdrawals (RM)</label>
              <input inputMode="decimal" type="number" min="0" step="0.01" value={withdrawals} onChange={(e) => setWithdrawals(e.target.value)} disabled={!canSell} className={SPEND_INPUT} />
            </div>
          </div>
          <div className="rounded-xl bg-surface-alt px-4 py-3 text-[13.5px]">
            <div className="flex justify-between"><span>Cash sales of this shift (confirmed, after discounts and refunds)</span><span className="font-semibold">{formatCurrency(s.cashIn)}</span></div>
            <div className="mt-1 flex justify-between"><span>Cash the till should hold</span><span className="font-bold">{Number.isFinite(liveExpected) ? formatCurrency(Math.round(liveExpected * 100) / 100) : "—"}</span></div>
            {s.drafts > 0 && <div className="mt-1 text-[12.5px] text-warning">{s.drafts === 1 ? "1 cash sales line is still a draft. Confirm it in Daily Sales before closing." : `${s.drafts} cash sales lines are still drafts. Confirm them in Daily Sales before closing.`}</div>}
          </div>
          {canSell && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => run(() => updateCashSession(s.id, { openingCash: num(opening), cashExpenses: num(expenses), withdrawals: num(withdrawals) }))} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Save the figures</button>
            </div>
          )}
          {canSell && (
            <div className="border-t border-border pt-4">
              <div className="mb-2 text-[13.5px] font-bold text-text">Close the cash</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={SPEND_LABEL}>Cash counted in the till (RM) *</label>
                  <input inputMode="decimal" type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} className={SPEND_INPUT} />
                </div>
                <div>
                  <label className={SPEND_LABEL}>Reason, if different from expected</label>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className={SPEND_INPUT} />
                  <div className={SPEND_HINT}>Required when the count does not match</div>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Close the cash of this shift? Save the figures first. Only a Manager can reopen it.")) return;
                  void run(() => closeCashSession(s.id, num(counted), note));
                }}
                className={`mt-3 ${SPEND_SAVE_BTN}`}
              >
                {busy ? "Working..." : "Close the cash"}
              </button>
            </div>
          )}
        </div>
      )}

      {closed && canManage && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const reason = window.prompt("Reopen this closed cash session? Write the reason:");
            if (reason === null) return;
            void run(() => reopenCashSession(s.id, reason));
          }}
          className="mt-3 text-[13px] font-semibold text-danger"
        >
          Reopen (Manager)
        </button>
      )}
    </div>
  );
}

export function CashPanel({ companyId, date, sessions, canSell, canManage }: { companyId: string; date: string; sessions: CashView[]; canSell: boolean; canManage: boolean }) {
  const router = useRouter();
  const [shift, setShift] = useState(String(Math.max(0, ...sessions.map((s) => s.shift)) + 1 || 1));
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await openCashSession({ companyId, date, shiftNo: Number(shift), openingCash: num(opening) });
      if (!r.ok) setError(r.error);
      else {
        setOpening("");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sessions.map((s) => <Session key={`${s.id}-${s.status}`} s={s} canSell={canSell} canManage={canManage} />)}
      {sessions.length === 0 && <div className="rounded-3xl border border-border bg-surface p-5 text-center text-[13px] text-text-muted shadow-sm">No cash session for this day yet.</div>}
      {canSell && (
        <form onSubmit={open} className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 text-[15px] font-bold text-text">Open a cash session</div>
          {error && <div role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={SPEND_LABEL}>Shift</label>
              <Select value={shift} onChange={(e) => setShift(e.target.value)} className={SPEND_INPUT}>
                {[1, 2, 3].map((n) => <option key={n} value={String(n)}>{`Shift ${n}`}</option>)}
              </Select>
            </div>
            <div>
              <label className={SPEND_LABEL}>Opening cash in the till (RM) *</label>
              <input inputMode="decimal" type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} className={SPEND_INPUT} required />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={busy} className={SPEND_SAVE_BTN}>{busy ? "Opening..." : "Open"}</button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
