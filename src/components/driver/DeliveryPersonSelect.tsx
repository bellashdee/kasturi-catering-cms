"use client";

import type { DeliveryPerson } from "@/lib/driver/deliveryPersons";

/**
 * "Driver / Delivery Person": a list-only choice of the approved internal drivers and external
 * delivery services (e.g. Lalamove). There is deliberately no free-text entry.
 */
export function DeliveryPersonSelect({
  value,
  onChange,
  persons,
  className,
  labelClassName,
  label = "Driver / Delivery Person",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Already limited to the selected company. */
  persons: DeliveryPerson[];
  className: string;
  labelClassName: string;
  label?: string;
}) {
  const drivers = persons.filter((p) => p.kind === "driver");
  const vendors = persons.filter((p) => p.kind === "vendor");

  return (
    <div>
      <label className={labelClassName}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        <option value="">Not assigned yet</option>
        {drivers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        {vendors.map((p) => <option key={p.value} value={p.value}>{p.label} (external)</option>)}
      </select>
    </div>
  );
}
