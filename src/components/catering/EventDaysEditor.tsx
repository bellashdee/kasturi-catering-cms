"use client";

import { MAX_EVENT_DAYS, MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { dayAmount, dayPax, emptySecondChoice, type EventDay } from "@/lib/catering/days";
import { SecondChoiceEditor } from "@/components/catering/QuotationRequestExtras";
import { formatPrice } from "@/lib/format";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";
const areaClass =
  "mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";

export function emptyDay(dayDate = ""): EventDay {
  return { dayDate, mealTypes: [], serviceType: "" };
}

function nextDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** One block per day of a multi-day event: date, times, meals, service type + pax, menu, price per pax, remarks. */
export function EventDaysEditor({
  days,
  onChange,
  secondService = true,
  secondChoice = false,
}: {
  days: EventDay[];
  onChange: (days: EventDay[]) => void;
  /** Show the second service type of each day (the office form). */
  secondService?: boolean;
  /** Show an optional second choice (an alternative menu) inside each day (the public quotation request form). */
  secondChoice?: boolean;
}) {
  function patch(i: number, change: Partial<EventDay>) {
    onChange(days.map((d, idx) => (idx === i ? { ...d, ...change } : d)));
  }

  function addDay(copyPrevious: boolean) {
    const last = days[days.length - 1];
    const date = nextDate(last?.dayDate ?? "");
    onChange([...days, copyPrevious && last ? { ...last, dayDate: date } : emptyDay(date)]);
  }

  function toggleMeal(i: number, key: string) {
    const current = days[i].mealTypes;
    patch(i, { mealTypes: current.includes(key) ? current.filter((m) => m !== key) : [...current, key] });
  }

  /** Pax for the (first) service type of a day. */
  const paxField = (day: EventDay, i: number) => (
    <>
      <label className={`${labelClass} ${secondService ? "mt-3 " : ""}block`}>Pax for this service *</label>
      <input
        type="number"
        min="1"
        required={!!day.serviceType}
        disabled={!day.serviceType}
        value={day.servicePax ?? ""}
        onChange={(e) => patch(i, { servicePax: e.target.value ? Number(e.target.value) : undefined })}
        className={inputClass}
      />
    </>
  );

  const totalAmount = days.reduce((t, d) => t + dayAmount(d), 0);
  const peakPax = days.reduce((m, d) => Math.max(m, dayPax(d)), 0);
  const mealPax = days.reduce((t, d) => t + dayPax(d), 0);

  return (
    <div className="flex flex-col gap-4">
      {days.map((day, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface-alt p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-extrabold text-text">Day {i + 1}</div>
            {days.length > 1 && (
              <button type="button" onClick={() => onChange(days.filter((_, idx) => idx !== i))} className="text-xs font-semibold text-danger">
                Remove day
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Event date *</label>
              <input type="date" required value={day.dayDate} onChange={(e) => patch(i, { dayDate: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Set-up time (kitchen side) *</label>
              <input type="time" required value={day.setupTime ?? ""} onChange={(e) => patch(i, { setupTime: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Event time *</label>
              <input type="time" required value={day.eventTime ?? ""} onChange={(e) => patch(i, { eventTime: e.target.value })} className={inputClass} />
            </div>
          </div>

          <div className="mt-3">
            <label className={labelClass}>Meal type</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {Object.entries(MEAL_TYPE_LABEL).map(([key, label]) => {
                const on = day.mealTypes.includes(key);
                return (
                  <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold ${on ? "border-primary bg-info-bg text-primary" : "border-border-strong bg-surface text-text-secondary"}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleMeal(i, key)} className="accent-[var(--color-primary)]" />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Service type *</label>
              <select
                required
                value={day.serviceType}
                onChange={(e) => {
                  const v = e.target.value;
                  patch(i, {
                    serviceType: v,
                    ...(v === "" ? { servicePax: undefined } : {}),
                    ...(v && v === day.secondServiceType ? { secondServiceType: "", secondServicePax: undefined } : {}),
                  });
                }}
                className={inputClass}
              >
                <option value="">Select service type</option>
                {Object.entries(SERVICE_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              {secondService && paxField(day, i)}
            </div>
            {!secondService && <div>{paxField(day, i)}</div>}
            {secondService && (
            <div>
              <label className={labelClass}>Second service type (optional)</label>
              <select
                value={day.secondServiceType ?? ""}
                disabled={!day.serviceType}
                onChange={(e) => patch(i, { secondServiceType: e.target.value, ...(e.target.value ? {} : { secondServicePax: undefined }) })}
                className={inputClass}
              >
                <option value="">None</option>
                {Object.entries(SERVICE_TYPE_LABEL).filter(([key]) => key !== day.serviceType).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <label className={`${labelClass} mt-3 block`}>Pax for this service{day.secondServiceType ? " *" : ""}</label>
              <input
                type="number"
                min="1"
                required={!!day.secondServiceType}
                disabled={!day.secondServiceType}
                value={day.secondServicePax ?? ""}
                onChange={(e) => patch(i, { secondServicePax: e.target.value ? Number(e.target.value) : undefined })}
                className={inputClass}
              />
            </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-[2fr_1fr] gap-4">
            <div>
              <label className={labelClass}>Menu details</label>
              <textarea value={day.menuDetails ?? ""} onChange={(e) => patch(i, { menuDetails: e.target.value })} className={areaClass} placeholder="Menu for this day" />
            </div>
            <div>
              <label className={labelClass}>Price per pax (RM)</label>
              <input type="number" min="0" step="0.01" value={day.pricePerPax ?? ""} onChange={(e) => patch(i, { pricePerPax: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} placeholder="e.g. 35.00" />
              <div className="mt-2 text-xs text-text-muted">
                Total pax: <span className="font-semibold text-text">{dayPax(day) || "—"}</span>
                {day.pricePerPax ? <> · Amount: <span className="font-semibold text-text">{formatPrice(dayAmount(day))}</span></> : null}
              </div>
            </div>
          </div>

          {secondChoice && (
            <div className="mt-3">
              <div className="text-[13px] font-extrabold text-text">Second choice (optional)</div>
              <p className="mb-2 text-xs text-text-muted">An alternative menu for this day. It is shown to the office and is not added to the total.</p>
              <SecondChoiceEditor value={day.secondChoice ?? emptySecondChoice()} onChange={(v) => patch(i, { secondChoice: v })} />
            </div>
          )}

          <div className="mt-3">
            <label className={labelClass}>Remarks for this day</label>
            <textarea value={day.remarks ?? ""} onChange={(e) => patch(i, { remarks: e.target.value })} className={areaClass} placeholder="Anything special for this day" />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-4">
        {days.length < MAX_EVENT_DAYS && (
          <>
            <button type="button" onClick={() => addDay(true)} className="text-[12.5px] font-semibold text-primary">
              + Add next day (copy of previous day)
            </button>
            <button type="button" onClick={() => addDay(false)} className="text-[12.5px] font-semibold text-text-secondary">
              + Add empty day
            </button>
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-text-secondary">
        {days.length} day(s) · Biggest day: <span className="font-semibold text-text">{peakPax} pax</span> · Total servings over all days: <span className="font-semibold text-text">{mealPax}</span>
        {totalAmount > 0 && <> · Total at the prices above: <span className="font-semibold text-text">{formatPrice(totalAmount)}</span></>}
      </div>
    </div>
  );
}
