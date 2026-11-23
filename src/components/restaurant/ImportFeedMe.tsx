"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importFeedMe, previewFeedMeImport, type FeedMePreview, type PreviewDay } from "@/lib/restaurant/feedmeActions";
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
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: { date: string; reason: string }[] } | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
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
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("companyId", companyId);
      const r = await previewFeedMeImport(fd);
      if (!r.ok) {
        setPreview(null);
        setError(r.error);
        return;
      }
      setPreview(r.preview);
      // the days that are new and have nothing keyed in by hand are ticked; the others wait for a decision
      setPicked(new Set(r.preview.days.filter((d) => d.state === "new" && d.manualLines === 0).map((d) => d.date)));
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
        <div className="mt-3 grid grid-cols-1 gap-4 text-[13.5px] text-text-secondary lg:grid-cols-2">
          <div>
            <div className="mb-1 font-bold text-text">In FeedMe</div>
            <ol className="list-decimal pl-5">{FEEDME_STEPS.map((t) => <li key={t} className="mb-1">{t}</li>)}</ol>
          </div>
          <div>
            <div className="mb-1 font-bold text-text">In this system</div>
            <ol className="list-decimal pl-5">{IMPORT_STEPS.map((t) => <li key={t} className="mb-1">{t}</li>)}</ol>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] text-text-muted">This Excel file holds the total of each day only. It does not split the sales by dine-in or takeaway, or by cash, QR or card. That split comes from FeedMe&apos;s Close up report, which is not imported yet.</p>
      </details>

      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {done && (
        <div role="status" className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">
          <div className="font-semibold">{done.imported === 1 ? "1 day was imported as a draft." : `${done.imported} days were imported as drafts.`}</div>
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
