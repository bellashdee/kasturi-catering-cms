"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { getDocumentSignedUrl } from "@/lib/documents/actions";
import { uploadReceipt } from "@/lib/documents/upload";
import { reserveTab } from "@/lib/openTab";
import { attachExpenseBill, getAmountOrigin, type AmountOriginInfo } from "@/lib/origin/actions";
import type { OriginRef } from "@/lib/origin/kinds";
import { Dialog } from "@/components/priority/ui";

const when = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00+08:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", ...(iso.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}) });
};

async function openBill(documentId: string) {
  // the tab is opened at the tap itself (phones block a tab opened after waiting for the link)
  const tab = reserveTab();
  try {
    tab.go(await getDocumentSignedUrl(documentId));
  } catch {
    tab.cancel();
    throw new Error("The bill could not be opened. Please try again.");
  }
}

/**
 * A money amount that shows where it comes from. Tapping the amount opens its bill straight away (when the record has exactly one
 * bill); the ⓘ next to it, or the amount of a record with no bill or several, opens the box with the bills, who keyed it in, when,
 * on which page, and its changes. Use it for every amount that comes from one record.
 */
export function AmountOrigin({
  origin,
  amount,
  text,
  billIds,
  className,
}: {
  origin: OriginRef | null | undefined;
  /** the amount shown (formatted as RM unless `text` is given) */
  amount?: number;
  /** what is shown instead of the RM amount (a "− RM 5.00", a count ...) */
  text?: React.ReactNode;
  /** the bills of the record when the page already knows them: one bill opens on the first tap, without waiting for the box */
  billIds?: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = text ?? (amount === undefined ? "" : formatCurrency(amount));
  if (!origin) return <span className={className}>{label}</span>;
  const oneBill = billIds && billIds.length === 1 ? billIds[0] : null;

  async function tapAmount(e: React.MouseEvent) {
    // the amount may sit inside a row that is a link: the tap is for the amount only
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    if (!oneBill) return setOpen(true);
    try {
      await openBill(oneBill);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The bill could not be opened.");
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={tapAmount}
        title={oneBill ? "Open the bill" : "Where does this amount come from?"}
        className={`${className ?? ""} cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary`}
      >
        {label}
      </button>
      {billIds && billIds.length > 0 && <span aria-hidden className="text-[11px]" title="Has a bill attached">📎</span>}
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} aria-label="Where does this amount come from?" title="Where does this amount come from?" className="rounded-full px-1 text-[12px] leading-none text-text-muted hover:bg-surface-alt hover:text-primary">
        ⓘ
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
      {open && <AmountOriginDialog origin={origin} onClose={() => setOpen(false)} />}
    </span>
  );
}

/** The box itself: the bills first, then who / when / where, the details and the changes. */
export function AmountOriginDialog({ origin, onClose }: { origin: OriginRef; onClose: () => void }) {
  const router = useRouter();
  const [info, setInfo] = useState<AmountOriginInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { kind, id } = origin;

  const load = useCallback(async () => {
    const res = await getAmountOrigin({ kind, id });
    if (res.ok) setInfo(res.info);
    else setError(res.error);
  }, [kind, id]);
  useEffect(() => {
    let alive = true;
    getAmountOrigin({ kind, id }).then((res) => {
      if (!alive) return;
      if (res.ok) setInfo(res.info);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [kind, id]);

  async function attach(file: File) {
    if (!info?.companyId) return;
    setBusy(true);
    setError(null);
    try {
      const documentId = await uploadReceipt(info.companyId, file);
      const res = await attachExpenseBill(origin.id, documentId);
      if (!res.ok) throw new Error(res.error);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The bill could not be attached.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Dialog title="Where does this amount come from?" onClose={onClose}>
      {!info && !error && <div className="text-[14px] text-text-secondary">Reading the record…</div>}
      {error && (
        <div role="alert" className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {error}
        </div>
      )}
      {info && (
        <div className="flex flex-col gap-4 text-[13.5px]">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{info.title}</div>
            <div className="text-[22px] font-extrabold text-text">{info.amount === null ? "—" : formatCurrency(info.amount)}</div>
            {info.date && <div className="text-text-secondary">{when(info.date)}</div>}
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">The bill</div>
            {info.bills.length === 0 ? (
              <div className="text-warning">
                No bill is attached to this record.
                {info.importedFrom ? " It was imported from a file (below)." : " Look for it using the details below (who keyed it in, the date and the invoice no.)."}
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {info.bills.map((b, i) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => openBill(b.id).catch((err) => setError(err.message))} className="text-left font-semibold text-primary hover:underline">
                      📎 {info.bills.length > 1 ? `Bill ${i + 1}: ` : ""}
                      {b.name}
                    </button>
                    <span className="text-[12px] text-text-muted">{[b.uploadedBy, when(b.uploadedAt)].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
            {info.canAttachBill && (
              <div className="mt-2">
                <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" id={`bill-${origin.id}`} onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
                <label htmlFor={`bill-${origin.id}`} className={`inline-flex h-8 cursor-pointer items-center rounded-md border border-border-strong bg-surface px-3 text-[12.5px] font-semibold text-text hover:bg-bg ${busy ? "opacity-50" : ""}`}>
                  {busy ? "Attaching…" : "Attach the bill (photo or PDF)"}
                </label>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-text-muted">Keyed in on</dt>
            <dd>{info.place.href ? <Link href={info.place.href} className="font-semibold text-primary hover:underline">{info.place.label}</Link> : info.place.label}</dd>
            <dt className="text-text-muted">Keyed in by</dt>
            <dd>{info.enteredBy ?? "Not recorded"}</dd>
            <dt className="text-text-muted">Keyed in at</dt>
            <dd>{when(info.enteredAt) ?? "Not recorded"}</dd>
            {info.changedAt && info.changedAt !== info.enteredAt && (
              <>
                <dt className="text-text-muted">Last changed</dt>
                <dd>{when(info.changedAt)}</dd>
              </>
            )}
            {info.importedFrom && (
              <>
                <dt className="text-text-muted">Imported from</dt>
                <dd className="font-semibold">{info.importedFrom}</dd>
              </>
            )}
            {info.facts.map((f) => (
              <span key={f.label} className="contents">
                <dt className="text-text-muted">{f.label}</dt>
                <dd className="break-words">{f.value}</dd>
              </span>
            ))}
          </dl>

          {info.history.length > 0 && (
            <div>
              <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-text-muted">Changes</div>
              <ul className="flex flex-col gap-1 text-[12.5px] text-text-secondary">
                {info.history.map((h, i) => (
                  <li key={i}>
                    <span className="font-semibold text-text">{when(h.at)}</span> · {h.by ?? "—"} · {h.action}
                    {h.before || h.after ? ` (${[h.before, h.after].filter(Boolean).join(" → ")})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
