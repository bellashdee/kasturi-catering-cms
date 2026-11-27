"use client";

import { AdditionalServicesEditor, ExtraItemsEditor } from "@/components/catering/QuotationRequestExtras";
import {
  CATERING_SETUP_PLACEHOLDER,
  FORM_REQUIREMENT_FIELDS,
  KITCHEN_SETUP_PLACEHOLDER,
  NEEDS_LABEL,
  type CustomerNeedsValue,
} from "@/lib/catering/customerNeeds";
import { additionalServiceLines } from "@/lib/catering/quotationRequest";
import { formatPrice } from "@/lib/format";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const areaClass =
  "mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[13px] font-semibold text-text";
const sectionTitle = "mt-2 border-b-2 border-primary/30 pb-1.5 text-[16px] font-extrabold text-text";

/** What the extra items and the additional requirement add to the estimated total. */
export function customerNeedsAmount(v: CustomerNeedsValue): number {
  const extras = v.extras.reduce((t, r) => t + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0);
  return extras + additionalServiceLines(v.additional).reduce((t, i) => t + i.quantity * i.unitPrice, 0);
}

/**
 * "What the customer needs": the same section, in the same order and with the same words, on the sales agents' Quotation
 * Request Form and on New Event / Edit Event, so the two cannot drift apart. `daysTotal` is the amount of the event days,
 * for the estimated total at the end.
 */
export function CustomerNeedsSection({
  value,
  onChange,
  daysTotal,
  answersRequired = true,
  children,
}: {
  value: CustomerNeedsValue;
  onChange: (v: CustomerNeedsValue) => void;
  daysTotal: number;
  /** false only for an event edited from before the answers were kept */
  answersRequired?: boolean;
  /** shown between the remarks and the estimated total (the public form's attachments) */
  children?: React.ReactNode;
}) {
  const patch = (change: Partial<CustomerNeedsValue>) => onChange({ ...value, ...change });
  const setRequirement = (key: string, text: string) => patch({ requirements: { ...value.requirements, [key]: text } });

  return (
    <>
      <div>
        <div className={sectionTitle}>{NEEDS_LABEL.section}</div>
        <p className="mb-2 text-xs text-text-muted">{NEEDS_LABEL.intro}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>{NEEDS_LABEL.menuOptions}</label>
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={value.requirements.menuOptions ?? ""}
              onChange={(e) => patch({ requirements: { ...value.requirements, menuOptions: e.target.value ? Number(e.target.value) : undefined } })}
              className={`${inputClass} sm:max-w-[calc(50%-0.5rem)]`}
              placeholder="e.g. 2"
            />
          </div>
          {FORM_REQUIREMENT_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelClass}>{f.label}</label>
              <textarea maxLength={1000} value={value.requirements[f.key] ?? ""} onChange={(e) => setRequirement(f.key, e.target.value)} className={areaClass} placeholder={f.placeholder} />
            </div>
          ))}
          <div>
            <label className={labelClass}>{NEEDS_LABEL.kitchenSetup}</label>
            <textarea maxLength={2000} value={value.kitchenSetup} onChange={(e) => patch({ kitchenSetup: e.target.value })} className={areaClass} placeholder={KITCHEN_SETUP_PLACEHOLDER} />
          </div>
          <div>
            <label className={labelClass}>{NEEDS_LABEL.cateringSetup}</label>
            <textarea maxLength={2000} value={value.cateringSetup} onChange={(e) => patch({ cateringSetup: e.target.value })} className={areaClass} placeholder={CATERING_SETUP_PLACEHOLDER} />
          </div>
        </div>
      </div>

      <div>
        <div className={sectionTitle}>{answersRequired ? NEEDS_LABEL.additional : NEEDS_LABEL.additionalView}</div>
        <p className="mb-2 text-xs text-text-muted">{NEEDS_LABEL.additionalHelp}</p>
        <AdditionalServicesEditor value={value.additional} onChange={(additional) => patch({ additional })} required={answersRequired} />
      </div>

      <div>
        <div className={sectionTitle}>{NEEDS_LABEL.extras}</div>
        <p className="mb-2 text-xs text-text-muted">{NEEDS_LABEL.extrasHelp}</p>
        <ExtraItemsEditor rows={value.extras} onChange={(extras) => patch({ extras })} />
      </div>

      <div>
        <label className={labelClass}>{NEEDS_LABEL.remarks}</label>
        <textarea maxLength={2000} value={value.remarks} onChange={(e) => patch({ remarks: e.target.value })} className={areaClass} />
      </div>

      {children}

      <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-[13px] text-text-secondary">
        Estimated total: <span className="text-[15px] font-extrabold text-text">{formatPrice(daysTotal + customerNeedsAmount(value))}</span>
        <span className="ml-2 text-xs text-text-muted">(all days + additional requirement + extra items, for reference: the official quotation is made in AutoCount)</span>
      </div>
    </>
  );
}
