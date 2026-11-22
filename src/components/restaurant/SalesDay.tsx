"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSalesLine, confirmDay, deleteDraftLine, saveSalesLine } from "@/lib/restaurant/actions";
import { CHANNELS, PAYMENT_METHODS, channelLabel, paymentLabel } from "@/lib/restaurant/constants";
import { netOf, type SalesLine } from "@/lib/restaurant/dashboard";
import { formatCurrency } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_GRID_3, SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const TONE = { draft: "warning", confirmed: "success", cancelled: "neutral" } as const;
const STATUS_TEXT = { draft: "Draft", confirmed: "Confirmed", cancelled: "Cancelled" } as const;

type FormState = { id?: string; shift: string; channel: string; method: string; gross: string; discount: string; refund: string; orders: string; notes: string };
const EMPTY: FormState = { shift: "1", channel: "dine_in", method: "cash", gross: "", discount: "", refund: "", orders: "", notes: "" };

/** The sales lines of one day: add, change a draft, confirm the day, cancel a confirmed line (a Manager). Nothing confirmed is ever deleted. */
export function SalesDay({ companyId, date, lines, canSell, canManage, readOnly }: { companyId: string; date: string; lines: SalesLine[]; canSell: boolean; canManage: boolean; readOnly: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await work();
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      if (done) setMessage(done);
      router.refresh();
      return true;
    } catch {
      setError("Something went wrong. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      saveSalesLine({
        id: form.id,
        companyId,
        date,
        shiftNo: Number(form.shift),
        channel: form.channel,
        paymentMethod: form.method,
        gross: num(form.gross),
        discount: form.discount.trim() === "" ? 0 : num(form.discount),
        refund: form.refund.trim() === "" ? 0 : num(form.refund),
        orders: form.orders.trim() === "" ? null : Number(form.orders),
        notes: form.notes,
      }),
      form.id ? "The line was changed." : "The line was saved as a draft. Confirm the day when the figures are checked.",
    );
    if (ok) setForm((f) => ({ ...EMPTY, shift: f.shift, channel: f.channel }));
  }

  function edit(l: SalesLine) {
    setForm({ id: l.id, shift: String(l.shift_no), channel: l.channel, method: l.payment_method, gross: String(l.gross_amount), discount: l.discount_amount ? String(l.discount_amount) : "", refund: l.refund_amount ? String(l.refund_amount) : "", orders: l.orders_count === null ? "" : String(l.orders_count), notes: l.notes ?? "" });
    setError(null);
    setMessage(null);
  }

  async function remove(l: SalesLine) {
    if (!window.confirm("Delete this draft line?")) return;
    await run(() => deleteDraftLine(l.id), "The draft line was deleted.");
  }

  async function cancel(l: SalesLine) {
    const reason = window.prompt(`Cancel this confirmed line (${channelLabel(l.channel)}, ${paymentLabel(l.payment_method)}, ${formatCurrency(netOf(l))})? Write the reason:`);
    if (reason === null) return;
    await run(() => cancelSalesLine(l.id, reason), "The line was cancelled. Enter the corrected line again if needed.");
  }

  async function confirmAll() {
    if (!window.confirm("Confirm every draft line of this day? A confirmed line cannot be edited, only cancelled by a Manager with a reason.")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await confirmDay(companyId, date);
      if (!r.ok) setError(r.error);
      else {
        setMessage(r.count > 0 ? `${r.count} line${r.count === 1 ? "" : "s"} confirmed.` : "There was no draft line to confirm.");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const drafts = lines.filter((l) => l.status === "draft");
  const counted = lines.filter((l) => l.status === "confirmed");
  const totalNet = counted.reduce((t, l) => t + netOf(l), 0);
  const showDate = lines.some((l) => l.sales_date !== date);

  return (
    <div className="flex flex-col gap-4">
      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">{message}</div>}

      {!readOnly && canSell && (
        <form onSubmit={save} className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 text-[15px] font-bold text-text">{form.id ? "Change the draft line" : "Add a sales line"}</div>
          <div className={SPEND_GRID_3}>
            <div>
              <label className={SPEND_LABEL}>Channel *</label>
              <Select value={form.channel} onChange={(e) => set({ channel: e.target.value })} className={SPEND_INPUT}>
                {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </Select>
            </div>
            <div>
              <label className={SPEND_LABEL}>Payment method *</label>
              <Select value={form.method} onChange={(e) => set({ method: e.target.value })} className={SPEND_INPUT}>
                {PAYMENT_METHODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </Select>
            </div>
            <div>
              <label className={SPEND_LABEL}>Shift</label>
              <Select value={form.shift} onChange={(e) => set({ shift: e.target.value })} className={SPEND_INPUT}>
                {[1, 2, 3].map((s) => <option key={s} value={String(s)}>{`Shift ${s}`}</option>)}
              </Select>
            </div>
            <div>
              <label className={SPEND_LABEL}>Sales amount (RM) *</label>
              <input inputMode="decimal" type="number" min="0" step="0.01" value={form.gross} onChange={(e) => set({ gross: e.target.value })} className={SPEND_INPUT} required />
              <div className={SPEND_HINT}>The bill value before any discount</div>
            </div>
            <div>
              <label className={SPEND_LABEL}>Discount (RM)</label>
              <input inputMode="decimal" type="number" min="0" step="0.01" value={form.discount} onChange={(e) => set({ discount: e.target.value })} className={SPEND_INPUT} />
            </div>
            <div>
              <label className={SPEND_LABEL}>Refund (RM)</label>
              <input inputMode="decimal" type="number" min="0" step="0.01" value={form.refund} onChange={(e) => set({ refund: e.target.value })} className={SPEND_INPUT} />
            </div>
            <div>
              <label className={SPEND_LABEL}>Number of orders</label>
              <input inputMode="numeric" type="number" min="0" step="1" value={form.orders} onChange={(e) => set({ orders: e.target.value })} className={SPEND_INPUT} />
              <div className={SPEND_HINT}>Optional, used for the average order value</div>
            </div>
            <div className="sm:col-span-2">
              <label className={SPEND_LABEL}>Note</label>
              <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={SPEND_INPUT} placeholder="Optional" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={SPEND_SAVE_BTN}>{busy ? "Saving..." : form.id ? "Save the change" : "Save line"}</button>
            {form.id && (
              <button type="button" onClick={() => setForm(EMPTY)} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Cancel the change</button>
            )}
          </div>
        </form>
      )}

      <div className="rounded-3xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <div className="text-[15px] font-bold text-text">Sales lines · confirmed net {formatCurrency(totalNet)}</div>
          {!readOnly && canSell && drafts.length > 0 && (
            <button type="button" disabled={busy} onClick={confirmAll} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">
              {`Confirm the day (${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"})`}
            </button>
          )}
        </div>
        <div className="overflow-x-auto p-2 sm:p-4">
          {lines.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-text-muted">No sales lines here yet.</div>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-muted">
                  {showDate && <th className="px-2 py-2 font-semibold">Date</th>}
                  <th className="px-2 py-2 font-semibold">Shift</th>
                  <th className="px-2 py-2 font-semibold">Channel</th>
                  <th className="px-2 py-2 font-semibold">Payment</th>
                  <th className="px-2 py-2 text-right font-semibold">Sales</th>
                  <th className="px-2 py-2 text-right font-semibold">Discount</th>
                  <th className="px-2 py-2 text-right font-semibold">Refund</th>
                  <th className="px-2 py-2 text-right font-semibold">Net</th>
                  <th className="px-2 py-2 text-right font-semibold">Orders</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className={`border-b border-border last:border-0 ${l.status === "cancelled" ? "text-text-muted line-through" : ""}`}>
                    {showDate && <td className="px-2 py-2">{l.sales_date}</td>}
                    <td className="px-2 py-2">{l.shift_no}</td>
                    <td className="px-2 py-2">{channelLabel(l.channel)}</td>
                    <td className="px-2 py-2">{paymentLabel(l.payment_method)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(l.gross_amount)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(l.discount_amount)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(l.refund_amount)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{formatCurrency(netOf(l))}</td>
                    <td className="px-2 py-2 text-right">{l.orders_count ?? "—"}</td>
                    <td className="px-2 py-2 no-underline">
                      <StatusBadge tone={TONE[l.status as keyof typeof TONE] ?? "neutral"}>{STATUS_TEXT[l.status as keyof typeof STATUS_TEXT] ?? l.status}</StatusBadge>
                      {l.status === "cancelled" && l.cancel_reason && <div className="mt-0.5 text-[11.5px] no-underline">{l.cancel_reason}</div>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {!readOnly && canSell && l.status === "draft" && (
                        <>
                          <button type="button" onClick={() => edit(l)} className="mr-2 text-[12.5px] font-semibold text-primary">Change</button>
                          <button type="button" onClick={() => remove(l)} disabled={busy} className="text-[12.5px] font-semibold text-danger">Delete</button>
                        </>
                      )}
                      {!readOnly && canManage && l.status === "confirmed" && (
                        <button type="button" onClick={() => cancel(l)} disabled={busy} className="text-[12.5px] font-semibold text-danger">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {!readOnly && !canSell && <div className="text-[12.5px] text-text-muted">You can read the sales. Ask an Admin to give you the Cashier, Finance or Manager role to enter them.</div>}
    </div>
  );
}
