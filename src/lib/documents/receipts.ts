/**
 * The receipts of a petty cash record: document_id is the first, extra_document_ids the others, in order. Files added later (Edit)
 * are added to the ones already attached; nothing is replaced.
 */
export function addReceipts(before: { document_id: string | null; extra_document_ids?: string[] | null }, added: string[]): { document_id: string | null; extra_document_ids: string[] } {
  const all = [before.document_id, ...(before.extra_document_ids ?? []), ...added].filter((id): id is string => !!id);
  const unique = Array.from(new Set(all));
  return { document_id: unique[0] ?? null, extra_document_ids: unique.slice(1) };
}

/** Every receipt of a record, the first one first. */
export const receiptIds = (row: { document_id: string | null; extra_document_ids?: string[] | null }): string[] =>
  [row.document_id, ...(row.extra_document_ids ?? [])].filter((id): id is string => !!id);
