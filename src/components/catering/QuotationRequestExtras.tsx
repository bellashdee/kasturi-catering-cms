"use client";

import { SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { MealTypeSelect } from "@/components/catering/MealTypeSelect";
import type { SecondChoice } from "@/lib/catering/days";
import type { AdditionalServices } from "@/lib/catering/quotationRequest";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";

const SERVICE_OPTIONS = Object.entries(SERVICE_TYPE_LABEL).map(([value, label]) => ({ value, label }));

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
        <ChoiceSelect value={value.serviceType} onChange={(v) => patch({ serviceType: v })} options={SERVICE_OPTIONS} placeholder="Search or choose the service type" className={inputClass} />
      </div>
    </div>
  );
}

const ANSWERS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "included", label: "Included in the food price" },
];

/** The answer of one requirement as the box shows it: "" (not answered), yes, no or included in the food price. */
const answerOf = (yes: boolean | null, included: boolean | undefined) => (yes === null ? "" : included ? "included" : yes ? "yes" : "no");

/** "Additional requirement": each of equipment handling, staff serving, transportation and dome set is answered by searching and choosing: Yes (with an optional RM), No or Included in the food price. */
export function AdditionalServicesEditor({
  value,
  onChange,
}: {
  value: AdditionalServices;
  onChange: (v: AdditionalServices) => void;
}) {
  const patch = (change: Partial<AdditionalServices>) => onChange({ ...value, ...change });
  const small = "h-9 w-36 rounded border border-border-strong px-2 text-[13px] outline-none disabled:bg-surface-alt disabled:opacity-50";
  const box = "h-9 w-full rounded border border-border-strong px-2 text-[13px] outline-none focus:border-primary";
  const row = "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface px-3 py-2.5";
  const num = (v: string) => (v ? Number(v) : undefined);
  const labelCls = "min-w-44 text-[13px] font-semibold text-text";

  const line = (label: string, yes: boolean | null, included: boolean | undefined, price: number | undefined, set: (answer: string) => Partial<AdditionalServices>, setPrice: (n: number | undefined) => Partial<AdditionalServices>) => {
    const answer = answerOf(yes, included);
    return (
      <div className={row}>
        <span className={labelCls}>{label}</span>
        <div className="w-60">
          <ChoiceSelect required value={answer} onChange={(v) => patch(set(v))} options={ANSWERS} placeholder="Search or choose" className={box} />
        </div>
        <input type="number" min="0" step="0.01" disabled={answer !== "yes"} value={answer === "yes" ? (price ?? "") : ""} onChange={(e) => patch(setPrice(num(e.target.value)))} className={small} placeholder="RM (optional)" />
      </div>
    );
  };
  const answer = (v: string) => ({ yes: v === "" ? null : v !== "no", included: v === "included" });

  return (
    <div className="flex flex-col gap-2">
      {line("Equipment handling", value.equipmentHandling, value.equipmentHandlingIncluded, value.equipmentHandlingPrice, (v) => ({ equipmentHandling: answer(v).yes, equipmentHandlingIncluded: answer(v).included, ...(v === "yes" ? {} : { equipmentHandlingPrice: undefined }) }), (n) => ({ equipmentHandlingPrice: n }))}
      {line("Staff serving (RM / event)", value.staffServing, value.staffServingIncluded, value.staffServingPrice, (v) => ({ staffServing: answer(v).yes, staffServingIncluded: answer(v).included, ...(v === "yes" ? {} : { staffServingPrice: undefined }) }), (n) => ({ staffServingPrice: n }))}
      {line("Transportation (RM)", value.transportation, value.transportationIncluded, value.transportationPrice, (v) => ({ transportation: answer(v).yes, transportationIncluded: answer(v).included, ...(v === "yes" ? {} : { transportationPrice: undefined }) }), (n) => ({ transportationPrice: n }))}
      {line("Dome set", value.domeSet, value.domeSetIncluded, value.domeSetPrice, (v) => ({ domeSet: answer(v).yes, domeSetIncluded: answer(v).included, ...(v === "yes" ? {} : { domeSetPrice: undefined }) }), (n) => ({ domeSetPrice: n }))}
    </div>
  );
}
