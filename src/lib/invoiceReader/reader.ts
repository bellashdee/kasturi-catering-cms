import * as XLSX from "xlsx";
import { ExtractionError } from "@/lib/extraction/errors";
import { runExtraction } from "@/lib/extraction/run";
import type { ExtractionReport } from "@/lib/extraction/types";
import type { Detected, InvoiceFormat } from "./detect";
import { AI_INVOICE_PROMPT } from "./prompt";
import type { InvoiceReaderProvider } from "./providers";
import {
  DATE_FIELDS,
  HEADER_FIELDS,
  LINE_CATEGORIES,
  MONEY_FIELDS,
  emptyHeader,
  isIsoDate,
  parsePrintedDate,
  textOrNull,
  toNumberOrNull,
  type CanonicalInvoice,
  type Confidence,
  type FieldInfo,
  type HeaderField,
  type InvoiceLine,
} from "./schema";
import { XmlParseError, isUblInvoice, parseXml, readUblInvoice } from "./xml";

export type ReadInput = {
  buffer: ArrayBuffer;
  filename: string;
  detected: Detected;
  /** text of a Word document (MarkItDown), when the format needs it */
  markdown?: string | null;
  provider: InvoiceReaderProvider | null;
  requestStartedAt: number;
};

export type ReadOutput = {
  invoice: CanonicalInvoice;
  /** what the reader returned, untouched (kept as the original extraction) */
  raw: Record<string, unknown>;
  report: ExtractionReport | null;
  provider: string;
  model: string | null;
};

/** One reader per file format, all producing the same CanonicalInvoice. */
export type InvoiceAdapter = { formats: InvoiceFormat[]; needsMarkdown?: boolean; read(input: ReadInput): Promise<ReadOutput> };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function requireProvider(p: InvoiceReaderProvider | null): InvoiceReaderProvider {
  if (!p) {
    throw new ExtractionError(
      "ai_not_configured",
      "The AI reader is not configured on the server (no ANTHROPIC_API_KEY or GEMINI_API_KEY).",
      "Ask the system administrator to add a key, or enter the invoice manually.",
      503,
    );
  }
  return p;
}

/** Turns the AI pipeline's answer + report into the common invoice shape (values normalised, printed text kept per field). */
function fromAiResult(extracted: Record<string, unknown>, report: ExtractionReport): CanonicalInvoice {
  const header = emptyHeader();
  const fields: CanonicalInvoice["fields"] = {};
  const issues = [...report.issues];
  for (const f of HEADER_FIELDS) {
    const r = report.fields.find((x) => x.field === f);
    const raw = extracted[f];
    const info: FieldInfo = {
      confidence: r?.confidence ?? null,
      status: r?.status ?? (raw === null || raw === undefined || raw === "" ? "absent" : "found"),
      printed: r && r.status === "found" ? r.display : null,
      source: r?.source ?? null,
      notes: [...(r?.notes ?? [])],
    };
    let value: string | number | null = null;
    if (MONEY_FIELDS.includes(f)) {
      value = toNumberOrNull(raw);
      if (raw !== null && raw !== undefined && raw !== "" && value === null) {
        info.status = "unreadable";
        info.confidence = "low";
        info.notes.push(`"${String(raw)}" is not a number.`);
      }
    } else if (DATE_FIELDS.includes(f)) {
      // the date is taken from the printed text (day first, as in Malaysia), not from the reader's own conversion, which
      // sometimes swaps day and month
      const printedDate = parsePrintedDate(info.printed);
      const aiDate = isIsoDate(raw) ? raw : null;
      if (printedDate) {
        value = printedDate;
        if (aiDate && aiDate !== printedDate) info.notes.push(`Printed "${info.printed}" is read day-first as ${printedDate} (the AI reader had ${aiDate}).`);
      } else if (aiDate) {
        value = aiDate;
        if (info.printed && info.confidence === "high") info.confidence = "medium";
        if (info.printed) info.notes.push(`Check the day and month against the printed "${info.printed}".`);
      } else if (textOrNull(raw) || info.printed) {
        info.status = "unreadable";
        info.confidence = "low";
        info.notes.push(`"${String(info.printed ?? raw)}" is not a clear date; type it from the invoice.`);
      }
    } else {
      value = textOrNull(raw);
    }
    if (value === null && info.status === "found") info.status = "absent";
    header[f] = value;
    fields[f] = info;
  }
  if (typeof header.currency === "string" && /^(rm|ringgit)$/i.test(header.currency.trim())) {
    fields.currency?.notes.push(`Printed as "${header.currency}".`);
    header.currency = "MYR";
  }

  const lowLegibility = report.legibility === "poor" || report.legibility === "partial";
  const items = Array.isArray(extracted.items) ? extracted.items.filter(isObject) : [];
  const lines: InvoiceLine[] = items.map((it) => {
    const page = it.page;
    const source = typeof page === "number" ? `Page ${page}` : typeof page === "string" && page.trim() ? (/^\d+$/.test(page.trim()) ? `Page ${page.trim()}` : page.trim()) : null;
    const category = typeof it.category === "string" && (LINE_CATEGORIES as readonly string[]).includes(it.category.toUpperCase()) ? it.category.toUpperCase() : null;
    const line: InvoiceLine = {
      item_code: textOrNull(it.item_code),
      description: textOrNull(it.description ?? it.item_name),
      category,
      quantity: toNumberOrNull(it.quantity),
      unit: textOrNull(it.unit ?? it.uom),
      unit_price: toNumberOrNull(it.unit_price),
      discount: toNumberOrNull(it.discount),
      tax_amount: toNumberOrNull(it.tax_amount),
      line_total: toNumberOrNull(it.line_total),
      source,
      confidence: lowLegibility ? "low" : "medium",
    };
    if (!line.description || line.line_total === null) line.confidence = "low";
    return line;
  });

  const isChat = extracted.is_chat_screenshot === true;
  if (isChat) issues.push("This is a chat screenshot: only the invoice shown in it was read. Messages in the chat are kept for reference and were not used as invoice values.");
  return { header, lines, fields, chatText: textOrNull(extracted.chat_text), isChatScreenshot: isChat, issues };
}

async function readWithAi(input: ReadInput, fileType: string, markdown: string | null, context?: string): Promise<ReadOutput> {
  const provider = requireProvider(input.provider);
  const { extracted, report } = await runExtraction({
    buffer: input.buffer,
    filename: input.filename,
    fileType,
    kind: "ai_invoice",
    provider,
    markdown,
    requestStartedAt: input.requestStartedAt,
    basePrompt: AI_INVOICE_PROMPT,
    context,
  });
  return { invoice: fromAiResult(extracted, report), raw: extracted, report, provider, model: report.model };
}

/**
 * Every non-empty cell of every sheet with its cell reference ("Row 12: A="..." | D="12.50"), so each value read from a
 * spreadsheet can point back to the cell it came from.
 */
export function spreadsheetWithCellRefs(buffer: ArrayBuffer, limit = 100_000): string {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/password|encrypt/i.test(msg)) throw new ExtractionError("spreadsheet_password", "This spreadsheet is password-protected, so it cannot be opened.", "Open it with the password, save a copy without a password, then upload that copy.");
    throw new ExtractionError("spreadsheet_unreadable", `This spreadsheet could not be opened (${msg || "damaged file"}).`, "Open it in Excel and save it again as .xlsx, then upload the new file.");
  }
  const out: string[] = [];
  let used = 0;
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const rows: string[] = [];
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 2000); r++) {
      const cells: string[] = [];
      for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 40); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const shown = cell ? String(cell.w ?? cell.v ?? "").trim() : "";
        if (shown) cells.push(`${XLSX.utils.encode_col(c)}=${JSON.stringify(shown)}`);
      }
      if (cells.length) rows.push(`Row ${r + 1}: ${cells.join(" | ")}`);
    }
    if (!rows.length) continue;
    const block = `--- Sheet: ${name} ---\n${rows.join("\n")}`;
    if (used + block.length > limit) {
      out.push(block.slice(0, Math.max(limit - used, 0)) + "\n[TRUNCATED]");
      break;
    }
    used += block.length;
    out.push(block);
  }
  if (!out.length) throw new ExtractionError("spreadsheet_empty", "This spreadsheet has no data in any sheet.", "Check that you chose the right file, or enter the details manually.");
  return out.join("\n\n");
}

const SHEET_CONTEXT =
  'The spreadsheet text gives every non-empty cell as Row N: COLUMN="shown value". For "page" (in field_meta and in each item) give the cell reference as "SheetName!C12" (the cell holding the value).';

export const ADAPTERS: InvoiceAdapter[] = [
  { formats: ["pdf", "image"], read: (input) => readWithAi(input, input.detected.format === "pdf" ? "pdf" : "photo", null) },
  {
    formats: ["excel", "csv"],
    read: (input) => readWithAi(input, input.detected.format, spreadsheetWithCellRefs(input.buffer), SHEET_CONTEXT),
  },
  {
    formats: ["word", "word_legacy"],
    needsMarkdown: true,
    read: (input) => {
      if (!input.markdown?.trim()) {
        throw new ExtractionError(
          input.detected.format === "word_legacy" ? "doc_unsupported" : "word_unreadable",
          input.detected.format === "word_legacy"
            ? "Old Word 97-2003 (.doc) files cannot be read on the server."
            : "The text of this Word document could not be taken out of the file.",
          "Open it in Word and save it as PDF (or .docx), then upload that. Otherwise enter the invoice manually.",
        );
      }
      return readWithAi(input, "word", input.markdown);
    },
  },
  {
    formats: ["xml"],
    read: async (input) => {
      const text = new TextDecoder("utf-8").decode(input.buffer);
      let root;
      try {
        root = parseXml(text);
      } catch (err) {
        throw new ExtractionError(
          "xml_corrupt",
          `This XML file is damaged or incomplete (${err instanceof XmlParseError ? err.message : "cannot be parsed"}).`,
          "Download the e-invoice XML again from the supplier / MyInvois, or upload the PDF copy.",
        );
      }
      if (isUblInvoice(root)) {
        const invoice = readUblInvoice(root);
        return { invoice, raw: { format: "UBL 2.1", root: root.name }, report: null, provider: "xml", model: null };
      }
      // an XML that is not a UBL e-invoice: its text is read by the AI reader (no OCR), and flagged for review
      const out = await readWithAi(input, "text", text);
      out.invoice.issues.unshift(`This XML is not a standard e-invoice (root element <${root.name}>), so its text was read by the AI reader. Check every value.`);
      return out;
    },
  },
];

export function adapterFor(format: InvoiceFormat): InvoiceAdapter | null {
  return ADAPTERS.find((a) => a.formats.includes(format)) ?? null;
}

export async function readInvoice(input: ReadInput): Promise<ReadOutput> {
  const adapter = adapterFor(input.detected.format);
  if (!adapter) {
    throw new ExtractionError(
      "unsupported_file",
      `"${input.filename}" is not a file type the invoice reader can open.`,
      "Upload a PDF, photo / screenshot, XML e-invoice, Excel or Word file.",
    );
  }
  return adapter.read(input);
}

/** lowest of the confidences given (null ignored) */
export function minConfidence(...c: (Confidence | null | undefined)[]): Confidence | null {
  const order: Confidence[] = ["low", "medium", "high"];
  const present = c.filter((x): x is Confidence => !!x);
  if (!present.length) return null;
  return order[Math.min(...present.map((x) => order.indexOf(x)))];
}

export type { HeaderField };
