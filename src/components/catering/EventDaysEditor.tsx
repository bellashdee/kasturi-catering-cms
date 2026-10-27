"use client";

import { MAX_EVENT_DAYS, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { MealTypeSelect } from "@/components/catering/MealTypeSelect";
import { MAX_SECOND_MENUS, dayAmount, dayPax, emptySecondChoice, secondMenusOf, type EventDay } from "@/lib/catering/days";
import { SecondChoiceEditor } from "@/components/catering/QuotationRequestExtras";
import { formatPrice } from "@/lib/format";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";
import { MenuPointsInput } from "@/components/catering/MenuPointsInput";

const SERVICE_OPTIONS = Object.entries(SERVICE_TYPE_LABEL).map(([value, label]) => ({ value, label }));

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
  mealRequired = false,
}: {
  days: EventDay[];
  onChange: (days: EventDay[]) => void;
  /** Show the second service type of each day (the office form). */
  secondService?: boolean;
  /** Show the optional second menus (up to 5 alternative menus) inside each day (the public quotation request form). */
  secondChoice?: boolean;
  /** At least one meal type must be ticked on every day (the public quotation request form). */
  mealRequired?: boolean;
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
            <label className={labelClass}>{mealRequired ? "Meal type *" : "Meal type"}</label>
            <MealTypeSelect value={day.mealTypes} onToggle={(key) => toggleMeal(i, key)} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Service type *</label>
              <ChoiceSelect
                required
                value={day.serviceType}
                onChange={(v) => {
                  patch(i, {
                    serviceType: v,
                    ...(v === "" ? { servicePax: undefined } : {}),
                    ...(v && v === day.secondServiceType ? { secondServiceType: "", secondServicePax: undefined } : {}),
                  });
                }}
                options={SERVICE_OPTIONS}
                placeholder="Search and choose the service type"
                className={inputClass}
              />
              {secondService && paxField(day, i)}
            </div>
            {!secondService && <div>{paxField(day, i)}</div>}
            {secondService && (
            <div>
              <label className={labelClass}>Second service type (optional)</label>
              <ChoiceSelect
                value={day.secondServiceType ?? ""}
                disabled={!day.serviceType}
                onChange={(v) => patch(i, { secondServiceType: v, ...(v ? {} : { secondServicePax: undefined }) })}
                options={[{ value: "", label: "None" }, ...SERVICE_OPTIONS.filter((o) => o.value !== day.serviceType)]}
                placeholder="Search or choose"
                className={inputClass}
              />
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
              <div className={labelClass}>Menu details</div>
              <MenuPointsInput value={day.menuDetails ?? ""} onChange={(v) => patch(i, { menuDetails: v })} />
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
              <div className="text-[13px] font-extrabold text-text">Second menu (optional)</div>
              <p className="mb-2 text-xs text-text-muted">Alternative menus for this day, up to 5 a day (for example one for each meal type). They are shown to the office and are not added to the total.</p>
              <div className="flex flex-col gap-3">
                {secondMenusOf(day).map((menu, n) => (
                  <div key={n}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-[12.5px] font-bold text-text">Second menu {n + 1}</div>
                      <button type="button" onClick={() => patch(i, { secondChoice: undefined, secondMenus: secondMenusOf(day).filter((_, idx) => idx !== n) })} className="text-xs font-semibold text-danger">
                        Remove second menu
                      </button>
                    </div>
                    <SecondChoiceEditor value={menu} onChange={(v) => patch(i, { secondChoice: undefined, secondMenus: secondMenusOf(day).map((m, idx) => (idx === n ? v : m)) })} />
                  </div>
                ))}
              </div>
              {secondMenusOf(day).length < MAX_SECOND_MENUS ? (
                <button type="button" onClick={() => patch(i, { secondChoice: undefined, secondMenus: [...secondMenusOf(day), emptySecondChoice()] })} className="mt-2 text-[12.5px] font-semibold text-primary">
                  + Add second menu
                </button>
              ) : (
                <p className="mt-2 text-xs text-text-muted">The most is 5 second menus a day.</p>
              )}
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
