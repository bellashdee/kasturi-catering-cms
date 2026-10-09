import * as XLSX from "xlsx";
import { extractText, getDocumentProxy } from "unpdf";
import { ExtractionError } from "./errors";
import type { FileInspection } from "./types";

export type Inspected = {
  info: FileInspection;
  /** Embedded text per PDF page (index 0 = page 1); empty string for image-only pages. null when not a PDF. */
  pageTexts: string[] | null;
  /** All sheets flattened to CSV text (spreadsheets only). */
  sheetText: string | null;
  /** The sheets' own cells, as displayed in the file (capped), for a faithful table that does not depend on the AI. */
  grids?: { name: string; columns: string[]; rows: string[][] }[];
  /** Measured image quality (images only). veryPoor = too small or too blurry for any value read from it to be trusted. */
  imageQuality?: { width: number; height: number; sharpness: number | null; veryPoor: boolean };
  /** Problems found while inspecting that are not fatal (low resolution, truncated sheets...). */
  warnings: string[];
  mime: string;
};

const MIN_TEXT_CHARS = 30;

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((b, i) => buf[offset + i] === b);
}

function sniffImageMime(buf: Uint8Array): string | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) return "image/heic";
  return null;
}

function looksLikePdf(buf: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(buf.subarray(0, 1024));
  return head.includes("%PDF-");
}

/**
 * Opens the file and looks at what is really inside before any AI is involved: is it a valid, readable file, how many
 * pages, which pages have real text and which are scans. The AI reader is then told exactly that.
 */
export async function inspectFile(params: {
  buffer: ArrayBuffer;
  filename: string;
  fileType: string;
  spreadsheetCharLimit: number;
}): Promise<Inspected> {
  const { buffer, filename, fileType } = params;
  if (buffer.byteLength === 0) {
    throw new ExtractionError("empty_file", "The file is empty (0 bytes).", "Upload the file again — the original may not have copied properly.");
  }
  const bytes = new Uint8Array(buffer);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (fileType === "excel" || fileType === "csv") return inspectSpreadsheet(buffer, params.spreadsheetCharLimit);
  if (fileType === "pdf" || ext === "pdf" || looksLikePdf(bytes)) return inspectPdf(bytes);
  return inspectImage(bytes, filename);
}

async function inspectPdf(bytes: Uint8Array): Promise<Inspected> {
  if (!looksLikePdf(bytes)) {
    throw new ExtractionError("pdf_corrupt", "This file is not a valid PDF (it does not start like one).", "Open the file on your computer to check it, or export/print it to a new PDF and upload that.");
  }
  let pdf;
  try {
    // pdf.js transfers the buffer it is given, so work on a copy.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException") {
      throw new ExtractionError("pdf_encrypted", "This PDF is password-protected, so it cannot be opened.", "Open it with the password, print it to a new PDF (\"Microsoft Print to PDF\"), then upload the password-free copy.");
    }
    throw new ExtractionError(
      "pdf_corrupt",
      `This PDF could not be opened (${err instanceof Error ? err.message : "damaged file"}).`,
      "Re-download or re-scan the document, or print it to a new PDF and upload that. If it still fails, enter the details manually.",
    );
  }

  const pageCount = pdf.numPages;
  if (!pageCount) {
    throw new ExtractionError("pdf_empty", "This PDF has no pages.", "Upload a PDF that contains at least one page, or enter the details manually.");
  }

  let pageTexts: string[] = [];
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    pageTexts = text.map((t) => (t ?? "").replace(/[ \t]+\n/g, "\n").trim());
  } catch {
    pageTexts = [];
  }
  while (pageTexts.length < pageCount) pageTexts.push("");

  const textPages: number[] = [];
  const scannedPages: number[] = [];
  pageTexts.forEach((t, i) => (t.replace(/\s/g, "").length >= MIN_TEXT_CHARS ? textPages : scannedPages).push(i + 1));

  const bits = [`${pageCount} page${pageCount === 1 ? "" : "s"}`];
  if (textPages.length) bits.push(`${textPages.length} with embedded text`);
  if (scannedPages.length) bits.push(`${scannedPages.length} scanned/image-only (read by OCR)`);
  const warnings: string[] = [];
  if (pageCount > 30) warnings.push(`This PDF has ${pageCount} pages; very long documents can take longer than the time allowed. If it fails, split it into smaller files.`);

  return {
    info: { kind: "pdf", pageCount, textPages, scannedPages, summary: bits.join(" · ") },
    pageTexts,
    sheetText: null,
    warnings,
    mime: "application/pdf",
  };
}

async function inspectImage(bytes: Uint8Array, filename: string): Promise<Inspected> {
  const mime = sniffImageMime(bytes);
  if (!mime) {
    throw new ExtractionError(
      "unsupported_file",
      `"${filename}" is not a PDF, image, Excel or CSV file the reader recognises.`,
      "Upload a PDF, JPG, PNG, XLSX/XLS or CSV file (take a screenshot of the document if it is in another format).",
    );
  }
  const warnings: string[] = [];
  let dims = "";
  let imageQuality: Inspected["imageQuality"];
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(Buffer.from(bytes)).metadata();
    if (meta.width && meta.height) {
      dims = ` · ${meta.width}×${meta.height}px`;
      const minSide = Math.min(meta.width, meta.height);
      // Sharpness: variance of a Laplacian at a fixed width (a sharp document scans score in the hundreds; a text-free blur ~0).
      let sharpness: number | null = null;
      try {
        const { data } = await sharp(Buffer.from(bytes))
          .rotate()
          .greyscale()
          .resize({ width: 1000 })
          .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
          .raw()
          .toBuffer({ resolveWithObject: true });
        let sum = 0;
        let sum2 = 0;
        for (const v of data) { sum += v; sum2 += v * v; }
        const mean = sum / data.length;
        sharpness = Math.round((sum2 / data.length - mean * mean) * 10) / 10;
      } catch {
        sharpness = null;
      }
      const tooSmall = minSide < 500;
      const tooBlurry = sharpness !== null && sharpness < 3;
      imageQuality = { width: meta.width, height: meta.height, sharpness, veryPoor: tooSmall || tooBlurry };
      if (tooSmall) warnings.push(`The image is very small (${meta.width}×${meta.height}px): text cannot be read reliably from it.`);
      else if (minSide < 700) warnings.push(`Low-resolution image (${meta.width}×${meta.height}px): small print and digits may not be read reliably. A clearer, larger photo or scan is recommended.`);
      if (tooBlurry) warnings.push("The image is extremely blurry (out of focus or over-compressed).");
      else if (sharpness !== null && sharpness < 30) warnings.push("The image looks soft or blurry: digits may be misread. A sharper photo is recommended.");
    }
  } catch {
    // Some formats (e.g. HEIC) cannot be measured here; the AI reader may still handle them.
  }
  return {
    info: { kind: "image", pageCount: 1, textPages: [], scannedPages: [1], summary: `Image${dims} (read by OCR)` },
    pageTexts: null,
    sheetText: null,
    imageQuality,
    warnings,
    mime,
  };
}

function inspectSpreadsheet(buffer: ArrayBuffer, limit: number): Inspected {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/password|encrypt/i.test(msg)) {
      throw new ExtractionError("spreadsheet_password", "This spreadsheet is password-protected, so it cannot be opened.", "Open it with the password, save a copy without a password, then upload that copy.");
    }
    throw new ExtractionError("spreadsheet_unreadable", `This spreadsheet could not be opened (${msg || "damaged file"}).`, "Open it in Excel and save it again as .xlsx or .csv, then upload the new file.");
  }

  const parts: string[] = [];
  const grids: NonNullable<Inspected["grids"]> = [];
  const sheets: NonNullable<FileInspection["sheets"]> = [];
  const warnings: string[] = [];
  let used = 0;
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    const rows = csv.trim() ? csv.trim().split("\n").length : 0;
    if (rows === 0) {
      sheets.push({ name, rows: 0, truncated: false });
      continue;
    }
    const room = Math.max(limit - used, 0);
    const truncated = csv.length > room;
    const body = truncated ? csv.slice(0, room) : csv;
    used += body.length;
    parts.push(`--- Sheet: ${name} ---\n${body}${truncated ? "\n[TRUNCATED]" : ""}`);
    sheets.push({ name, rows, truncated });
    const cells = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, blankrows: false, defval: "" });
    const width = Math.min(Math.max(...cells.map((r) => r.length), 1), 20);
    grids.push({
      name,
      columns: Array.from({ length: width }, (_, i) => String.fromCharCode(65 + i)),
      rows: cells.slice(0, 300).map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? ""))),
    });
    if (truncated) warnings.push(`Sheet "${name}" is too large: only the first part of its ${rows} rows was read. Upload that sheet on its own, or split it.`);
  }
  if (parts.length === 0) {
    throw new ExtractionError("spreadsheet_empty", "This spreadsheet has no data in any sheet.", "Check that you chose the right file, or enter the details manually.");
  }
  const nonEmpty = sheets.filter((s) => s.rows > 0);
  return {
    info: { kind: "spreadsheet", pageCount: null, textPages: [], scannedPages: [], sheets, summary: `${nonEmpty.length} sheet${nonEmpty.length === 1 ? "" : "s"} with data (${nonEmpty.map((s) => `${s.name}: ${s.rows} rows`).join(", ")})` },
    pageTexts: null,
    sheetText: parts.join("\n\n"),
    warnings,
    mime: "text/csv",
  };
}
