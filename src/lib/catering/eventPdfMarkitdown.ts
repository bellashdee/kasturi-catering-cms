"use client";

import { uploadDocument } from "@/lib/documents/upload";
import { requestExtraction } from "@/lib/importFlow/extractClient";

/** The header row the import already understands (fieldOfHeader), in the order of the AI answer's keys. */
const COLUMNS: { key: string; header: string }[] = [
  { key: "event_id", header: "Event ID" },
  { key: "customer", header: "Customer" },
  { key: "event_name", header: "Event Name" },
  { key: "event_date", header: "Event Date" },
  { key: "start_time", header: "Start Time" },
  { key: "end_time", header: "End Time" },
  { key: "venue", header: "Venue" },
  { key: "event_address", header: "Event Address" },
  { key: "pax", header: "Pax" },
  { key: "meal_type", header: "Meal Type" },
  { key: "service_type", header: "Service Type" },
  { key: "confirmed_menu", header: "Confirmed Menu" },
  { key: "sales_agent", header: "Sales Agent" },
  { key: "autocount_quotation_no", header: "AutoCount Quotation No." },
  { key: "autocount_invoice_no", header: "AutoCount Invoice No." },
  { key: "event_status", header: "Event Status" },
  { key: "event_type", header: "Event Type" },
  { key: "remarks", header: "Remarks" },
  { key: "revenue", header: "Revenue" },
  { key: "com", header: "Com" },
];

export type PdfReadResult = { rows: unknown[][]; issues: string[] } | { error: string };

/** Saves the PDF in Documents (where every file is converted to Markdown with MarkItDown) and returns the document id. */
export async function saveEventPdf(file: File, companyId: string): Promise<string> {
  const doc = await uploadDocument({ companyId, module: "catering", fileType: "pdf", file });
  return doc.id;
}

/**
 * Reads the event table from the saved PDF's MarkItDown text (or, for a scanned PDF, from its pages) with the AI reader, and returns it
 * as a sheet with a header row, so it goes through exactly the same checks and preview as an Excel file. Nothing is saved as events here.
 */
export async function readEventPdfFromDocument(documentId: string): Promise<PdfReadResult> {
  const { res, result } = await requestExtraction(documentId, "event_list");
  if (result.configured === false) return { error: typeof result.message === "string" ? result.message : "The AI reader is not set up." };
  if (!res.ok) return { error: result.error ?? "The PDF could not be read." };
  const items: unknown = result.extracted?.items;
  if (!Array.isArray(items) || items.length === 0) return { error: "No events were found in that PDF." };
  const rows: unknown[][] = [COLUMNS.map((c) => c.header)];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    rows.push(COLUMNS.map((c) => (rec[c.key] === null || rec[c.key] === undefined ? "" : String(rec[c.key]))));
  }
  return { rows, issues: result.report?.issues ?? [] };
}
