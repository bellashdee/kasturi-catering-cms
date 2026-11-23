"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importFeedMe, previewFeedMeImport, type CloseUpPreview, type FeedMePreview, type PreviewDay } from "@/lib/restaurant/feedmeActions";
import { channelLabel, paymentLabel } from "@/lib/restaurant/constants";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

const money = (v: number) => formatCurrency(Math.round(v * 100) / 100);
const dayText = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);

const FEEDME_STEPS = [
  "Sign in to the FeedMe portal (portal.feedme.cc) with the Restoran Bara Ikan Bakar account.",
  "Open Report → Overview.",
  "Pick the dates: one day or a longer range. Do not include today: a day is imported only after it is finished.",
  "Press Download and choose Excel. A .xlsx file is saved on your computer.",
];
const CLOSEUP_STEPS = [
  "For the split by payment method and by order type, download the Close up of ONE day: Report → Close up → pick the day → Download → Excel.",
  "A Close up of several days cannot be imported: download one day at a time, and not today.",
  "Choose the file here and press Read the file, as above. The system recognises a Close up by itself.",
  "If the day was already imported from the Overview with the same Nett, the split is attached to it (no second sale). If the day is not imported yet, the Close up creates it as a draft.",
  "Confirm the day in Daily Sales. The cash sales of the day then feed the expected cash of the cash session.",
];
const IMPORT_STEPS = [
  "Choose that file below and press Read the file. Nothing is saved yet.",
  "Check the preview. A day marked New can be imported. A day already imported is skipped. A day that is different from what is already saved is never overwritten.",
  "Tick the days and press Import the ticked days as drafts.",
  "Open Daily Sales and press Confirm the day. A confirmed day cannot be edited, only cancelled by a Manager with a reason.",
];

function StateBadge({ d }: { d: PreviewDay }) {
  if (d.state === "new") return <StatusBadge tone="success">New</StatusBadge>;
  if (d.state === "same") return <StatusBadge tone="neutral">Already imported (same figures)</StatusBadge>;
  if (d.state === "different") return <StatusBadge tone="danger">Different from what is already saved</StatusBadge>;
  return <StatusBadge tone="danger">Cannot be imported</StatusBadge>;
}

/** Upload the FeedMe overview Excel, check the preview, then import the ticked days as drafts. Nothing is saved before the second step. */
export function ImportFeedMe({ companyId, canSell }: { companyId: string; canSell: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FeedMePreview | null>(null);
  const [closeup, setCloseup] = useState<CloseUpPreview | null>(null);
  const [closeupAck, setCloseupAck] = useState(false);
  const [doneText, setDoneText] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: { date: string; reason: string }[] } | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setCloseup(null);
    setCloseupAck(false);
    setPicked(new Set());
    if (fileRef.current) fileRef.current.value = "";
  }

  async function read() {
    if (!file) {
      setError("Choose the FeedMe Excel file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    setDoneText(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("companyId", companyId);
      const r = await previewFeedMeImport(fd);
      if (!r.ok) {
        setPreview(null);
        setCloseup(null);
        setError(r.error);
        return;
      }
      if (r.kind === "closeup") {
        setPreview(null);
        setCloseup(r.closeup);
        setCloseupAck(false);
        return;
      }
      setCloseup(null);
      setPreview(r.preview);
      // the days that are new and have nothing keyed in by hand are ticked; the others wait for a decision
      setPicked(new Set(r.preview.days.filter((d) => d.state === "new" && d.manualLines === 0).map((d) => d.date)));
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCloseUp() {
    if (!file || !closeup) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("companyId", companyId);
      if (closeup.state === "new_day" && closeup.manualLines > 0 && closeupAck) fd.append("ack", closeup.day.date);
      const attached = closeup.state === "attach";
      const r = await importFeedMe(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDoneText(attached ? "The split was attached to the saved day." : "The day was imported as a draft, with its split.");
      setDone({ imported: r.imported, skipped: r.skipped });
      reset();
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!file || !preview) return;
    if (picked.size === 0) {
      setError("Tick at least one day to import.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("companyId", companyId);
      for (const d of preview.days) {
        if (!picked.has(d.date)) continue;
        fd.append("date", d.date);
        if (d.manualLines > 0) fd.append("ack", d.date);
      }
      const r = await importFeedMe(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone({ imported: r.imported, skipped: r.skipped });
      reset();
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const chosenDays = preview?.days.filter((d) => picked.has(d.date)) ?? [];
  const totals = chosenDays.reduce((t, d) => ({ gross: t.gross + d.gross, discount: t.discount + d.discount, nett: t.nett + d.nett, bills: t.bills + d.bills }), { gross: 0, discount: 0, nett: 0, bills: 0 });

  return (
    <div className="flex flex-col gap-4">
      <details className="rounded-3xl border border-border bg-surface p-5 shadow-sm" open>
        <summary className="cursor-pointer text-[15px] font-bold text-text">How to get the sales from FeedMe into the system</summary>
        <div className="mt-3 grid grid-cols-1 gap-4 text-[13.5px] text-text-secondary lg:grid-cols-3">
          <div>
            <div className="mb-1 font-bold text-text">In FeedMe</div>
            <ol className="list-decimal pl-5">{FEEDME_STEPS.map((t) => <li key={t} className="mb-1">{t}</li>)}</ol>
          </div>
          <div>
            <div className="mb-1 font-bold text-text">The Close up of one day (split by payment and channel)</div>
            <ol className="list-decimal pl-5">{CLOSEUP_STEPS.map((t) => <li key={t} className="mb-1">{t}</li>)}</ol>
          </div>
          <div>
            <div className="mb-1 font-bold text-text">In this system</div>
            <ol className="list-decimal pl-5">{IMPORT_STEPS.map((t) => <li key={t} className="mb-1">{t}</li>)}</ol>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] text-text-muted">The Overview file holds the total of each day only. The split by payment method (cash, QR, platform) and by order type (dine-in, delivery) comes from the Close up file, one day at a time. The two splits are not crossed: the file does not say how much of the cash was dine-in.</p>
      </details>

      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {done && (
        <div role="status" className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">
          <div className="font-semibold">{doneText ?? (done.imported === 1 ? "1 day was imported as a draft." : `${done.imported} days were imported as drafts.`)}</div>
          {done.skipped.length > 0 && <ul className="mt-1 list-disc pl-5">{done.skipped.map((s) => <li key={s.date}>{`${dayText(s.date)}: ${s.reason}`}</li>)}</ul>}
          {done.imported > 0 && <div className="mt-1"><Link href="/restaurant/sales" className="font-semibold text-primary underline">Open Daily Sales to confirm them</Link></div>}
        </div>
      )}

      {!canSell ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-[13px] text-text-muted">You can read the sales. Ask an Admin to give you the Cashier, Finance or Manager role to import them.</div>
      ) : (
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <label className={SPEND_LABEL}>FeedMe Excel file (.xlsx) *</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setError(null);
              setDone(null);
            }}
            className={`${SPEND_INPUT} h-auto py-2`}
          />
          <div className={SPEND_HINT}>FeedMe → Report → Overview → Download → Excel. Up to about 900 KB.</div>
          <button type="button" disabled={busy || !file} onClick={read} className={`mt-3 ${SPEND_SAVE_BTN}`}>{busy && !preview ? "Reading..." : "Read the file"}</button>
        </div>
      )}

      {closeup && (
        <div className="rounded-3xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3.5">
            <div className="text-[15px] font-bold text-text">Close up preview: nothing is saved yet</div>
            <div className="mt-0.5 text-[12.5px] text-text-secondary">{`${closeup.fileName} · ${closeup.merchant} · ${dayText(closeup.day.date)}`}</div>
          </div>
          <div className="flex flex-col gap-4 p-5 text-[13.5px]">
            <div>
              {closeup.state === "new_day" && <StatusBadge tone="success">New day: the Close up creates it as a draft</StatusBadge>}
              {closeup.state === "attach" && <StatusBadge tone="success">The day is already saved with the same figures: the split is attached to it (no second sale)</StatusBadge>}
              {closeup.state === "same" && <StatusBadge tone="neutral">This Close up is already imported</StatusBadge>}
              {closeup.state === "different" && <StatusBadge tone="danger">Different from what is already saved</StatusBadge>}
              {closeup.state === "blocked" && <StatusBadge tone="danger">Cannot be imported</StatusBadge>}
              {closeup.day.problem && <div className="mt-1 text-[12.5px] text-danger">{closeup.day.problem}</div>}
              {closeup.state === "different" && closeup.saved && (
                <div className="mt-1 text-[12.5px] text-text-secondary">{`Saved (${closeup.saved.status}): ${closeup.saved.bills} bills, gross ${money(closeup.saved.gross)}, nett ${money(closeup.saved.nett)}. This file: ${closeup.day.bills} bills, gross ${money(closeup.day.gross)}, nett ${money(closeup.day.nett)}. Nothing is overwritten.`}</div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
              <div className="flex justify-between"><span>Bills</span><span className="font-semibold">{closeup.day.bills}</span></div>
              <div className="flex justify-between"><span>Pax</span><span className="font-semibold">{closeup.day.pax ?? "—"}</span></div>
              <div className="flex justify-between"><span>Gross</span><span className="font-semibold">{money(closeup.day.gross)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span className="font-semibold">{money(closeup.day.discount)}</span></div>
              <div className="flex justify-between"><span>SC</span><span className="font-semibold">{money(closeup.day.serviceCharge)}</span></div>
              <div className="flex justify-between"><span>SST</span><span className="font-semibold">{money(closeup.day.sst)}</span></div>
              <div className="flex justify-between"><span>Rounding</span><span className="font-semibold">{money(closeup.day.rounding)}</span></div>
              <div className="flex justify-between"><span>Nett</span><span className="font-bold">{money(closeup.day.nett)}</span></div>
              <div className="flex justify-between"><span>Voided / draft bills (not sales)</span><span className="font-semibold">{money(closeup.day.voidAmount)}</span></div>
              <div className="flex justify-between"><span>Refunds (not sales)</span><span className="font-semibold">{money(closeup.day.refundAmount)}</span></div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1 font-bold text-text">By payment method</div>
                <table className="w-full">
                  <tbody>
                    {closeup.day.payments.map((p) => (
                      <tr key={p.label} className="border-b border-border last:border-0">
                        <td className="py-1.5">{p.label}</td>
                        <td className="py-1.5 text-text-secondary">→ {paymentLabel(p.key)}{p.unknown && <span className="ml-1 font-semibold text-warning">unknown name</span>}</td>
                        <td className="py-1.5 text-right text-text-secondary">{p.qty}</td>
                        <td className="py-1.5 text-right font-semibold">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="mb-1 font-bold text-text">By order type</div>
                <table className="w-full">
                  <tbody>
                    {closeup.day.channels.map((p) => (
                      <tr key={p.label} className="border-b border-border last:border-0">
                        <td className="py-1.5">{p.label}</td>
                        <td className="py-1.5 text-text-secondary">→ {channelLabel(p.key)}{p.unknown && <span className="ml-1 font-semibold text-warning">unknown name</span>}</td>
                        <td className="py-1.5 text-right text-text-secondary">{p.qty}</td>
                        <td className="py-1.5 text-right font-semibold">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {(closeup.day.payments.some((p) => p.unknown) || closeup.day.channels.some((p) => p.unknown)) && (
              <div className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[12.5px] text-warning">A name that the system does not know is saved as Other, with its own name kept. Check that this is right before importing.</div>
            )}
            {closeup.state === "new_day" && closeup.manualLines > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[12.5px] text-warning">
                <input type="checkbox" checked={closeupAck} onChange={(e) => setCloseupAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
                <span>{`This day already has sales keyed in by hand: ${money(closeup.manualNet)} in ${closeup.manualLines} ${closeup.manualLines === 1 ? "line" : "lines"}. Tick the box only if the FeedMe total should be the sales of the day; the hand-keyed lines then only explain it.`}</span>
              </label>
            )}
            <p className="text-[12px] text-text-muted">The two splits explain the day; they are not a second sale. The payment amounts are the Nett collected (they include service charge, SST and rounding).</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5">
            <button type="button" onClick={reset} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Start again</button>
            {canSell && (closeup.state === "new_day" || closeup.state === "attach") && (
              <button type="button" disabled={busy || (closeup.state === "new_day" && closeup.manualLines > 0 && !closeupAck)} onClick={saveCloseUp} className={SPEND_SAVE_BTN}>
                {busy ? "Importing..." : closeup.state === "attach" ? "Attach the split to the saved day" : "Import this day as a draft"}
              </button>
            )}
          </div>
        </div>
      )}

      {preview && (
        <div className="rounded-3xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3.5">
            <div className="text-[15px] font-bold text-text">Preview: nothing is saved yet</div>
            <div className="mt-0.5 text-[12.5px] text-text-secondary">{`${preview.fileName} · ${preview.merchant}${preview.dateRange ? ` · ${preview.dateRange}` : ""}`}</div>
          </div>
          {preview.warnings.length > 0 && (
            <div className="m-4 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[12.5px] text-warning">
              <ul className="list-disc pl-5">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <div className="overflow-x-auto p-2 sm:p-4">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-muted">
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 text-right font-semibold">Bills</th>
                  <th className="px-2 py-2 text-right font-semibold">Pax</th>
                  <th className="px-2 py-2 text-right font-semibold">Gross</th>
                  <th className="px-2 py-2 text-right font-semibold">Discount</th>
                  <th className="px-2 py-2 text-right font-semibold">SC</th>
                  <th className="px-2 py-2 text-right font-semibold">SST</th>
                  <th className="px-2 py-2 text-right font-semibold">Rounding</th>
                  <th className="px-2 py-2 text-right font-semibold">Nett</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.days.map((d) => (
                  <tr key={`${d.date}-${d.outlet}`} className="border-b border-border align-top last:border-0">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={picked.has(d.date)}
                        disabled={d.state !== "new" || busy}
                        onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(d.date); else next.delete(d.date); return next; })}
                        aria-label={dayText(d.date)}
                        className="h-5 w-5 accent-[var(--color-primary)]"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{dayText(d.date)}</td>
                    <td className="px-2 py-2 text-right">{d.bills}</td>
                    <td className="px-2 py-2 text-right">{d.pax ?? "—"}</td>
                    <td className="px-2 py-2 text-right">{money(d.gross)}</td>
                    <td className="px-2 py-2 text-right">{money(d.discount)}</td>
                    <td className="px-2 py-2 text-right">{money(d.serviceCharge)}</td>
                    <td className="px-2 py-2 text-right">{money(d.sst)}</td>
                    <td className="px-2 py-2 text-right">{money(d.rounding)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{money(d.nett)}</td>
                    <td className="px-2 py-2">
                      <StateBadge d={d} />
                      {d.problem && <div className="mt-1 text-[12px] text-danger">{d.problem}</div>}
                      {d.state === "different" && d.saved && (
                        <div className="mt-1 text-[12px] text-text-secondary">{`Saved (${d.saved.status}): ${d.saved.bills} bills, gross ${money(d.saved.gross)}, nett ${money(d.saved.nett)}. This file: ${d.bills} bills, gross ${money(d.gross)}, nett ${money(d.nett)}. Nothing is overwritten.`}</div>
                      )}
                      {d.state === "new" && d.manualLines > 0 && (
                        <div className="mt-1 text-[12px] text-warning">{`This day already has sales keyed in by hand: ${money(d.manualNet)} in ${d.manualLines} ${d.manualLines === 1 ? "line" : "lines"}. Tick the box only if the FeedMe total should be the sales of the day; the hand-keyed lines then only explain it.`}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5">
            <div className="text-[13px] text-text-secondary">{`Ticked: ${chosenDays.length} ${chosenDays.length === 1 ? "day" : "days"} · bills ${totals.bills} · gross ${money(totals.gross)} · discount ${money(totals.discount)} · nett ${money(totals.nett)}`}</div>
            <div className="flex gap-2">
              <button type="button" onClick={reset} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Start again</button>
              {canSell && <button type="button" disabled={busy || picked.size === 0} onClick={save} className={SPEND_SAVE_BTN}>{busy ? "Importing..." : "Import the ticked days as drafts"}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
