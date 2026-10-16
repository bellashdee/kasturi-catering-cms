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
  lunch: "Lunch",
  hi_tea: "Hi-Tea",
  dinner: "Dinner",
  wedding: "Wedding",
};

export const SALES_AGENTS = ["Ms. Fadilah", "Ms. Hannah", "Ms. Zainab", "Mr. Ismaizal", "Mr. Hao", "Mr. Faidz", "Mr. Mard"];

/** A multi-day event (e.g. a 3-5 day conference) is one booking with one row per day. */
export const MAX_EVENT_DAYS = 14;

export const SERVICE_TYPE_LABEL: Record<string, string> = {
  pack_food: "Pack Food",
  dome_set: "Dome Set",
  buffet: "Buffet",
  pre_plated: "Pre-Plated",
  hidang: "Hidang",
  buffet_pack: "Buffet Pack",
};
