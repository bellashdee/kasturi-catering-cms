"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { BTN, BTN_GHOST, BTN_SM_GHOST, Dialog, ErrorLine, FIELD, LABEL } from "@/components/priority/ui";
import { Select } from "@/components/ui/Select";
import { errorMessage } from "@/lib/actionResult";
import { EVENT_STATUS_LABEL } from "@/lib/catering/constants";
import { deletePnlEvent, listPnlEventCustomers, savePnlEventRow } from "@/lib/finance/eventPnlRowActions";
import type { FigureSlot } from "@/lib/finance/eventPnlRowEdit";

export type PnlActionRow = {
  id: string;
  reference: string | null;
  eventName: string;
  eventDate: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  netRevenue: number;
  directCosts: number;
  additional: number;
  /** Whether each figure can be typed here (null: it is changed on the event's P&L page). */
  slots: { revenue: FigureSlot | null; direct: FigureSlot | null; additional: FigureSlot | null };
};

const money = (n: number) => n.toFixed(2);

/** Edit (Save / Cancel) and Delete of one event on the Event P&L list. Cancel only closes the form; it never cancels the event. */
export function EventPnlRowActions({ row }: { row: PnlActionRow }) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[] | null>(null);
  const initial = () => ({
    eventName: row.eventName,
    eventDate: row.eventDate,
    status: row.status,
    customerId: row.customerId ?? "",
    netRevenue: money(row.netRevenue),
    directCosts: money(row.directCosts),
    additional: money(row.additional),
  });
  const [form, setForm] = useState(initial);
  const set = (k: keyof ReturnType<typeof initial>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function startEdit() {
    setError(null);
    setForm(initial());
    setOpen(true);
    if (!customers) {
      void listPnlEventCustomers(row.id).then((r) => {
        if (r.ok) setCustomers(r.customers);
        else setError(r.error);
      });
    }
  }

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const r = await work();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      after?.();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const figure = (slot: FigureSlot | null, shown: number, text: string) => (slot?.editable ? { shown, value: Number(text.trim() || "0") } : null);
    void run(
      () =>
        savePnlEventRow({
          eventId: row.id,
          eventName: form.eventName,
          eventDate: form.eventDate,
          status: form.status,
          customerId: form.customerId || null,
          netRevenue: figure(row.slots.revenue, row.netRevenue, form.netRevenue),
          directCosts: figure(row.slots.direct, row.directCosts, form.directCosts),
          additional: figure(row.slots.additional, row.additional, form.additional),
        }),
      () => setOpen(false),
    );
  }

  function remove() {
    const label = `${row.reference ? `${row.reference} ` : ""}${row.eventName}`;
    if (!window.confirm(t("Delete the event \"{0}\" ({1})? Its quotations and days are deleted too. This cannot be undone.").replace("{0}", label).replace("{1}", row.eventDate.split("-").reverse().join("/")))) return;
    void run(() => deletePnlEvent(row.id));
  }

  const figureField = (label: string, key: "netRevenue" | "directCosts" | "additional", slot: FigureSlot | null) => (
    <div>
      <label className={LABEL}>{`${label} (RM)`}</label>
      {slot?.editable ? (
        <input type="number" min={0} step="0.01" inputMode="decimal" value={form[key]} onChange={set(key)} className={FIELD} />
      ) : (
        <>
          <div className="flex h-10 items-center rounded-lg border border-border bg-surface-alt px-3 text-[14px] text-text-secondary">{form[key]}</div>
          <p className="mt-1 text-[11.5px] text-text-muted">{slot && !slot.editable ? slot.reason : "Change it on the event's P&L page."}</p>
        </>
      )}
    </div>
  );

  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5 print:hidden">
      <button type="button" className={BTN_SM_GHOST} disabled={busy} onClick={startEdit}>
        Edit
      </button>
      <button type="button" className={`${BTN_SM_GHOST} text-danger`} disabled={busy} onClick={remove}>
        Delete
      </button>
      {error && !open && <span className="w-full text-right text-[12px] font-semibold text-danger">{error}</span>}
      {open && (
        <Dialog title={`Edit event — ${row.eventName}`} onClose={() => !busy && setOpen(false)}>
          <form className="flex flex-col gap-4" onSubmit={save}>
            <ErrorLine message={error} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LABEL}>Event name *</label>
                <input required value={form.eventName} onChange={set("eventName")} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>Event date *</label>
                <input type="date" required value={form.eventDate} onChange={set("eventDate")} className={FIELD} />
              </div>
              <div>
                <label className={LABEL}>Event status</label>
                <Select value={form.status} onChange={set("status")} className={FIELD}>
                  {Object.entries(EVENT_STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Customer</label>
                {customers ? (
                  <Select value={form.customerId} onChange={set("customerId")} className={FIELD}>
                    <option value="">— No customer —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id} translate="no">
                        {c.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="flex h-10 items-center rounded-lg border border-border bg-surface-alt px-3 text-[14px] text-text-secondary">
                    <span translate="no">{row.customerName ?? "—"}</span>
                    <span className="ml-2 text-[12px] text-text-muted">Loading customers…</span>
                  </div>
                )}
              </div>
              {figureField("Net revenue", "netRevenue", row.slots.revenue)}
              {figureField("Direct costs", "directCosts", row.slots.direct)}
              {figureField("Additional expenses", "additional", row.slots.additional)}
            </div>
            <p className="text-[12px] text-text-muted">
              A figure typed here is saved as one entry &quot;Entered on the Event P&amp;L list&quot;. Changing the status to Confirmed or In Production gives Kitchen a production order and Operation Management a delivery, as in Catering.{" "}
              <Link href={`/finance/event-pnl/${row.id}`} className="font-semibold text-primary hover:underline">
                Open the event&apos;s P&amp;L page
              </Link>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </span>
  );
}
