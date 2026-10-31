/**
 * Monthly Breakdown of Restoran Bara (Senibong), O2 Life Sdn Bhd, from the "Sales & Costing" workbooks (Jan - May from the breakdown sheet,
 * June and July from the Jun 26 / Jul 26 files). A value of null is a month not entered yet (the sheet shows it empty), which is not the same as RM 0.
 */
export const BARA_YEAR = 2026;
export const BARA_TITLE = "Restoran Bara (Senibong)";
export const BARA_COMPANY = "O2 Life";

type Months = (number | null)[]; // index 0 = January

/** The share of total sales each line is limited to; net profit is what is left (20%). */
export const BARA_LIMITS = { raw: 0.38, labour: 0.3, utilities: 0.08, contribution: 0.04, net: 0.2 };

export const BARA_SALES: Months = [134506.21, 94832.15, 74247.32, 73000.51, 45105.57, 75725, 90810, null, null, null, null, null];
/** Raw item cost = the actual cost of the month in the costing report (June: total expenses 27,475.05 + carried forward 5,046.52). */
export const BARA_RAW: Months = [60935.0785, 42155.665, 32015.8175, 27233.5815, 21397.991, 32521.571, null, null, null, null, null, null];
export const BARA_LABOUR: Months = [49460.77, 41494.14, 40184.64, null, null, null, null, null, null, null, null, null];

export type BaraItem = { label: string; budget: number | null; values: Months; note?: string };

/** Basic utilities of the restaurant: rental, hostels, TNB, SAJ and wifi / system. */
export const BARA_UTILITIES: BaraItem[] = [
  { label: "Rental", budget: 2000, values: [2000, 2000, 2000, 2000, 2000, null, null, null, null, null, null, null] },
  { label: "Hostel Bara", budget: 1000, values: [1000, 1000, 1000, 1000, 1000, null, null, null, null, null, null, null] },
  { label: "Hostel Impian", budget: 900, values: [900, 0, 0, 0, null, null, null, null, null, null, null, null] },
  { label: "TNB", budget: 1700, values: [1202.18, 1245.55, 1069.75, 1456.43, null, null, null, null, null, null, null, null] },
  { label: "SAJ Runhill", budget: 700, values: [817.01, 659.35, 754.75, 696.45, null, null, null, null, null, null, null, null] },
  { label: "Wifi, system", budget: 300, values: [102.65, 73.74, 73.74, 73.74, null, null, null, null, null, null, null, null] },
];

export const BARA_CONTRIBUTION: BaraItem[] = [
  { label: "Food review", budget: 2500, values: [1200, 5300, null, 800, null, null, null, null, null, null, null, null] },
  { label: "Lela salary", budget: 2200, values: [965, 0, 0, null, null, null, null, null, null, null, null, null], note: "MC" },
  { label: "Incentive", budget: null, values: [0, 0, null, null, null, null, null, null, null, null, null, null], note: "March: Adi 104, Nad 50, Fakhrul 124" },
  { label: "Part-time", budget: 1500, values: [250, 300, 150, 200, null, null, null, null, null, null, null, null] },
  { label: "Maintenance", budget: null, values: [2363, 1791, 1491.6, 1017.3, 740.2, null, null, null, null, null, null, null] },
  { label: "MC", budget: null, values: [123, null, 278, 58, null, null, null, null, null, null, null, null] },
];

/** A month's total of the items: null when nothing was entered for that month. */
export function totalOf(items: BaraItem[]): Months {
  return Array.from({ length: 12 }, (_, m) => {
    const vals = items.map((i) => i.values[m]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((t, v) => t + v, 0) : null;
  });
}

/** Net profit = total sales less the four cost lines; only for a month where all of them are entered. */
export function netOf(sales: Months, lines: Months[]): Months {
  return sales.map((s, m) => (s === null || lines.some((l) => l[m] === null) ? null : s - lines.reduce((t, l) => t + (l[m] as number), 0)));
}
