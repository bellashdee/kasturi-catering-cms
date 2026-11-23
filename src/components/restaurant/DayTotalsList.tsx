"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelDayTotal, confirmDayTotal, deleteDraftDayTotal } from "@/lib/restaurant/feedmeActions";
import { dayTotalNet, type DayTotalRow } from "@/lib/restaurant/dashboard";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

const TONE = { draft: "warning", confirmed: "success", cancelled: "neutral" } as const;
const STATUS_TEXT = { draft: "Draft", confirmed: "Confirmed", cancelled: "Cancelled" } as const;
const money = (v: number) => formatCurrency(Math.round(v * 100) / 100);

/** The day totals imported from FeedMe: confirm a draft, delete a draft, cancel a confirmed one (a Manager, with a reason). Figures are never edited. */
export function DayTotalsList({ rows, canSell, canManage }: { rows: DayTotalRow[]; canSell: boolean; canManage: boolean }) {
  const router = useRouter();
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

  if (rows.length === 0) return null;
  return (
    <div className="rounded-3xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-3.5 text-[15px] font-bold text-text">Day totals from FeedMe</div>
      {error && <div role="alert" className="m-4 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      <div className="overflow-x-auto p-2 sm:p-4">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-text-muted">
              <th className="px-2 py-2 font-semibold">Date</th>
              <th className="px-2 py-2 text-right font-semibold">Bills</th>
              <th className="px-2 py-2 text-right font-semibold">Pax</th>
              <th className="px-2 py-2 text-right font-semibold">Gross</th>
              <th className="px-2 py-2 text-right font-semibold">Discount</th>
              <th className="px-2 py-2 text-right font-semibold">Net sales</th>
              <th className="px-2 py-2 text-right font-semibold">SC</th>
              <th className="px-2 py-2 text-right font-semibold">SST</th>
              <th className="px-2 py-2 text-right font-semibold">Rounding</th>
              <th className="px-2 py-2 text-right font-semibold">Nett</th>
              <th className="px-2 py-2 font-semibold">Status</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className={`border-b border-border last:border-0 ${d.status === "cancelled" ? "text-text-muted line-through" : ""}`}>
                <td className="px-2 py-2">{formatMalaysiaDate(`${d.sales_date}T12:00:00+08:00`)}</td>
                <td className="px-2 py-2 text-right">{d.bills}</td>
                <td className="px-2 py-2 text-right">{d.pax ?? "—"}</td>
                <td className="px-2 py-2 text-right">{money(d.gross)}</td>
                <td className="px-2 py-2 text-right">{money(d.discount)}</td>
                <td className="px-2 py-2 text-right font-semibold">{money(dayTotalNet(d))}</td>
                <td className="px-2 py-2 text-right">{money(d.service_charge)}</td>
                <td className="px-2 py-2 text-right">{money(d.sst)}</td>
                <td className="px-2 py-2 text-right">{money(d.rounding)}</td>
                <td className="px-2 py-2 text-right font-semibold">{money(d.nett)}</td>
                <td className="px-2 py-2 no-underline">
                  <StatusBadge tone={TONE[d.status as keyof typeof TONE] ?? "neutral"}>{STATUS_TEXT[d.status as keyof typeof STATUS_TEXT] ?? d.status}</StatusBadge>
                  {d.status === "cancelled" && d.cancel_reason && <div className="mt-0.5 text-[11.5px] no-underline">{d.cancel_reason}</div>}
                  {d.manual_lines_ack !== null && d.status !== "cancelled" && <div className="mt-0.5 text-[11.5px] text-text-muted no-underline">{`Imported although ${money(d.manual_lines_ack)} was already keyed in by hand`}</div>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  {canSell && d.status === "draft" && (
                    <>
                      <button type="button" disabled={busy} onClick={() => run(() => confirmDayTotal(d.id))} className="mr-2 text-[12.5px] font-semibold text-primary">Confirm</button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm("Delete this imported draft day? You can import it again.")) return;
                          void run(() => deleteDraftDayTotal(d.id));
                        }}
                        className="text-[12.5px] font-semibold text-danger"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {canManage && d.status === "confirmed" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt("Cancel this confirmed FeedMe day? Write the reason:");
                        if (reason === null) return;
                        void run(() => cancelDayTotal(d.id, reason));
                      }}
                      className="text-[12.5px] font-semibold text-danger"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
