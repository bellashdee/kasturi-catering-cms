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

/**
 * Reads every row whose column is one of `ids`, for a long list of ids. The ids travel in the web address, and a few hundred of them make
 * the address too long (the database then answers "Bad Request"), so they are sent 100 at a time, each batch read page by page.
 * `page(chunk, from, to)` builds the query with `.in(column, chunk)`, a stable `.order(...)` and `.range(from, to)`.
 */
export async function fetchAllByIds<T>(
  ids: readonly string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = 100,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  const parts = await Promise.all(chunks.map((chunk) => fetchAll<T>((from, to) => page(chunk, from, to))));
  return parts.flat();
}
