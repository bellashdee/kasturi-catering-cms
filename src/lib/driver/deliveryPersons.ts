/**
 * The "Driver / Delivery Person" choices for a delivery: internal drivers (staff records)
 * and external delivery services such as Lalamove (vendor records). Chosen from a list only.
 */
export type DeliveryPerson = {
  /** "driver:<employeeId>" or "vendor:<vendorId>" - what the select holds. */
  value: string;
  label: string;
  companyId: string;
  kind: "driver" | "vendor";
};

export function encodeAssignee(driverId?: string | null, vendorId?: string | null): string {
  if (driverId) return `driver:${driverId}`;
  if (vendorId) return `vendor:${vendorId}`;
  return "";
}

export function decodeAssignee(value: string): { driverId?: string; vendorId?: string } {
  if (value.startsWith("driver:")) return { driverId: value.slice("driver:".length) };
  if (value.startsWith("vendor:")) return { vendorId: value.slice("vendor:".length) };
  return {};
}
