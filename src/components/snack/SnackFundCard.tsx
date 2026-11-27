import { formatMalaysiaDate } from "@/lib/format";
import type { FundSummary } from "@/lib/snack/constants";
import { DecideAllocation, MarkFundReceived, RequestAdditional } from "@/components/snack/SnackControls";

const STATUS_STYLE: Record<string, string> = {
  "Not Yet Received": "border-yellow-500 bg-yellow-50 text-yellow-900",
  "Payment Received": "border-success bg-success-bg text-success",
  "Available Balance": "border-success bg-success-bg text-success",
  "Fully Utilised": "border-border-strong bg-surface-alt text-text",
  "Additional Allocation Required": "border-danger bg-danger-bg text-danger",
};
const rm = (n: number) => `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: string | null) => (d ? formatMalaysiaDate(`${d}T12:00:00+08:00`) : "—");

/** JDT II SNACK FUND: the one-time RM500, what was spent, what is left. Only for the people allowed to see money. */
export function SnackFundCard({ fund, canManage, isManagement, compact = false }: { fund: FundSummary; canManage: boolean; isManagement: boolean; compact?: boolean }) {
  const pending = fund.additional.filter((a) => a.approval_status === "pending");
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-extrabold tracking-wide text-text">JDT II SNACK FUND</h2>
          <p className="text-[12px] text-text-secondary">One-time allocation of RM500.00 for JDT II snacks and training refreshments — not per training, not monthly. Kept apart from event costing and P&amp;L.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[12px] font-bold ${STATUS_STYLE[fund.status] ?? ""}`}>{fund.status}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Initial allocation", rm(fund.initial ? Number(fund.initial.amount) : 500)],
          ["Additional (approved)", rm(fund.allocated - (fund.initial ? Number(fund.initial.amount) : 0))],
          ["Total spent", rm(fund.spent)],
          ["Remaining balance", rm(fund.balance)],
          ["Last purchase", date(fund.lastPurchaseDate)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-alt px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{k}</div>
            <div className={`text-[15px] font-extrabold ${k === "Remaining balance" && fund.balance < 0 ? "text-danger" : "text-text"}`}>{v}</div>
          </div>
        ))}
      </div>
      {fund.alert && <div className="mt-2 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] font-bold text-danger">{`⚠ ${fund.alert}`}</div>}
      {fund.initial && !fund.initial.received && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-[12.5px] text-yellow-900">
          <b>The RM500 is not marked as received yet.</b> Record it only after the payment is checked.
          {canManage && !compact && <MarkFundReceived allocationId={fund.initial.id} amount={Number(fund.initial.amount)} />}
        </div>
      )}
      {fund.initial?.received && <div className="mt-2 text-[12px] text-text-secondary">{`RM${Number(fund.initial.amount).toFixed(2)} received on ${date(fund.initial.received_date)} · ref. ${fund.initial.received_reference ?? "—"}`}</div>}
      {!compact && (fund.additional.length > 0 || canManage) && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-[12.5px] font-bold text-text">Additional allocations (each needs Management approval, recorded apart)</div>
          {fund.additional.length === 0 && <div className="text-[12.5px] text-text-muted">None.</div>}
          <ul className="mt-1 flex flex-col gap-1.5 text-[13px]">
            {fund.additional.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-alt px-3 py-1.5">
                <b>{rm(Number(a.amount))}</b>
                <span className="text-text-secondary">{a.remarks}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${a.approval_status === "approved" ? "bg-success-bg text-success" : a.approval_status === "rejected" ? "bg-danger-bg text-danger" : "bg-yellow-50 text-yellow-900"}`}>
                  {a.approval_status === "approved" ? "Approved" : a.approval_status === "rejected" ? "Rejected" : "Waiting for Management"}
                </span>
                {a.approval_status === "approved" && (a.received ? <span className="text-[12px] text-success">received {date(a.received_date)}</span> : canManage && <MarkFundReceived allocationId={a.id} amount={Number(a.amount)} />)}
                {a.approval_status === "pending" && isManagement && <DecideAllocation id={a.id} />}
              </li>
            ))}
          </ul>
          {canManage && <div className="mt-2"><RequestAdditional /></div>}
          {pending.length > 0 && !isManagement && <div className="mt-1 text-[12px] text-text-muted">Waiting for Management to approve.</div>}
        </div>
      )}
    </section>
  );
}
