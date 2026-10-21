"use client";

import { useMemo, useState } from "react";
import { submitQuotationRequest } from "@/lib/catering/quotationRequestActions";
import { EVENT_TYPE_OPTIONS, SALES_AGENTS } from "@/lib/catering/constants";
import { dayAmount, type EventDay } from "@/lib/catering/days";
import { additionalServiceLines, unansweredAdditionalServices, type AdditionalServices, type ExtraItem, type QuotationRequestInput } from "@/lib/catering/quotationRequest";
import { EventDaysEditor, emptyDay } from "@/components/catering/EventDaysEditor";
import { AdditionalServicesEditor } from "@/components/catering/QuotationRequestExtras";
import { formatPrice } from "@/lib/format";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const areaClass =
  "mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

type Header = Omit<QuotationRequestInput, "days" | "extraItems" | "additional">;
type ExtraRow = { itemName: string; quantity: string; unitPrice: string };

const emptyHeader: Header = {
  salesAgent: "",
  customerName: "",
  eventName: "",
  eventType: "",
  location: "",
  picName: "",
  picPhone: "",
  kitchenSetup: "",
  cateringSetup: "",
  remarks: "",
  website: "",
};

export function PublicQuotationForm({ companySlug }: { companySlug: string }) {
  const [form, setForm] = useState<Header>(emptyHeader);
  const [days, setDays] = useState<EventDay[]>([emptyDay()]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [additional, setAdditional] = useState<AdditionalServices>(unansweredAdditionalServices());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentName, setSentName] = useState<string | null>(null);

  function set<K extends keyof Header>(key: K, value: Header[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setExtra(i: number, field: keyof ExtraRow, value: string) {
    setExtras((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  const extrasTotal = useMemo(() => extras.reduce((t, r) => t + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0), [extras]);
  const daysTotal = days.reduce((t, d) => t + dayAmount(d), 0);
  const additionalTotal = additionalServiceLines(additional).reduce((t, i) => t + i.quantity * i.unitPrice, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const noMeal = days.findIndex((d) => d.mealTypes.length === 0);
    if (noMeal >= 0) {
      setError(`Day ${noMeal + 1}: select at least one meal type.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const extraItems: ExtraItem[] = extras.map((r) => ({ itemName: r.itemName, quantity: Number(r.quantity) || 0, unitPrice: Number(r.unitPrice) || 0 }));
      const result = await submitQuotationRequest(companySlug, { ...form, days, extraItems, additional });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      } else {
        setSentName(form.eventName);
        // keep the sales agent selected so several requests can be sent one after another
        setForm({ ...emptyHeader, salesAgent: form.salesAgent });
        setDays([emptyDay()]);
        setExtras([]);
        setAdditional(unansweredAdditionalServices());
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {sentName && (
        <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-sm text-success">
          Thank you. The quotation request for <span className="font-semibold">{sentName}</span> was sent to the office. You can fill in another one below.
        </div>
      )}
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Sales agent *</label>
          <select required value={form.salesAgent} onChange={(e) => set("salesAgent", e.target.value)} className={inputClass}>
            <option value="">Select your name</option>
            {SALES_AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Customer / company name *</label>
          <input required maxLength={200} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div>
          <label className={labelClass}>Event name *</label>
          <input required maxLength={200} value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className={inputClass} placeholder="e.g. Annual Conference 2026" />
        </div>
        <div>
          <label className={labelClass}>Event type *</label>
          <select required value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className={inputClass}>
            <option value="">Select event type</option>
            {EVENT_TYPE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Event location *</label>
        <input required maxLength={300} value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder="Venue / address" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>PIC *</label>
          <input required maxLength={200} value={form.picName} onChange={(e) => set("picName", e.target.value)} className={inputClass} placeholder="Person in charge" />
        </div>
        <div>
          <label className={labelClass}>PIC contact no. *</label>
          <input required type="tel" inputMode="tel" maxLength={50} value={form.picPhone} onChange={(e) => set("picPhone", e.target.value)} className={inputClass} placeholder="e.g. 012-3456789" />
        </div>
      </div>

      <div>
        <div className="text-[14px] font-extrabold text-text">Event days</div>
        <p className="mb-2 text-xs text-text-muted">One block for each day of the event (1 day, or 3-5 days for a conference). Use &quot;Add next day&quot; to copy the previous day.</p>
        <EventDaysEditor days={days} onChange={setDays} secondService={false} secondChoice mealRequired />
      </div>

      <div>
        <div className="text-[14px] font-extrabold text-text">Additional requirement (answer each one) *</div>
        <p className="mb-2 text-xs text-text-muted">Choose Yes or No for each. Each Yes is added to the quotation.</p>
        <AdditionalServicesEditor value={additional} onChange={setAdditional} />
      </div>

      <div>
        <div className="text-[14px] font-extrabold text-text">Other extra items (optional)</div>
        <p className="mb-2 text-xs text-text-muted">Anything else to quote, e.g. equipment hire, service charge.</p>
        {extras.map((row, i) => (
          <div key={i} className="mb-2 grid grid-cols-[2fr_0.7fr_1fr_auto] items-center gap-2">
            <input maxLength={200} value={row.itemName} onChange={(e) => setExtra(i, "itemName", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" placeholder="Item" />
            <input type="number" min="0" step="0.5" value={row.quantity} onChange={(e) => setExtra(i, "quantity", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" placeholder="Qty" />
            <input type="number" min="0" step="0.01" value={row.unitPrice} onChange={(e) => setExtra(i, "unitPrice", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" placeholder="Price (RM)" />
            <button type="button" onClick={() => setExtras((rows) => rows.filter((_, idx) => idx !== i))} className="text-xs font-semibold text-danger">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setExtras((rows) => [...rows, { itemName: "", quantity: "1", unitPrice: "" }])} className="text-[12.5px] font-semibold text-primary">
          + Add extra item
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Kitchen set-up</label>
          <textarea maxLength={2000} value={form.kitchenSetup} onChange={(e) => set("kitchenSetup", e.target.value)} className={areaClass} placeholder="What the kitchen must prepare / set up" />
        </div>
        <div>
          <label className={labelClass}>Catering set-up</label>
          <textarea maxLength={2000} value={form.cateringSetup} onChange={(e) => set("cateringSetup", e.target.value)} className={areaClass} placeholder="Tables, buffet line, equipment, staff on site" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Remarks</label>
        <textarea maxLength={2000} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={areaClass} />
      </div>

      <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-[13px] text-text-secondary">
        Estimated total: <span className="text-[15px] font-extrabold text-text">{formatPrice(daysTotal + extrasTotal + additionalTotal)}</span>
        <span className="ml-2 text-xs text-text-muted">(first choice for all days + additional requirement + extra items; the office confirms the final quotation)</span>
      </div>

      {/* hidden honeypot field: people never see or fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website</label>
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
      </div>

      <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
        {saving ? "Sending..." : "Send quotation request"}
      </button>
    </form>
  );
}
