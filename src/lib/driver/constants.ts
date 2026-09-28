export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  on_delivery: "On Delivery",
  off_duty: "Off Duty",
  on_leave: "On Leave",
};

export const VEHICLE_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  maintenance: "In Maintenance",
  inactive: "Inactive",
  retired: "Retired",
};

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  mileage: "Mileage",
  fuel: "Fuel",
  toll: "Toll",
  parking: "Parking",
  other: "Other",
};

export function isExpiringSoon(date: string | null, withinDays = 30): boolean {
  if (!date) return false;
  const target = new Date(date).getTime();
  const now = Date.now();
  const window = withinDays * 24 * 60 * 60 * 1000;
  return target - now <= window;
}
