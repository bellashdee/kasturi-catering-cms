"use client";

import { SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { MealTypeSelect } from "@/components/catering/MealTypeSelect";
import type { SecondChoice } from "@/lib/catering/days";
import type { AdditionalServices } from "@/lib/catering/quotationRequest";
import { formatPrice } from "@/lib/format";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const areaClass =
  "mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

/** One of a day's optional second menus: an alternative menu (menu, qty pax, meal type, service type, price per meal). */
export function SecondChoiceEditor({ value, onChange }: { value: SecondChoice; onChange: (v: SecondChoice) => void }) {
  const patch = (change: Partial<SecondChoice>) => onChange({ ...value, ...change });
  const toggleMeal = (key: string) =>
    patch({ mealTypes: value.mealTypes.includes(key) ? value.mealTypes.filter((m) => m !== key) : [...value.mealTypes, key] });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div>
        <label className={labelClass}>Menu</label>
        <textarea maxLength={3000} value={value.menu} onChange={(e) => patch({ menu: e.target.value })} className={areaClass} placeholder="Menu for the second menu" />
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
        <MealTypeSelect value={value.mealTypes} onToggle={toggleMeal} />
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

/** A Yes / No pair of radio buttons; the browser itself refuses to send the form until one is chosen. */
function YesNo({ name, label, answer, onAnswer }: { name: string; label: string; answer: boolean | null; onAnswer: (v: boolean) => void }) {
  return (
    <fieldset className="flex min-w-60 flex-wrap items-center gap-x-4 gap-y-1">
      <legend className="sr-only">{label}</legend>
      <span className="min-w-44 text-[13px] font-semibold text-text" aria-hidden="true">{label}</span>
      <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-text">
        <input type="radio" name={name} required checked={answer === true} onChange={() => onAnswer(true)} className="accent-[var(--color-primary)]" />
        Yes
      </label>
      <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-text">
        <input type="radio" name={name} required checked={answer === false} onChange={() => onAnswer(false)} className="accent-[var(--color-primary)]" />
        No
      </label>
    </fieldset>
  );
}

/** "Additional requirement": each of equipment handling, staff serving (RM per pax) and transportation (RM) must be answered Yes or No. */
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
        <YesNo name="equipment-handling" label="Equipment handling" answer={value.equipmentHandling} onAnswer={(v) => patch({ equipmentHandling: v })} />
        <input type="number" min="0" step="0.01" disabled={value.equipmentHandling !== true} value={value.equipmentHandlingPrice ?? ""} onChange={(e) => patch({ equipmentHandlingPrice: num(e.target.value) })} className={small} placeholder="RM (optional)" />
      </div>

      <div className={row}>
        <YesNo name="staff-serving" label="Staff serving (RM / pax)" answer={value.staffServing} onAnswer={(v) => patch({ staffServing: v })} />
        <input type="number" min="0" step="0.01" disabled={value.staffServing !== true} required={value.staffServing === true} value={value.staffServingPricePerPax ?? ""} onChange={(e) => patch({ staffServingPricePerPax: num(e.target.value) })} className={small} placeholder="RM per pax *" />
        {value.staffServing === true && value.staffServingPricePerPax !== undefined && totalServings > 0 && (
          <span className="text-xs text-text-muted">{totalServings} pax × {formatPrice(value.staffServingPricePerPax)} = {formatPrice(totalServings * value.staffServingPricePerPax)}</span>
        )}
      </div>

      <div className={row}>
        <YesNo name="transportation" label="Transportation (RM)" answer={value.transportation} onAnswer={(v) => patch({ transportation: v })} />
        <input type="number" min="0" step="0.01" disabled={value.transportation !== true} required={value.transportation === true} value={value.transportationPrice ?? ""} onChange={(e) => patch({ transportationPrice: num(e.target.value) })} className={small} placeholder="RM *" />
      </div>

      <div className={row}>
        <YesNo name="dome-set" label="Dome set" answer={value.domeSet} onAnswer={(v) => patch({ domeSet: v })} />
        <input type="number" min="0" step="0.01" disabled={value.domeSet !== true} value={value.domeSetPrice ?? ""} onChange={(e) => patch({ domeSetPrice: num(e.target.value) })} className={small} placeholder="RM (optional)" />
      </div>
    </div>
  );
}
