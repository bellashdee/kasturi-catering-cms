export const PRODUCTION_STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

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
  pending: "Pending",
  ordered: "Ordered",
  received: "Received",
  cancelled: "Cancelled",
};

export function isLowStock(current: number, reorderLevel: number): boolean {
  return current <= reorderLevel;
}
