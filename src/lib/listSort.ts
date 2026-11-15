/**
 * Sorting of the list pages: the "Sort by" choice and Ascending / Descending of the filter bar (ListFilters). Each page names the fields it
 * offers (customer, invoice number, month ...) and how to read them from a row; the rows are sorted here, after the filters.
 */
export type SortDir = "asc" | "desc";

export const SORT_DIR_LABEL: Record<SortDir, string> = { asc: "Ascending", desc: "Descending" };

/** Text compared the way people read it: "INV-2" before "INV-10", capitals ignored. */
export const natural = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").localeCompare(b ?? "", undefined, { numeric: true, sensitivity: "base" });

type Value = string | number | null | undefined;

function compareValues(a: Value, b: Value): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1; // blanks always at the end, whichever direction
  if (typeof a === "number" && typeof b === "number") return a - b;
  return natural(String(a), String(b));
}

/**
 * The sort and the direction chosen in the URL (?sort=customer&dir=asc), or the page's default. `options` are the fields the page offers.
 */
export function readSort<K extends string>(
  params: { sort?: string | null; dir?: string | null },
  options: Record<K, string>,
  fallback: NoInfer<K>,
  fallbackDir: SortDir = "desc",
): { sort: K; dir: SortDir } {
  const sort = params.sort && params.sort in options ? (params.sort as K) : fallback;
  const dir: SortDir = params.dir === "asc" || params.dir === "desc" ? params.dir : fallbackDir;
  return { sort, dir };
}

/**
 * A sorted copy of the rows. `keys` are read in turn: the first decides, the next ones break ties (e.g. customer, then invoice number).
 * Rows without a value go to the end in both directions.
 */
export function sortRows<T>(rows: readonly T[], dir: SortDir, ...keys: ((row: T) => Value)[]): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((x, y) => {
    for (const key of keys) {
      const a = key(x);
      const b = key(y);
      const blank = (v: Value) => v === null || v === undefined || v === "";
      const c = compareValues(a, b);
      if (c !== 0) return blank(a) || blank(b) ? c : c * sign;
    }
    return 0;
  });
}

/**
 * Sorts by the chosen field: `fields` maps each sort key of the page to how a row is read (one value, or several for ties).
 */
export function sortBy<T, K extends string>(rows: readonly T[], sort: NoInfer<K>, dir: SortDir, fields: Record<K, ((row: T) => Value) | ((row: T) => Value)[]>): T[] {
  const f = fields[sort];
  return sortRows(rows, dir, ...(Array.isArray(f) ? f : [f]));
}
