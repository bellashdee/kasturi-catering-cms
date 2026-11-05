"use client";

import { SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { MealTypeSelect } from "@/components/catering/MealTypeSelect";
import { secondMenuAmount, type SecondChoice } from "@/lib/catering/days";
import { LUMP_SUM_LABEL, type AdditionalServices } from "@/lib/catering/quotationRequest";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";
import { formatPrice } from "@/lib/format";

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

      {secondMenuAmount(value) > 0 && (
        <div className="mt-2 text-xs text-text-muted">
          Amount: <span className="font-semibold text-text">{formatPrice(secondMenuAmount(value))}</span>
        </div>
      )}

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

/** One "Other extra item" as it is typed (quantity and price are text until the form is sent). */
export type ExtraRow = { itemName: string; quantity: string; unitPrice: string };

/** "Other extra items (optional)": anything else to quote, e.g. equipment hire, service charge. */
export function ExtraItemsEditor({ rows, onChange }: { rows: ExtraRow[]; onChange: (rows: ExtraRow[]) => void }) {
  const patch = (i: number, field: keyof ExtraRow, value: string) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  return (
    <>
      {rows.map((row, i) => (
        <div key={i} className="mb-2 grid grid-cols-[2fr_0.7fr_1fr_auto] items-center gap-2">
          <input maxLength={200} value={row.itemName} onChange={(e) => patch(i, "itemName", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" placeholder="Item" />
          <input type="number" min="0" step="0.5" value={row.quantity} onChange={(e) => patch(i, "quantity", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" placeholder="Qty" />
          <input type="number" min="0" step="0.01" value={row.unitPrice} onChange={(e) => patch(i, "unitPrice", e.target.value)} className="h-9 rounded border border-border-strong px-2 text-[13px] outline-none" placeholder="Price (RM)" />
          <button type="button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} className="text-xs font-semibold text-danger">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { itemName: "", quantity: "1", unitPrice: "" }])} className="text-[12.5px] font-semibold text-primary">
        + Add extra item
      </button>
    </>
  );
}

const ANSWERS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "included", label: "Included in the food price" },
];

/** The answer of one requirement as the box shows it: "" (not answered), yes, no or included in the food price. */
const answerOf = (yes: boolean | null, included: boolean | undefined) => (yes === null ? "" : included ? "included" : yes ? "yes" : "no");

/**
 * "Additional requirement": each of equipment handling, staff serving, transportation and dome set is answered by searching and choosing:
 * Yes (with an optional RM), No or Included in the food price. Staff serving, transportation and dome set also ask how many (staff / trips / sets)
 * and the price of one; delivery and equipment handling can be charged together as one lump sum.
 */
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

  const answer = (v: string) => ({ yes: v === "" ? null : v !== "no", included: v === "included" });

  const line = (
    label: string,
    yes: boolean | null,
    included: boolean | undefined,
    price: number | undefined,
    set: (answer: string) => Partial<AdditionalServices>,
    setPrice: (n: number | undefined) => Partial<AdditionalServices>,
    pricePlaceholder = "RM (optional)",
  ) => {
    const a = answerOf(yes, included);
    return (
      <div className={row}>
        <span className={labelCls}>{label}</span>
        <div className="w-60">
          <ChoiceSelect required value={a} onChange={(v) => patch(set(v))} options={ANSWERS} placeholder="Search or choose" className={box} />
        </div>
        <input type="number" min="0" step="0.01" disabled={a !== "yes"} value={a === "yes" ? (price ?? "") : ""} onChange={(e) => patch(setPrice(num(e.target.value)))} className={small} placeholder={pricePlaceholder} />
      </div>
    );
  };

  /** A requirement counted in units (staff, dome sets): when it is given, how many, and (when charged) the price of one. */
  type Counted = { yes: boolean | null; included?: boolean; quantity?: number; price?: number };
  const countRow = (label: string, ask: string, perUnit: string, c: Counted, toPatch: (c: Counted) => Partial<AdditionalServices>) => {
    const a = answerOf(c.yes, c.included);
    const subtotal = a === "yes" && c.quantity && c.price ? c.quantity * c.price : 0;
    return (
      <div className={row}>
        <span className={labelCls}>{label}</span>
        <div className="w-60">
          <ChoiceSelect
            required
            value={a}
            onChange={(v) =>
              patch(
                toPatch({
                  yes: answer(v).yes,
                  included: answer(v).included,
                  price: v === "yes" ? c.price : undefined,
                  quantity: v === "yes" || v === "included" ? (c.quantity ?? 1) : undefined,
                }),
              )
            }
            options={ANSWERS}
            placeholder="Search or choose"
            className={box}
          />
        </div>
        {(a === "yes" || a === "included") && (
          <>
            <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-secondary">
              {ask} *
              <input type="number" min="1" step="1" required value={c.quantity ?? ""} onChange={(e) => patch(toPatch({ ...c, quantity: num(e.target.value) }))} className="h-9 w-20 rounded border border-border-strong px-2 text-[13px] outline-none" />
            </label>
            {a === "yes" && (
              <input type="number" min="0" step="0.01" value={c.price ?? ""} onChange={(e) => patch(toPatch({ ...c, price: num(e.target.value) }))} className={small} placeholder={`RM / ${perUnit} (optional)`} />
            )}
            {subtotal > 0 && <span className="text-[12.5px] text-text-muted">= {formatPrice(subtotal)}</span>}
          </>
        )}
      </div>
    );
  };

  const lumpSum = !!value.deliveryEquipmentLumpSum;
  function switchLumpSum(on: boolean) {
    // one answer and one price for both: it starts from the equipment handling answer
    if (on) patch({ deliveryEquipmentLumpSum: true, transportation: value.equipmentHandling, transportationIncluded: value.equipmentHandlingIncluded, equipmentHandlingPrice: undefined, transportationPrice: undefined, transportationTrips: undefined });
    else patch({ deliveryEquipmentLumpSum: false, lumpSumPrice: undefined });
  }

  const staffRow = countRow(
    "Staff serving",
    "How many staff",
    "staff",
    { yes: value.staffServing, included: value.staffServingIncluded, quantity: value.staffServingQuantity, price: value.staffServingPrice },
    (c) => ({ staffServing: c.yes, staffServingIncluded: c.included, staffServingQuantity: c.quantity, staffServingPrice: c.price }),
  );
  const domeRow = countRow(
    "Dome set",
    "How many sets",
    "set",
    { yes: value.domeSet, included: value.domeSetIncluded, quantity: value.domeSetQuantity, price: value.domeSetPrice },
    (c) => ({ domeSet: c.yes, domeSetIncluded: c.included, domeSetQuantity: c.quantity, domeSetPrice: c.price }),
  );

  const transportRow = countRow(
    "Transportation",
    "How many trips",
    "trip",
    { yes: value.transportation, included: value.transportationIncluded, quantity: value.transportationTrips, price: value.transportationPrice },
    (c) => ({ transportation: c.yes, transportationIncluded: c.included, transportationTrips: c.quantity, transportationPrice: c.price }),
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-text">
        <input type="checkbox" checked={lumpSum} onChange={(e) => switchLumpSum(e.target.checked)} className="accent-[var(--color-primary)]" />
        Delivery &amp; equipment handling as one lump-sum price
      </label>
      {lumpSum
        ? line(
            LUMP_SUM_LABEL,
            value.equipmentHandling,
            value.equipmentHandlingIncluded,
            value.lumpSumPrice,
            (v) => ({ equipmentHandling: answer(v).yes, equipmentHandlingIncluded: answer(v).included, transportation: answer(v).yes, transportationIncluded: answer(v).included, ...(v === "yes" ? {} : { lumpSumPrice: undefined }) }),
            (n) => ({ lumpSumPrice: n }),
            "RM lump sum (optional)",
          )
        : line("Equipment handling", value.equipmentHandling, value.equipmentHandlingIncluded, value.equipmentHandlingPrice, (v) => ({ equipmentHandling: answer(v).yes, equipmentHandlingIncluded: answer(v).included, ...(v === "yes" ? {} : { equipmentHandlingPrice: undefined }) }), (n) => ({ equipmentHandlingPrice: n }))}
      {staffRow}
      {!lumpSum && transportRow}
      {domeRow}
    </div>
  );
}
