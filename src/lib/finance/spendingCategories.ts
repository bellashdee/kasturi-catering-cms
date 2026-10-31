/**
 * The categories of what the companies spend on, for a catering business and its daily food supply: one list, in capitals and in
 * alphabetical order, used by the Petty Cash, My Claims and the Company Expenses, so every report adds the same things together.
 * Some names have a comma in them ("FOOD PASTE, SAUCES & SEASONINGS"): a record with several categories keeps them apart with " | ".
 */
export const SPENDING_CATEGORIES = [
  "BAKERY & BREAD",
  "BEEF & MEAT",
  "BEVERAGES & BAR ITEMS",
  "CHARCOAL & GAS",
  "CHICKEN",
  "CLEANING & SANITATION SUPPLIES",
  "DAIRY & FROZEN PRODUCTS",
  "DRY GOODS & GROCERIES",
  "EGGS",
  "EQUIPMENT, KITCHEN SUPPLIES & MAINTENANCE",
  "FISH",
  "FOOD PASTE, SAUCES & SEASONINGS",
  "FRUITS",
  "FUEL / PETROL",
  "ICE",
  "INTERNET & TELECOMMUNICATION",
  "LICENSES, PERMITS & CERTIFICATIONS",
  "MARKETING & ADVERTISING",
  "MISCELLANEOUS",
  "PACKAGING & DISPOSABLE ITEMS",
  "PROFESSIONAL & CONSULTANCY FEES",
  "RENTAL",
  "REPAIRS & RENOVATION",
  "RICE",
  "SEAFOOD",
  "SOFTWARE & SUBSCRIPTION",
  "STAFF MEALS & REFRESHMENTS",
  "STAFF SALARIES & WAGES",
  "STAFF UNIFORMS & PPE",
  "TRANSPORTATION & DELIVERY",
  "UTILITIES",
  "VEGETABLES",
];

const KNOWN = new Set(SPENDING_CATEGORIES);

/** The categories of a record: kept apart with " | " (older records with a comma, unless the whole text is one category). */
export function splitCategories(text: string | null | undefined): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  if (t.includes("|")) return t.split("|").map((c) => c.trim()).filter(Boolean);
  if (KNOWN.has(t)) return [t];
  return t.split(",").map((c) => c.trim()).filter(Boolean);
}

export const joinCategories = (list: string[]): string => list.join(" | ");
