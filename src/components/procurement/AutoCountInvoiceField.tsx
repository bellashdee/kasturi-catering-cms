"use client";

import { useEffect, useState } from "react";
import { findAutoCountInvoice, type AutoCountMatch } from "@/lib/procurement/actions";

const dateText = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");

/**
 * "AutoCount Invoice No.": the customer (sales) invoice number in AutoCount of the event this supplier invoice is a cost of.
 * Under the field it shows the event and customer that number belongs to, or says clearly that it is not in the system yet
 * (the supplier invoice can still be saved; it counts in the event's P&L as soon as that AutoCount invoice is uploaded).
 */
export function AutoCountInvoiceField({ value, onChange, inputClassName, labelClassName }: { value: string; onChange: (v: string) => void; inputClassName: string; labelClassName: string }) {
  const [state, setState] = useState<{ looked: string; matches: AutoCountMatch[] | null; error: string | null }>({ looked: "", matches: null, error: null });
  const wanted = value.replace(/\s+/g, "").toUpperCase();

  useEffect(() => {
    if (!wanted) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const r = await findAutoCountInvoice(wanted);
      if (stale) return;
      setState(r.ok ? { looked: wanted, matches: r.matches, error: null } : { looked: wanted, matches: null, error: r.error });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [wanted]);

  const current = wanted && state.looked === wanted ? state : null;
  const linked = current?.matches?.filter((m) => m.eventId) ?? [];
  const unlinked = current?.matches?.filter((m) => !m.eventId) ?? [];

  return (
    <div>
      <label className={labelClassName}>AutoCount Invoice No.</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. INV-KI2611/004" className={`${inputClassName} uppercase`} />
      <div className="mt-1 text-[12px]">
        {!wanted ? (
          <p className="text-text-muted">The customer invoice no. in AutoCount of the event this cost is for. The cost then goes straight into that event&apos;s P&amp;L.</p>
        ) : !current ? (
          <p className="text-text-muted">Checking...</p>
        ) : current.error ? (
          <p className="font-semibold text-danger">{current.error}</p>
        ) : linked.length > 0 ? (
          linked.map((m) => (
            <p key={`${m.invoiceNumber}-${m.eventId}`} className="font-semibold text-success">
              {`✓ ${m.invoiceNumber} · ${m.eventReference ? `${m.eventReference} · ` : ""}${m.eventName ?? ""}${m.eventDate ? ` (${dateText(m.eventDate)})` : ""}`}
              <span className="block font-normal text-text-secondary">{`Customer: ${m.customerName ?? "—"} · ${m.companyName}`}</span>
            </p>
          ))
        ) : unlinked.length > 0 ? (
          <p className="font-semibold text-warning">
            {`${unlinked[0].invoiceNumber} (${unlinked[0].customerName ?? "—"}) is in the system but not linked to any event yet, so this cost is not in any event P&L until that invoice is linked to its event.`}
          </p>
        ) : (
          <p className="font-semibold text-warning">
            {`There is no AutoCount invoice ${wanted} in the system yet. You can still save: this cost goes into the event's P&L as soon as that AutoCount invoice is uploaded.`}
          </p>
        )}
      </div>
    </div>
  );
}
