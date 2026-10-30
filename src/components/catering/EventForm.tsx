"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent, createQuotation, updateEvent, type EventInput } from "@/lib/catering/actions";
import { SALES_AGENTS, eventTypeOptions } from "@/lib/catering/constants";
import { dayAmount, dayPax, quotationSeedRows, type EventDay } from "@/lib/catering/days";
import { additionalServiceLines, noAdditionalServices, withSecondMenusInRemarks, type AdditionalServices } from "@/lib/catering/quotationRequest";
import { hasPackagePrice } from "@/lib/kitchen/packages/format";
import { EventDaysEditor, emptyDay } from "@/components/catering/EventDaysEditor";
import { AdditionalServicesEditor, ExtraItemsEditor, type ExtraRow } from "@/components/catering/QuotationRequestExtras";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";
import { Select } from "@/components/ui/Select";
import { formatPrice } from "@/lib/format";

type Company = { id: string; name: string };
type Customer = { id: string; name: string; company_id: string };
type PackageMenuItem = { meal_type: string; item_name: string; sort_order: number };
type PackageMenu = { id: string; name: string; price_per_pax: number; minimum_pax: number; company_id: string; package_menu_items: PackageMenuItem[] };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const areaClass =
  "mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

const AGENT_OPTIONS = [{ value: "", label: "None" }, ...SALES_AGENTS.map((a) => ({ value: a, label: a }))];

/** The menu a package gives a day: the package name, then one menu item on each line. */
function packageMenuText(pkg: PackageMenu): string {
  return [pkg.name, ...[...pkg.package_menu_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => i.item_name)].join("\n");
}

/** A single-day event is shown as one day block, the same as on the Quotation Request Form. */
function dayFromEvent(initial: Partial<EventInput> | undefined): EventDay {
  return {
    dayDate: initial?.eventDate ?? "",
    setupTime: initial?.setupTime,
    eventTime: initial?.eventTime,
    mealTypes: initial?.mealTypes ?? [],
    serviceType: initial?.serviceType ?? "",
    servicePax: initial?.servicePax,
    secondServiceType: initial?.secondServiceType || undefined,
    secondServicePax: initial?.secondServicePax,
    menuDetails: initial?.menuDescription,
    pricePerPax: initial?.pricePerPax,
  };
}

export function EventForm({
  companies,
  defaultCompanyId,
  customers,
  packageMenus = [],
  eventId,
  initial,
  initialDays = [],
}: {
  companies: Company[];
  defaultCompanyId?: string;
  customers: Customer[];
  packageMenus?: PackageMenu[];
  eventId?: string;
  initial?: Partial<EventInput>;
  initialDays?: EventDay[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<EventDay[]>(initialDays.length > 0 ? initialDays : eventId ? [dayFromEvent(initial)] : [emptyDay()]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [additional, setAdditional] = useState<AdditionalServices>(noAdditionalServices());
  const [form, setForm] = useState<EventInput>({
    companyId: initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "",
    customerId: initial?.customerId,
    eventName: initial?.eventName ?? "",
    eventDate: initial?.eventDate ?? "",
    location: initial?.location ?? "",
    eventType: initial?.eventType ?? "corporate_event",
    packageMenuId: initial?.packageMenuId,
    specialRequirements: initial?.specialRequirements ?? "",
    eventDetails: initial?.eventDetails ?? "",
    remarks: initial?.remarks ?? "",
    picName: initial?.picName ?? "",
    picPhone: initial?.picPhone ?? "",
    salesAgent: initial?.salesAgent ?? "",
    kitchenSetup: initial?.kitchenSetup ?? "",
    cateringSetup: initial?.cateringSetup ?? "",
    status: initial?.status ?? "enquiry",
  });

  const customersForCompany = customers.filter((c) => c.company_id === form.companyId);
  const packagesForCompany = packageMenus.filter((p) => p.company_id === form.companyId);
  const singleDay = days.length === 1;

  function set<K extends keyof EventInput>(key: K, value: EventInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPackageChange(packageId: string) {
    set("packageMenuId", packageId || undefined);
    const pkg = packagesForCompany.find((p) => p.id === packageId);
    if (pkg) {
      setDays((d) => [{ ...d[0], menuDetails: packageMenuText(pkg), ...(hasPackagePrice(pkg.price_per_pax) ? { pricePerPax: pkg.price_per_pax } : {}) }]);
    }
  }

  const extraLines = extras
    .map((r) => ({ itemName: r.itemName.trim(), quantity: Number(r.quantity) || 0, unitPrice: Number(r.unitPrice) || 0 }))
    .filter((r) => r.itemName && r.quantity > 0);
  const additionalLines = eventId ? [] : additionalServiceLines(additional);
  const estimatedTotal =
    days.reduce((t, d) => t + dayAmount(d), 0) + [...additionalLines, ...extraLines].reduce((t, i) => t + i.quantity * i.unitPrice, 0);

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
      const only = singleDay ? days[0] : null;
      const payload: EventInput = only
        ? {
            ...form,
            eventDate: only.dayDate,
            eventTime: only.eventTime,
            setupTime: only.setupTime,
            paxCount: dayPax(only),
            mealTypes: only.mealTypes,
            serviceType: only.serviceType,
            servicePax: only.servicePax,
            secondServiceType: only.secondServiceType,
            secondServicePax: only.secondServicePax,
            pricePerPax: only.pricePerPax,
            menuDescription: only.menuDetails,
            remarks: [withSecondMenusInRemarks(only).remarks, form.remarks].filter(Boolean).join("\n\n"),
            days: [],
          }
        : { ...form, eventDate: days[0].dayDate, packageMenuId: undefined, menuDescription: "", days: days.map(withSecondMenusInRemarks) };

      if (eventId) {
        await updateEvent(eventId, payload);
        router.push(`/catering/${eventId}`);
      } else {
        const created = await createEvent(payload);
        // the priced days, the additional requirement and the extra items become a draft quotation, as when a quotation request is approved
        const lines = [
          ...quotationSeedRows(singleDay ? [] : days, {
            eventName: form.eventName,
            pax: only ? dayPax(only) : null,
            pricePerPax: only?.pricePerPax ?? null,
          }),
          ...additionalLines,
          ...extraLines,
        ];
        if (lines.some((l) => l.unitPrice > 0)) {
          await createQuotation({
            companyId: form.companyId,
            eventId: created.id,
            quotationNumber: `Q-${Date.now().toString().slice(-6)}`,
            items: lines.map((l) => ({ ...l, discountPercent: 0 })),
          });
        }
        router.push(`/catering/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company *</label>
          <Select
            required
            value={form.companyId}
            onChange={(e) => {
              set("companyId", e.target.value);
              set("customerId", undefined);
              set("packageMenuId", undefined);
            }}
            className={inputClass}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Customer / company name</label>
          <Select value={form.customerId ?? ""} onChange={(e) => set("customerId", e.target.value || undefined)} className={inputClass}>
            <option value="">Not linked yet</option>
            {customersForCompany.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </div>

      <div className={`grid gap-4 ${eventId ? "grid-cols-1" : "grid-cols-2"}`}>
        <div>
          <label className={labelClass}>Sales agent</label>
          <ChoiceSelect value={form.salesAgent ?? ""} onChange={(v) => set("salesAgent", v)} options={AGENT_OPTIONS} placeholder="Search and choose the sales agent" className={inputClass} />
        </div>
        {!eventId && (
          <div>
            <label className={labelClass}>Status</label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
              <option value="enquiry">Enquiry</option>
              <option value="quoted">Quoted</option>
              <option value="confirmed">Confirmed</option>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div>
          <label className={labelClass}>Event name *</label>
          <input required value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className={inputClass} placeholder="e.g. Annual Conference 2026" />
        </div>
        <div>
          <label className={labelClass}>Event type *</label>
          <ChoiceSelect
            required
            value={form.eventType}
            onChange={(v) => set("eventType", v)}
            options={eventTypeOptions(form.eventType).map(([value, label]) => ({ value, label }))}
            placeholder="Search and choose the event type"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Event location</label>
        <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder="Venue / address" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>PIC</label>
          <input value={form.picName} onChange={(e) => set("picName", e.target.value)} className={inputClass} placeholder="Person in charge" />
        </div>
        <div>
          <label className={labelClass}>PIC contact no.</label>
          <input type="tel" inputMode="tel" value={form.picPhone} onChange={(e) => set("picPhone", e.target.value)} className={inputClass} placeholder="e.g. 012-3456789" />
        </div>
      </div>

      <div>
        <div className="text-[14px] font-extrabold text-text">Event days</div>
        <p className="mb-2 text-xs text-text-muted">One block for each day of the event (1 day, or 3-5 days for a conference). Use &quot;Add next day&quot; to copy the previous day.</p>
        {singleDay && packagesForCompany.length > 0 && (
          <div className="mb-3">
            <label className={labelClass}>Select Package (optional)</label>
            <Select value={form.packageMenuId ?? ""} onChange={(e) => onPackageChange(e.target.value)} className={inputClass}>
              <option value="">No package — type menu manually</option>
              {packagesForCompany.map((p) => <option key={p.id} value={p.id}>{p.name}{hasPackagePrice(p.price_per_pax) ? ` (RM${p.price_per_pax}/pax)` : ""}</option>)}
            </Select>
            <p className="mt-1 text-xs text-text-muted">Fills the menu and the price per pax of the day — review and edit before saving. This does not automatically create a production order or purchase request.</p>
          </div>
        )}
        {/* the same day block as the Quotation Request Form; the second service type only shows for an older event that has one */}
        <EventDaysEditor days={days} onChange={setDays} secondService={days.some((d) => !!d.secondServiceType)} secondChoice mealRequired />
      </div>

      {!eventId && (
        <>
          <div>
            <div className="text-[14px] font-extrabold text-text">Additional requirement</div>
            <p className="mb-2 text-xs text-text-muted">Search and choose for each one: Yes (add the price if you know it), No, or Included in the food price. Each Yes is added to the draft quotation; Included means it is already in the price of the food.</p>
            <AdditionalServicesEditor value={additional} onChange={setAdditional} />
          </div>

          <div>
            <div className="text-[14px] font-extrabold text-text">Other extra items (optional)</div>
            <p className="mb-2 text-xs text-text-muted">Anything else to quote, e.g. equipment hire, service charge.</p>
            <ExtraItemsEditor rows={extras} onChange={setExtras} />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Kitchen set-up</label>
          <textarea value={form.kitchenSetup} onChange={(e) => set("kitchenSetup", e.target.value)} className={areaClass} placeholder="What the kitchen must prepare / set up" />
        </div>
        <div>
          <label className={labelClass}>Catering set-up</label>
          <textarea value={form.cateringSetup} onChange={(e) => set("cateringSetup", e.target.value)} className={areaClass} placeholder="Tables, buffet line, equipment, staff on site" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Remarks</label>
        <textarea value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={areaClass} placeholder="Any other note" />
      </div>

      {/* these two are not on the Quotation Request Form: shown only when an event being edited already has them */}
      {eventId && initial?.eventDetails && (
        <div>
          <label className={labelClass}>Event details</label>
          <textarea value={form.eventDetails} onChange={(e) => set("eventDetails", e.target.value)} className={areaClass} placeholder="Programme, timing, setup, contact person on the day, etc." />
        </div>
      )}
      {eventId && initial?.specialRequirements && (
        <div>
          <label className={labelClass}>Special Requirements</label>
          <textarea value={form.specialRequirements} onChange={(e) => set("specialRequirements", e.target.value)} className={areaClass} placeholder="Dietary restrictions, setup needs, etc." />
        </div>
      )}

      {!eventId && (
        <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-[13px] text-text-secondary">
          Estimated total: <span className="text-[15px] font-extrabold text-text">{formatPrice(estimatedTotal)}</span>
          <span className="ml-2 text-xs text-text-muted">(all days + additional requirement + extra items; a draft quotation is made from the priced lines)</span>
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : eventId ? "Save Changes" : "Create Event"}
        </button>
      </div>
    </form>
  );
}
