export const EVENT_STATUS_LABEL: Record<string, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "In Production",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  wedding: "Wedding",
  corporate: "Corporate",
  birthday: "Birthday",
  funeral: "Funeral",
  other: "Other",
};

export const QUOTATION_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partially Paid",
  paid: "Paid",
};

export const STAFF_ROLE_LABEL: Record<string, string> = {
  kitchen: "Kitchen Staff",
  service: "Service Staff",
  driver: "Driver",
  other: "Other Staff",
};

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En Route",
  delivered: "Delivered",
  failed: "Failed",
};

export const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  morning_tea: "Morning Tea",
  morning_break: "Morning Break",
  brunch: "Brunch",
  lunch: "Lunch",
  afternoon_tea: "Afternoon Tea",
  tea_break: "Tea Break",
  hi_tea: "Hi-Tea",
  dinner: "Dinner",
  supper: "Supper",
  refreshment: "Refreshment",
  buffet: "Buffet",
  packed_meal: "Packed Meal",
  plated_meal: "Plated Meal",
  cocktail_reception: "Cocktail Reception",
  wedding: "Wedding",
};

/** The meal types that can be chosen, in alphabetical order. "Wedding" (chosen earlier) is no longer offered; it still shows on the bookings that have it. */
export const MEAL_TYPE_KEYS = [
  "afternoon_tea",
  "breakfast",
  "brunch",
  "buffet",
  "cocktail_reception",
  "dinner",
  "hi_tea",
  "lunch",
  "morning_break",
  "morning_tea",
  "packed_meal",
  "plated_meal",
  "refreshment",
  "supper",
  "tea_break",
];

/** The options of the meal type checkboxes: the list above, plus an old value (such as Wedding) that the booking already has. */
export function mealTypeOptions(selected: string[] = []): [string, string][] {
  const keys = [...MEAL_TYPE_KEYS, ...selected.filter((k) => !MEAL_TYPE_KEYS.includes(k) && MEAL_TYPE_LABEL[k])];
  return keys.map((k) => [k, MEAL_TYPE_LABEL[k]]);
}

export const SALES_AGENTS = ["Ms. Fadilah", "Ms. Hannah", "Ms. Zainab", "Mr. Ismaizal", "Mr. Hao", "Mr. Faidz", "Mr. Mard"];

/** A multi-day event (e.g. a 3-5 day conference) is one booking with one row per day. */
export const MAX_EVENT_DAYS = 14;

/** In alphabetical order (the order of the choice lists). */
export const SERVICE_TYPE_LABEL: Record<string, string> = {
  buffet: "Buffet",
  buffet_pack: "Buffet Pack",
  cocktail_canape: "Cocktail / Canapé",
  dome_set: "Dome Set",
  live_cooking_station: "Live Cooking Station",
  pack_food: "Pack Food",
  pre_plated: "Preplated",
  hidang: "Serve",
};
