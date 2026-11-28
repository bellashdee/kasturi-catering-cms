/**
 * Reads every row of a query, page by page. The database answers at most 1,000 rows at a time, so a list or a total read in one go
 * stops at 1,000 and the report quietly leaves the rest out. `page(from, to)` builds the same query with `.range(from, to)`.
 */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    const got = data ?? [];
    rows.push(...got);
    if (got.length < size) return rows;
  }
}
