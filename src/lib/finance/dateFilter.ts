export type InvoiceDateField = "invoice_date" | "due_date";

export type InvoiceDateFilter = {
  field: InvoiceDateField;
  from?: string;
  to?: string;
  /** true when a From and/or To date is applied to the list */
  active: boolean;
  /** shown under the filter when the dates were not usable (and then no date filtering is applied) */
  error?: string;
};

const isDate = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** Reads the filter from the page address: which date, and a From and/or To (each optional). Bad input is ignored with a message. */
export function parseInvoiceDateFilter(params: { dateField?: string; from?: string; to?: string }): InvoiceDateFilter {
  const field: InvoiceDateField = params.dateField === "due_date" ? "due_date" : "invoice_date";
  const from = params.from?.trim() || undefined;
  const to = params.to?.trim() || undefined;
  if ((from && !isDate(from)) || (to && !isDate(to))) return { field, active: false, error: "One of the dates is not valid, so the list is not filtered." };
  if (from && to && from > to) return { field, from, to, active: false, error: "The From date is after the To date, so the list is not filtered." };
  return { field, from, to, active: !!(from || to) };
}

/** Applies the filter to a Supabase query on an invoices table (either side open is fine). */
export function applyInvoiceDateFilter<Q extends { gte: (column: string, value: string) => Q; lte: (column: string, value: string) => Q }>(
  query: Q,
  filter: InvoiceDateFilter | undefined,
): Q {
  if (!filter?.active) return query;
  let q = query;
  if (filter.from) q = q.gte(filter.field, filter.from);
  if (filter.to) q = q.lte(filter.field, filter.to);
  return q;
}
