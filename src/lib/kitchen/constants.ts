export const PRODUCTION_STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
};

export const PRODUCTION_STATUS_ORDER = ["planned", "preparing", "ready", "completed"] as const;

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  in: "Stock In",
  out: "Stock Used",
  adjustment: "Adjustment",
  wastage: "Wastage",
};

export const MENU_CATEGORY_LABEL: Record<string, string> = {
  appetizer: "Appetizer",
  main: "Main",
  side: "Side",
  dessert: "Dessert",
  beverage: "Beverage",
  other: "Other",
};

export const PURCHASE_REQUEST_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  ordered: "Ordered",
  completed: "Completed",
  rejected: "Rejected",
};

export const PACKAGE_MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  hitea: "Hi-Tea",
  coffee_break: "Coffee Break",
  other: "Other",
};

export function isLowStock(current: number, reorderLevel: number): boolean {
  return current <= reorderLevel;
}

/** Units available when entering recipe quantities and ingredient units. */
export const UNIT_OPTIONS = ["KG", "G", "L", "ML", "NOS", "TB", "PKT", "BTL", "CN"] as const;

/** Maps a stored unit to its standard spelling (e.g. "kg" becomes "KG"); other units are returned unchanged. */
export function normalizeUnit(unit: string | null | undefined): string {
  const trimmed = (unit ?? "").trim();
  if (!trimmed) return "";
  const match = UNIT_OPTIONS.find((u) => u.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

/** The standard units, plus the current value when it is not one of them, so existing data is never hidden. */
export function unitChoices(current: string | null | undefined): string[] {
  const value = normalizeUnit(current);
  return value && !(UNIT_OPTIONS as readonly string[]).includes(value) ? [...UNIT_OPTIONS, value] : [...UNIT_OPTIONS];
}
