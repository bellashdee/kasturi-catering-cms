/**
 * Monthly Breakdown of Restoran Bara (Senibong), O2 Life Sdn Bhd. The figures are kept in the database: total sales in monthly_sales and the
 * items of each cost line in breakdown_items (seeded from the "Sales & Costing" workbooks). A value of null is a month not entered yet,
 * which is not the same as RM 0.
 */
export const BARA_TITLE = "Restoran Bara (Senibong)";
export const BARA_COMPANY = "O2 Life";

export type Months = (number | null)[]; // index 0 = January

/** The share of total sales each line is limited to; net profit is what is left (20%). */
export const BARA_LIMITS = { raw: 0.38, labour: 0.3, utilities: 0.08, contribution: 0.04, net: 0.2 };

export type BreakdownLine = "raw" | "labour" | "utilities" | "contribution";

export type BreakdownItem = { id: string; label: string; budget: number | null; note: string | null; values: Months };

/** The food categories of Company Expenses that make up the raw item cost of a month that has no costing-report figure entered. */
export const RAW_ITEM_CATEGORIES = [
  "BAKERY & BREAD", "BEEF & MEAT", "BEVERAGES & BAR ITEMS", "CHARCOAL & GAS", "CHICKEN", "DAIRY & FROZEN PRODUCTS", "DRY GOODS & GROCERIES", "EGGS", "FISH",
  "FOOD PASTE, SAUCES & SEASONINGS", "FRUITS", "ICE", "RICE", "SEAFOOD", "VEGETABLES",
];

/** A month's total of the items: null when nothing was entered for that month. */
export function totalOf(items: { values: Months }[]): Months {
  return Array.from({ length: 12 }, (_, m) => {
    const vals = items.map((i) => i.values[m]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((t, v) => t + v, 0) : null;
  });
}

/** Net profit = total sales less the four cost lines; only for a month where all of them are entered. */
export function netOf(sales: Months, lines: Months[]): Months {
  return sales.map((s, m) => (s === null || lines.some((l) => l[m] === null) ? null : s - lines.reduce((t, l) => t + (l[m] as number), 0)));
}
