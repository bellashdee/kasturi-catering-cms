export const PURCHASE_ITEM_STATUSES = ["pending", "ordered", "purchased", "received"];

export const PURCHASE_ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  ordered: "Ordered",
  purchased: "Purchased",
  received: "Received",
};

export const MEAL_SESSIONS = ["breakfast", "lunch", "hi_tea", "dinner", "other"];

export const MEAL_SESSION_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  hi_tea: "Hi-Tea",
  dinner: "Dinner",
  other: "Other",
};

export const STOCK_STATUS_LABEL: Record<string, string> = {
  not_checked: "Not Checked",
  checked: "Checked",
};
