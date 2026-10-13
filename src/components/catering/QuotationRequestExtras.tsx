"use client";

import { MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import type { AdditionalServices, SecondChoice } from "@/lib/catering/quotationRequest";
import { formatPrice } from "@/lib/format";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const areaClass =
  "mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

/** The optional second choice: an alternative menu for the whole event (menu, qty pax, meal type, service type, price per meal). */
export function SecondChoiceEditor({ value, onChange }: { value: SecondChoice; onChange: (v: SecondChoice) => void }) {
  const patch = (change: Partial<SecondChoice>) => onChange({ ...value, ...change });
  const toggleMeal = (key: string) =>
    patch({ mealTypes: value.mealTypes.includes(key) ? value.mealTypes.filter((m) => m !== key) : [...value.mealTypes, key] });

  return (
    <div className="rounded-xl border border-border bg-surface-alt p-4">
      <div>
        <label className={labelClass}>Menu</label>
        <textarea maxLength={3000} value={value.menu} onChange={(e) => patch({ menu: e.target.value })} className={areaClass} placeholder="Menu for the second choice" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Qty pax</label>
          <input type="number" min="1" value={value.pax ?? ""} onChange={(e) => patch({ pax: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Price / meal (RM)</label>
          <input type="number" min="0" step="0.01" value={value.pricePerMeal ?? ""} onChange={(e) => patch({ pricePerMeal: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} placeholder="e.g. 35.00" />
        </div>
      </div>

      <div className="mt-3">
        <label className={labelClass}>Meal type</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {Object.entries(MEAL_TYPE_LABEL).map(([key, label]) => {
            const on = value.mealTypes.includes(key);
            return (
              <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold ${on ? "border-primary bg-info-bg text-primary" : "border-border-strong bg-surface text-text-secondary"}`}>
                <input type="checkbox" checked={on} onChange={() => toggleMeal(key)} className="accent-[var(--color-primary)]" />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <label className={labelClass}>Service type</label>
        <select value={value.serviceType} onChange={(e) => patch({ serviceType: e.target.value })} className={inputClass}>
          <option value="">Select service type</option>
          {Object.entries(SERVICE_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
    </div>
  );
}

/** "Additional equipment (tick whichever applies)": equipment handling, staff serving (RM per pax) and transportation (RM). */
export function AdditionalServicesEditor({
  value,
  onChange,
  totalServings,
}: {
  value: AdditionalServices;
  onChange: (v: AdditionalServices) => void;
  /** Pax of all days added together, used to show the staff serving amount. */
  totalServings: number;
}) {
  const patch = (change: Partial<AdditionalServices>) => onChange({ ...value, ...change });
  const small = "h-9 w-36 rounded border border-border-strong px-2 text-[13px] outline-none disabled:bg-surface-alt disabled:opacity-50";
  const row = "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface px-3 py-2.5";
  const num = (v: string) => (v ? Number(v) : undefined);

  return (
    <div className="flex flex-col gap-2">
      <div className={row}>
        <label className="flex min-w-48 cursor-pointer items-center gap-2 text-[13px] font-semibold text-text">
          <input type="checkbox" checked={value.equipmentHandling} onChange={(e) => patch({ equipmentHandling: e.target.checked })} className="accent-[var(--color-primary)]" />
          Equipment handling
        </label>
        <input type="number" min="0" step="0.01" disabled={!value.equipmentHandling} value={value.equipmentHandlingPrice ?? ""} onChange={(e) => patch({ equipmentHandlingPrice: num(e.target.value) })} className={small} placeholder="RM (optional)" />
      </div>

      <div className={row}>
        <label className="flex min-w-48 cursor-pointer items-center gap-2 text-[13px] font-semibold text-text">
          <input type="checkbox" checked={value.staffServing} onChange={(e) => patch({ staffServing: e.target.checked })} className="accent-[var(--color-primary)]" />
          Staff serving (RM / pax)
        </label>
        <input type="number" min="0" step="0.01" disabled={!value.staffServing} required={value.staffServing} value={value.staffServingPricePerPax ?? ""} onChange={(e) => patch({ staffServingPricePerPax: num(e.target.value) })} className={small} placeholder="RM per pax *" />
        {value.staffServing && value.staffServingPricePerPax !== undefined && totalServings > 0 && (
          <span className="text-xs text-text-muted">{totalServings} pax × {formatPrice(value.staffServingPricePerPax)} = {formatPrice(totalServings * value.staffServingPricePerPax)}</span>
        )}
      </div>

      <div className={row}>
        <label className="flex min-w-48 cursor-pointer items-center gap-2 text-[13px] font-semibold text-text">
          <input type="checkbox" checked={value.transportation} onChange={(e) => patch({ transportation: e.target.checked })} className="accent-[var(--color-primary)]" />
          Transportation (RM)
        </label>
        <input type="number" min="0" step="0.01" disabled={!value.transportation} required={value.transportation} value={value.transportationPrice ?? ""} onChange={(e) => patch({ transportationPrice: num(e.target.value) })} className={small} placeholder="RM *" />
      </div>
    </div>
  );
}
