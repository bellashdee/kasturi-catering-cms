import { NEEDS_LABEL } from "@/lib/catering/customerNeeds";
import { REQUIREMENT_FIELDS, type ExtraItem, type RequestRequirements } from "@/lib/catering/quotationRequest";
import { formatPrice } from "@/lib/format";

type AdditionalRow = { label: string; yes: boolean; detail: string };

/**
 * "What the customer needs" as read on the quotation request page and on the event page: the same fields, in the same order
 * and with the same words as the form section (CustomerNeedsSection). A box left empty shows "—".
 */
export function CustomerNeedsView({
  requirements,
  additional,
  extras,
  kitchenSetup,
  cateringSetup,
  remarks,
}: {
  requirements: RequestRequirements;
  additional: AdditionalRow[];
  extras: ExtraItem[];
  kitchenSetup: string | null;
  cateringSetup: string | null;
  remarks: string | null;
}) {
  // the form's boxes always; the older Vegetarian / Tables and chairs boxes only when a request has them
  const written = REQUIREMENT_FIELDS.filter((f) => (f.key !== "vegetarian" && f.key !== "tableChair") || requirements[f.key]);
  const item = (label: string, value: React.ReactNode) => (
    <div key={label}>
      <dt className="text-[11.5px] font-semibold text-text-muted">{label}</dt>
      <dd className="whitespace-pre-line text-[13px] text-text">{value || "—"}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{item(NEEDS_LABEL.menuOptions, requirements.menuOptions ? String(requirements.menuOptions) : "")}</div>
        {written.map((f) => item(f.label, requirements[f.key]))}
        {item(NEEDS_LABEL.kitchenSetup, kitchenSetup)}
        {item(NEEDS_LABEL.cateringSetup, cateringSetup)}
      </dl>

      <div>
        <div className="mb-1.5 text-[11.5px] font-semibold text-text-muted">{NEEDS_LABEL.additionalView}</div>
        {additional.length === 0 ? (
          <div className="text-[13px] text-text-muted">Not answered</div>
        ) : (
          <div className="flex flex-col gap-1 text-[13px]">
            {additional.map((a) => (
              <div key={a.label} className="flex flex-wrap gap-x-2">
                <span className="w-56 font-semibold text-text">{a.label}</span>
                <span className="text-text-secondary">{a.yes ? `Yes${a.detail ? ` · ${a.detail}` : ""}` : "No"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-[11.5px] font-semibold text-text-muted">{NEEDS_LABEL.extras}</div>
        {extras.length === 0 ? (
          <div className="text-[13px] text-text">—</div>
        ) : (
          <ul className="flex flex-col gap-1 text-[13px] text-text">
            {extras.map((i, n) => (
              <li key={`${i.itemName}-${n}`}>
                {i.itemName} <span className="text-text-secondary">({i.quantity} × {formatPrice(i.unitPrice)} = {formatPrice(i.quantity * i.unitPrice)})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl>{item(NEEDS_LABEL.remarks, remarks)}</dl>
    </div>
  );
}
