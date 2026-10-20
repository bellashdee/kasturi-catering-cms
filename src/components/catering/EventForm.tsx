"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent, updateEvent, type EventInput } from "@/lib/catering/actions";
import { SALES_AGENTS, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { MealTypeSelect } from "@/components/catering/MealTypeSelect";
import type { EventDay } from "@/lib/catering/days";
import { hasPackagePrice } from "@/lib/kitchen/packages/format";
import { EventDaysEditor, emptyDay } from "@/components/catering/EventDaysEditor";

type Company = { id: string; name: string };
type Customer = { id: string; name: string; company_id: string };
type PackageMenuItem = { meal_type: string; item_name: string; sort_order: number };
type PackageMenu = { id: string; name: string; price_per_pax: number; minimum_pax: number; company_id: string; package_menu_items: PackageMenuItem[] };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function packageItemsToText(pkg: PackageMenu): string {
  return [...pkg.package_menu_items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => `- ${i.item_name}`)
    .join("\n");
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
  const [multiDay, setMultiDay] = useState(initialDays.length > 0);
  const [days, setDays] = useState<EventDay[]>(initialDays);
  const [form, setForm] = useState<EventInput>({
    companyId: initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "",
    customerId: initial?.customerId,
    eventName: initial?.eventName ?? "",
    eventDate: initial?.eventDate ?? "",
    eventTime: initial?.eventTime ?? "",
    location: initial?.location ?? "",
    paxCount: initial?.paxCount,
    eventType: initial?.eventType ?? "corporate",
    packageMenuId: initial?.packageMenuId,
    menuDescription: initial?.menuDescription ?? "",
    specialRequirements: initial?.specialRequirements ?? "",
    mealTypes: initial?.mealTypes ?? [],
    serviceType: initial?.serviceType ?? "",
    servicePax: initial?.servicePax,
    secondServiceType: initial?.secondServiceType ?? "",
    secondServicePax: initial?.secondServicePax,
    eventDetails: initial?.eventDetails ?? "",
    remarks: initial?.remarks ?? "",
    setupTime: initial?.setupTime ?? "",
    picName: initial?.picName ?? "",
    picPhone: initial?.picPhone ?? "",
    salesAgent: initial?.salesAgent ?? "",
    kitchenSetup: initial?.kitchenSetup ?? "",
    cateringSetup: initial?.cateringSetup ?? "",
    pricePerPax: initial?.pricePerPax,
    status: initial?.status ?? "enquiry",
  });

  const customersForCompany = customers.filter((c) => c.company_id === form.companyId);
  const packagesForCompany = packageMenus.filter((p) => p.company_id === form.companyId);

  function onPackageChange(packageId: string) {
    set("packageMenuId", packageId || undefined);
    const pkg = packagesForCompany.find((p) => p.id === packageId);
    if (pkg) {
      if (hasPackagePrice(pkg.price_per_pax)) set("pricePerPax", pkg.price_per_pax);
      set("menuDescription", `${pkg.name} (${hasPackagePrice(pkg.price_per_pax) ? `RM${pkg.price_per_pax}/pax, ` : ""}min ${pkg.minimum_pax} pax):\n${packageItemsToText(pkg)}`);
    }
  }

  function set<K extends keyof EventInput>(key: K, value: EventInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const servicePaxTotal = (form.servicePax ?? 0) + (form.secondServiceType ? form.secondServicePax ?? 0 : 0);

  function toggleMeal(key: string) {
    const current = form.mealTypes ?? [];
    set("mealTypes", current.includes(key) ? current.filter((m) => m !== key) : [...current, key]);
  }

  function switchMultiDay(on: boolean) {
    if (on && days.length === 0) {
      // day 1 starts from what is already typed for the single-day event
      setDays([
        {
          ...emptyDay(form.eventDate),
          setupTime: form.setupTime,
          eventTime: form.eventTime,
          mealTypes: form.mealTypes ?? [],
          serviceType: form.serviceType ?? "",
          servicePax: form.servicePax,
          secondServiceType: form.secondServiceType,
          secondServicePax: form.secondServicePax,
          menuDetails: form.menuDescription,
          pricePerPax: form.pricePerPax,
        },
      ]);
    }
    setMultiDay(on);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: EventInput = multiDay ? { ...form, days, packageMenuId: undefined, menuDescription: "" } : { ...form, days: [] };
      if (eventId) {
        await updateEvent(eventId, payload);
        router.push(`/catering/${eventId}`);
      } else {
        const created = await createEvent(payload);
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
          <select
            required
            value={form.companyId}
            onChange={(e) => {
              set("companyId", e.target.value);
              set("customerId", undefined);
            }}
            className={inputClass}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Customer</label>
          <select value={form.customerId ?? ""} onChange={(e) => set("customerId", e.target.value || undefined)} className={inputClass}>
            <option value="">Not linked yet</option>
            {customersForCompany.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Event Name *</label>
        <input required value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className={inputClass} placeholder="e.g. Menara Corp Annual Dinner" />
      </div>

      <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${multiDay ? "border-primary bg-info-bg" : "border-border-strong"}`}>
        <input type="checkbox" checked={multiDay} onChange={(e) => switchMultiDay(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" />
        <span>
          <span className="block text-[13px] font-bold text-text">Multi-day event (2 or more days)</span>
          <span className="block text-xs text-text-muted">One event and one quotation, with a block for each day: date, set-up and event time, meal and service type, menu, price and pax.</span>
        </span>
      </label>

      {!multiDay && (
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Event date *</label>
            <input type="date" required value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Set-up time (kitchen side) *</label>
            <input type="time" required value={form.setupTime} onChange={(e) => set("setupTime", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Event time *</label>
            <input type="time" required value={form.eventTime} onChange={(e) => set("eventTime", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Total pax</label>
            <input type="number" min="0" value={form.paxCount ?? ""} onChange={(e) => set("paxCount", e.target.value ? Number(e.target.value) : undefined)} className={inputClass} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Location</label>
          <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder="Venue / address" />
        </div>
        <div>
          <label className={labelClass}>Event Type</label>
          <select value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className={inputClass}>
            <option value="wedding">Wedding</option>
            <option value="corporate">Corporate</option>
            <option value="birthday">Birthday</option>
            <option value="funeral">Funeral</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>PIC</label>
          <input value={form.picName} onChange={(e) => set("picName", e.target.value)} className={inputClass} placeholder="Person in charge" />
        </div>
        <div>
          <label className={labelClass}>PIC contact no.</label>
          <input value={form.picPhone} onChange={(e) => set("picPhone", e.target.value)} className={inputClass} placeholder="e.g. 012-3456789" />
        </div>
        <div>
          <label className={labelClass}>Sales agent</label>
          <select value={form.salesAgent ?? ""} onChange={(e) => set("salesAgent", e.target.value)} className={inputClass}>
            <option value="">Select sales agent</option>
            {SALES_AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {multiDay && <EventDaysEditor days={days} onChange={setDays} />}

      {!multiDay && (
      <>
      <div>
        <label className={labelClass}>Meal type</label>
        <MealTypeSelect value={form.mealTypes ?? []} onToggle={toggleMeal} />
        <p className="mt-1 text-xs text-text-muted">Select every meal this event serves.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Service type *</label>
          <select
            required
            value={form.serviceType ?? ""}
            onChange={(e) => {
              set("serviceType", e.target.value);
              if (!e.target.value) set("servicePax", undefined);
              if (e.target.value && e.target.value === form.secondServiceType) {
                set("secondServiceType", "");
                set("secondServicePax", undefined);
              }
            }}
            className={inputClass}
          >
            <option value="">Select service type</option>
            {Object.entries(SERVICE_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label className={`${labelClass} mt-3 block`}>Pax for this service *</label>
          <input
            type="number"
            min="1"
            required={!!form.serviceType}
            disabled={!form.serviceType}
            value={form.servicePax ?? ""}
            onChange={(e) => set("servicePax", e.target.value ? Number(e.target.value) : undefined)}
            className={inputClass}
            placeholder="e.g. 60"
          />
        </div>
        <div>
          <label className={labelClass}>Second service type (optional)</label>
          <select
            value={form.secondServiceType ?? ""}
            onChange={(e) => {
              set("secondServiceType", e.target.value);
              if (!e.target.value) set("secondServicePax", undefined);
            }}
            disabled={!form.serviceType}
            className={inputClass}
          >
            <option value="">None</option>
            {Object.entries(SERVICE_TYPE_LABEL).filter(([key]) => key !== form.serviceType).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label className={`${labelClass} mt-3 block`}>Pax for this service{form.secondServiceType ? " *" : ""}</label>
          <input
            type="number"
            min="1"
            required={!!form.secondServiceType}
            disabled={!form.secondServiceType}
            value={form.secondServicePax ?? ""}
            onChange={(e) => set("secondServicePax", e.target.value ? Number(e.target.value) : undefined)}
            className={inputClass}
            placeholder="e.g. 20"
          />
        </div>
      </div>
      {servicePaxTotal > 0 && (
        <p className={`-mt-2 text-xs ${form.paxCount && form.paxCount !== servicePaxTotal ? "font-semibold text-warning" : "text-text-muted"}`}>
          Service pax total: {servicePaxTotal}
          {form.paxCount && form.paxCount !== servicePaxTotal ? ` — differs from the event Pax (${form.paxCount}). Check the numbers.` : form.paxCount ? " — matches the event Pax." : ""}
        </p>
      )}
      </>
      )}

      {!eventId && (
        <div>
          <label className={labelClass}>Status</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
            <option value="enquiry">Enquiry</option>
            <option value="quoted">Quoted</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
      )}

      {!multiDay && packagesForCompany.length > 0 && (
        <div>
          <label className={labelClass}>Select Package (optional)</label>
          <select value={form.packageMenuId ?? ""} onChange={(e) => onPackageChange(e.target.value)} className={inputClass}>
            <option value="">No package — type menu manually</option>
            {packagesForCompany.map((p) => <option key={p.id} value={p.id}>{p.name}{hasPackagePrice(p.price_per_pax) ? ` (RM${p.price_per_pax}/pax)` : ""}</option>)}
          </select>
        </div>
      )}

      {!multiDay && (
      <div className="grid grid-cols-[1fr_3fr] gap-4">
        <div>
          <label className={labelClass}>Price per pax (RM)</label>
          <input type="number" min="0" step="0.01" value={form.pricePerPax ?? ""} onChange={(e) => set("pricePerPax", e.target.value ? Number(e.target.value) : undefined)} className={inputClass} placeholder="e.g. 35.00" />
          <p className="mt-1 text-xs text-text-muted">Used to fill the quotation.</p>
        </div>
        <div>
        <label className={labelClass}>Menu details</label>
        <textarea value={form.menuDescription} onChange={(e) => set("menuDescription", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="Menu items or package name" />
        <p className="mt-1 text-xs text-text-muted">
          Selecting a package above fills this in — review and edit before saving. This does not automatically create a production order or purchase request.
        </p>
        </div>
      </div>
      )}

      <div>
        <label className={labelClass}>Event details</label>
        <textarea value={form.eventDetails} onChange={(e) => set("eventDetails", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="Programme, timing, setup, contact person on the day, etc." />
      </div>

      <div>
        <label className={labelClass}>Special Requirements</label>
        <textarea value={form.specialRequirements} onChange={(e) => set("specialRequirements", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="Dietary restrictions, setup needs, etc." />
      </div>

      <div>
        <label className={labelClass}>Remarks</label>
        <textarea value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="Any other note" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Kitchen set-up</label>
          <textarea value={form.kitchenSetup} onChange={(e) => set("kitchenSetup", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="What the kitchen must prepare / set up" />
        </div>
        <div>
          <label className={labelClass}>Catering set-up</label>
          <textarea value={form.cateringSetup} onChange={(e) => set("cateringSetup", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="Tables, buffet line, equipment, staff on site" />
        </div>
      </div>

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
