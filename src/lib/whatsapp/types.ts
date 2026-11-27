/**
 * WhatsApp Message Import (Signature Solution): what the AI reads from a message from the Boss and what the Admin edits before
 * submitting. Nothing is invented: a value that is not in the message stays empty (null) and is shown as Pending / Not Provided.
 */

export type WaCategory = "quotation" | "jdt_match" | "snack";

export const WA_CATEGORY_LABEL: Record<WaCategory, string> = {
  quotation: "A. Catering / Event Quotation Request",
  jdt_match: "B. JDT Match Schedule / Date Only",
  snack: "C. JDT Training Snack / Purchasing Request",
};

/** A date as read from the message: the date the system uses, what was written, and whether the year / weekday were written. */
export type WaDate = {
  /** YYYY-MM-DD, or "" when the message gives no date */
  date: string;
  /** as written, e.g. "26 Nov 2026 (Khamis)" */
  text: string | null;
  /** false: the year was not in the message (the date needs checking) */
  yearStated: boolean;
  /** the weekday written in the message, e.g. "Khamis" / "Sat" */
  weekdayStated: string | null;
};

export type PaxLine = { category: string; pax: number | null };

export type WaSession = {
  /** e.g. "Packfood", "VIP – Halftime" */
  name: string;
  mealTypes: string[];
  /** a service type key (pack_food, buffet ...) or "" */
  serviceType: string;
  menu: string;
  /** "HH:MM" or "" */
  mealTime: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryLocation: string;
  deliveryInstructions: string;
  specialInstructions: string;
  /** a total pax written in the message without a breakdown */
  paxStated: number | null;
  breakdown: PaxLine[];
};

export type WaQuotationDay = WaDate & { sessions: WaSession[] };

export type WaQuotation = {
  customerName: string;
  eventName: string;
  /** event category key (football_jdt, corporate_event ...) */
  eventType: string;
  venue: string;
  matchDetails: string;
  /** "HH:MM" or "" */
  kickOff: string;
  eventTime: string;
  budget: string;
  specialInstructions: string;
  days: WaQuotationDay[];
};

export type WaMatch = WaDate & {
  matchDetails: string;
  competition: string;
  /** "home" | "away" | "" */
  homeAway: string;
  venue: string;
  kickOff: string;
  remarks: string;
  /** set by the Admin: save even if a JDT event is already on that date */
  saveAnyway?: boolean;
};

export const SNACK_UNITS = ["kg", "box", "carton", "pack", "pcs", "packet", "bundle", "bottle", "tray", "dozen"] as const;

export type SnackItem = { name: string; quantity: number | null; unit: string; remarks: string };

export type WaSnack = WaDate & {
  team: string;
  deliveryTime: string;
  deliveryLocation: string;
  remarks: string;
  items: SnackItem[];
};

export type WaResult = {
  category: WaCategory;
  /** why the AI chose the category (one short line) */
  reason: string;
  quotation: WaQuotation;
  matches: WaMatch[];
  snack: WaSnack;
  /** things the AI was not sure about, in its own words */
  uncertain: string[];
};

export const emptySession = (): WaSession => ({
  name: "",
  mealTypes: [],
  serviceType: "",
  menu: "",
  mealTime: "",
  deliveryDate: "",
  deliveryTime: "",
  deliveryLocation: "",
  deliveryInstructions: "",
  specialInstructions: "",
  paxStated: null,
  breakdown: [],
});

export const emptyDate = (): WaDate => ({ date: "", text: null, yearStated: true, weekdayStated: null });

export const emptyResult = (category: WaCategory = "quotation"): WaResult => ({
  category,
  reason: "",
  quotation: {
    customerName: "JDT FC SDN. BHD.",
    eventName: "",
    eventType: "football_jdt",
    venue: "",
    matchDetails: "",
    kickOff: "",
    eventTime: "",
    budget: "",
    specialInstructions: "",
    days: [{ ...emptyDate(), sessions: [emptySession()] }],
  },
  matches: [],
  snack: { ...emptyDate(), team: "JDT II", deliveryTime: "", deliveryLocation: "", remarks: "", items: [] },
  uncertain: [],
});

/** The pax of a session: the sum of its breakdown, or the total written in the message; null when neither is known. */
export function sessionPax(s: WaSession): number | null {
  const known = s.breakdown.filter((l) => typeof l.pax === "number" && l.pax > 0);
  if (known.length > 0) return known.reduce((t, l) => t + (l.pax as number), 0);
  return s.paxStated && s.paxStated > 0 ? s.paxStated : null;
}
