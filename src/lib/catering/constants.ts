export const EVENT_STATUS_LABEL: Record<string, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "In Production",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** The event types that can be chosen, in alphabetical order ("Other" last). */
export const EVENT_TYPE_OPTIONS: [string, string][] = [
  ["aidilfitri_gathering", "Aidilfitri Gathering"],
  ["annual_dinner", "Annual Dinner"],
  ["appreciation_dinner", "Appreciation Dinner"],
  ["award_ceremony", "Award Ceremony"],
  ["birthday_party", "Birthday Party"],
  ["business_dinner", "Business Dinner"],
  ["business_luncheon", "Business Luncheon"],
  ["charity_event", "Charity Event"],
  ["community_event", "Community Event"],
  ["company_anniversary", "Company Anniversary"],
  ["conference", "Conference"],
  ["corporate_event", "Corporate Event"],
  ["corporate_meeting", "Corporate Meeting"],
  ["cultural_celebration", "Cultural Celebration"],
  ["customer_appreciation_event", "Customer Appreciation Event"],
  ["engagement_ceremony", "Engagement Ceremony"],
  ["exhibition", "Exhibition"],
  ["family_day", "Family Day"],
  ["farewell_party", "Farewell Party"],
  ["fundraising_event", "Fundraising Event"],
  ["gala_dinner", "Gala Dinner"],
  ["government_event", "Government Event"],
  ["graduation_ceremony", "Graduation Ceremony"],
  ["grand_opening", "Grand Opening"],
  ["housewarming", "Housewarming"],
  ["majlis_akikah", "Majlis Akikah"],
  ["majlis_berkhatan", "Majlis Berkhatan"],
  ["majlis_doa_selamat", "Majlis Doa Selamat"],
  ["majlis_kesyukuran", "Majlis Kesyukuran"],
  ["majlis_perkahwinan", "Majlis Perkahwinan"],
  ["majlis_pertunangan", "Majlis Pertunangan"],
  ["official_ceremony", "Official Ceremony"],
  ["open_house", "Open House"],
  ["press_conference", "Press Conference"],
  ["product_launch", "Product Launch"],
  ["ramadan_iftar", "Ramadan Iftar"],
  ["religious_gathering", "Religious Gathering"],
  ["retirement_party", "Retirement Party"],
  ["roadshow", "Roadshow"],
  ["school_event", "School Event"],
  ["seminar", "Seminar"],
  ["sports_event", "Sports Event"],
  ["staff_appreciation_event", "Staff Appreciation Event"],
  ["team_building", "Team Building"],
  ["training", "Training"],
  ["university_event", "University Event"],
  ["vip_reception", "VIP Reception"],
  ["wedding_reception", "Wedding Reception"],
  ["workshop", "Workshop"],
  ["other", "Other"],
];

/** Event types chosen before the new list: no longer offered, still shown on the bookings that have them. */
const LEGACY_EVENT_TYPE_LABEL: Record<string, string> = {
  wedding: "Wedding",
  corporate: "Corporate",
  birthday: "Birthday",
  funeral: "Funeral",
};

export const EVENT_TYPE_LABEL: Record<string, string> = { ...LEGACY_EVENT_TYPE_LABEL, ...Object.fromEntries(EVENT_TYPE_OPTIONS) };

/** The options of an event type choice: the list above, plus an old value the booking already has. */
export function eventTypeOptions(selected?: string): [string, string][] {
  return selected && !EVENT_TYPE_OPTIONS.some(([k]) => k === selected) && LEGACY_EVENT_TYPE_LABEL[selected] ? [...EVENT_TYPE_OPTIONS, [selected, LEGACY_EVENT_TYPE_LABEL[selected]]] : EVENT_TYPE_OPTIONS;
}

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

/** The meal types that can be chosen, in alphabetical order. "Wedding", "Packed Meal", "Plated Meal" and "Supper" are no longer offered; they still show on a booking that has them. */
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
  "refreshment",
  "tea_break",
];

/** The options of the meal type checkboxes: the list above, plus an old value (such as Wedding) that the booking already has. */
export function mealTypeOptions(selected: string[] = []): [string, string][] {
  const keys = [...MEAL_TYPE_KEYS, ...selected.filter((k) => !MEAL_TYPE_KEYS.includes(k) && MEAL_TYPE_LABEL[k])];
  return keys.map((k) => [k, MEAL_TYPE_LABEL[k]]);
}

/** Every sales agent who has had events (old events keep their agent, and the reports can still filter by them). */
export const SALES_AGENTS = ["Ms. Fadilah", "Ms. Hannah", "Ms. Zainab", "Mr. Ismaizal", "Mr. Hao", "Mr. Faidz", "Mr. Mard"];
/** Agents who have left: not offered on the forms any more (Mr. Mard left in November 2026). */
export const FORMER_SALES_AGENTS = ["Mr. Mard"];
/** The agents offered when choosing a name on a form or a new booking. */
export const ACTIVE_SALES_AGENTS = SALES_AGENTS.filter((a) => !FORMER_SALES_AGENTS.includes(a));

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
