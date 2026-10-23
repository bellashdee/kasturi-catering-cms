import Anthropic from "@anthropic-ai/sdk";
import { GeminiError, geminiGenerateDetailed, isLightModel, type AiProvider, type GeminiPart } from "@/lib/ai/gemini";
import { basePromptFor, wrapperInstructions } from "./docTypes";
import { ExtractionError } from "./errors";
import { inspectFile, type Inspected } from "./inspect";
import { logExtraction, safeMessage } from "./log";
import { buildReport, parseModelJson } from "./report";
import type { ExtractionReport } from "./types";

const MAX_FILE_BYTES = 14 * 1024 * 1024;
const MAX_TEXT_LAYER_CHARS = 100_000;

export type ExtractionResult = { extracted: Record<string, unknown>; report: ExtractionReport };

function describe(inspected: Inspected): string {
  const info = inspected.info;
  if (info.kind === "pdf") {
    const parts = [`This PDF has ${info.pageCount} page${info.pageCount === 1 ? "" : "s"}.`];
    if (info.textPages.length) parts.push(`Pages with an embedded text layer: ${info.textPages.join(", ")}.`);
    if (info.scannedPages.length) parts.push(`Scanned / image-only pages (read them visually, they may be rotated): ${info.scannedPages.join(", ")}.`);
    return parts.join(" ");
  }
  if (info.kind === "image") return "This is a photo or screenshot of a document (it may be rotated, skewed, blurry or partly cut off).";
  return `This is a spreadsheet; use the sheet name as the "page" value. ${info.summary}.`;
}

/** The PDF's own text, page by page, so numbers/IDs can be copied exactly instead of being re-read from pixels. */
function textLayerBlock(inspected: Inspected): string | null {
  if (!inspected.pageTexts || inspected.info.textPages.length === 0) return null;
  let used = 0;
  const parts: string[] = [];
  inspected.pageTexts.forEach((t, i) => {
    if (!t || used >= MAX_TEXT_LAYER_CHARS) return;
    const body = t.slice(0, MAX_TEXT_LAYER_CHARS - used);
    used += body.length;
    parts.push(`--- Page ${i + 1} (embedded text) ---\n${body}`);
  });
  return `Embedded text of this PDF, page by page (exact characters; use it to copy numbers, names and references exactly. The page images remain the authority for layout and for anything not in this text):\n\n${parts.join("\n\n")}`;
}

function mapGeminiError(err: GeminiError, inspected: Inspected): ExtractionError {
  switch (err.kind) {
    case "busy":
    case "rate_limit":
      return new ExtractionError(
        "ai_busy",
        "The AI reader is busy right now (the free service limits how many files it reads).",
        "The file is saved. Wait a minute and choose it again, or enter the details manually.",
        503,
      );
    case "timeout":
      return new ExtractionError(
        "ai_timeout",
        `Reading took longer than the time allowed${inspected.info.pageCount && inspected.info.pageCount > 5 ? ` (${inspected.info.pageCount} pages)` : ""}.`,
        inspected.info.kind === "pdf" ? "Try again, or split the PDF into smaller files (about 5–10 pages each) and upload them one at a time." : "Try again in a minute, or enter the details manually.",
        504,
      );
    case "blocked":
      return new ExtractionError("ai_blocked", err.message, "Upload a different copy of the document, or enter the details manually.", 422);
    default:
      return new ExtractionError("ai_failed", `The AI reader could not process this file (${err.message}).`, "Try again; if it keeps failing, enter the details manually.", 502);
  }
}

export async function runExtraction(params: {
  buffer: ArrayBuffer;
  filename: string;
  fileType: string;
  kind: string;
  provider: AiProvider;
  /** The file converted to Markdown by MarkItDown (spreadsheets / Word: tables and text exactly as in the file). */
  markdown?: string | null;
  /** When the HTTP request started, so the whole request stays inside the platform's time limit. */
  requestStartedAt?: number;
}): Promise<ExtractionResult> {
  const { buffer, filename, fileType, kind, provider } = params;
  const requestStartedAt = params.requestStartedAt ?? Date.now();
  const isSpreadsheet = fileType === "excel" || fileType === "csv";

  if (!isSpreadsheet && buffer.byteLength > MAX_FILE_BYTES) {
    throw new ExtractionError(
      "file_too_large",
      `The file is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB, over the 14 MB limit.`,
      "Compress it (e.g. scan at a lower resolution or use \"Reduce file size\" in a PDF tool) or split it into smaller files, then upload again.",
    );
  }

  const inspected = await inspectFile({ buffer, filename, fileType, spreadsheetCharLimit: provider === "gemini" ? 400_000 : 150_000 });

  logExtraction("inspected", {
    kind: inspected.info.kind,
    pages: inspected.info.pageCount,
    textPages: inspected.info.textPages.length,
    scannedPages: inspected.info.scannedPages.length,
    imageWidth: inspected.imageQuality?.width,
    imageSharpness: inspected.imageQuality?.sharpness,
    textLayerEmpty: inspected.info.kind === "pdf" ? inspected.info.textPages.length === 0 : undefined,
    processor: provider,
  });

  if (provider === "anthropic" && (inspected.mime === "image/heic" || inspected.mime === "image/heif")) {
    throw new ExtractionError("heic_unsupported", "iPhone HEIC photos can't be read.", "Take a screenshot of the photo or save it as JPG/PNG, then upload that.");
  }

  // Measured, not guessed: an image this small or blurry makes the AI reader invent plausible-looking values, so it is
  // refused before any reading happens rather than risk a wrong amount or name being saved.
  if (inspected.imageQuality?.veryPoor) {
    throw new ExtractionError(
      "image_too_poor",
      `This image is too poor to read reliably (${inspected.warnings.filter((w) => /very small|extremely blurry/.test(w)).join(" ")}).`,
      "Retake the photo flat, in good light and in focus (or scan it) at a higher resolution, or upload the original PDF. Otherwise enter the details manually.",
      422,
    );
  }

  const prompt = basePromptFor(kind) + wrapperInstructions(describe(inspected));
  const textLayer = textLayerBlock(inspected);
  const spreadsheetLimit = provider === "gemini" ? 400_000 : 150_000;
  // MarkItDown's Markdown tables are the preferred text for a spreadsheet; the CSV from inspection is the fallback.
  const sheetSource = isSpreadsheet
    ? params.markdown
      ? { format: "Markdown (converted with MarkItDown)", text: params.markdown.slice(0, spreadsheetLimit) }
      : inspected.sheetText
        ? { format: "CSV", text: inspected.sheetText }
        : null
    : null;

  const startedAt = Date.now();
  let parsed: Record<string, unknown> | null = null;
  let model: string | null = null;

  // A garbled answer (rare, mostly from the lighter fallback models) gets one more try if there is time left.
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    let raw = "";
    let finish: string | null = null;
    try {
      if (provider === "gemini") {
        const parts: GeminiPart[] = [];
        if (sheetSource) parts.push({ text: `The uploaded file is a spreadsheet. Its contents, sheet by sheet, as ${sheetSource.format}:\n\n${sheetSource.text}` });
        else parts.push({ inline_data: { mime_type: inspected.mime, data: Buffer.from(buffer).toString("base64") } });
        if (textLayer) parts.push({ text: textLayer });
        parts.push({ text: prompt });
        const result = await geminiGenerateDetailed({ turns: [{ role: "user", parts }], maxOutputTokens: 16384, json: true, budgetMs: Math.min(52_000, 56_000 - (Date.now() - requestStartedAt)) });
        raw = result.text;
        finish = result.finishReason;
        model = result.model;
        logExtraction("ai_done", { model: result.model, finish: result.finishReason, ms: Date.now() - startedAt, answerChars: result.text.length, attempt });
      } else {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const blocks: Anthropic.ContentBlockParam[] = [];
        if (sheetSource) blocks.push({ type: "text", text: `The uploaded file is a spreadsheet. Its contents, sheet by sheet, as ${sheetSource.format}:\n\n${sheetSource.text}` });
        else if (inspected.mime === "application/pdf") blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(buffer).toString("base64") } });
        else blocks.push({ type: "image", source: { type: "base64", media_type: inspected.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: Buffer.from(buffer).toString("base64") } });
        if (textLayer) blocks.push({ type: "text", text: textLayer });
        blocks.push({ type: "text", text: prompt });
        model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
        const response = await anthropic.messages.create({ model, max_tokens: 8192, messages: [{ role: "user", content: blocks }] });
        const textBlock = response.content.find((b) => b.type === "text");
        raw = textBlock && "text" in textBlock ? textBlock.text : "";
        finish = response.stop_reason === "max_tokens" ? "MAX_TOKENS" : response.stop_reason;
      }
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      logExtraction("ai_error", { attempt, ms: Date.now() - startedAt, message: safeMessage(err) });
      if (err instanceof GeminiError) throw mapGeminiError(err, inspected);
      const message = err instanceof Error ? err.message : "unknown error";
      throw new ExtractionError("ai_failed", `The AI reader could not process this file (${message}).`, "Try again; if it keeps failing, enter the details manually.", 502);
    }

    if (finish === "MAX_TOKENS") {
      throw new ExtractionError(
        "ai_truncated",
        "This document has more content than could be read in one go, so the result was cut off and was not used (a partial result could silently miss lines).",
        inspected.info.kind === "pdf" ? "Split the file into smaller parts (about 5–10 pages each) and upload them separately." : "Upload only the relevant sheet / part of the file.",
        422,
      );
    }
    if (finish && /SAFETY|RECITATION|PROHIBITED|BLOCKLIST|SPII/i.test(finish) && !raw.trim()) {
      throw new ExtractionError("ai_blocked", `The AI service declined to read this file (${finish}).`, "Upload a different copy of the document, or enter the details manually.", 422);
    }
    if (!raw.trim()) {
      throw new ExtractionError("ai_empty", "The AI reader returned nothing for this file.", "Try again; if it keeps failing, upload a clearer copy or enter the details manually.", 502);
    }

    parsed = parseModelJson(raw);
    if (!parsed && (attempt === 1 || Date.now() - startedAt > 24_000)) {
      throw new ExtractionError("ai_parse_failed", "The AI reader's answer could not be understood.", "Choose the file again to retry. If it keeps failing, enter the details manually.", 502);
    }
  }

  if (!parsed) throw new ExtractionError("ai_parse_failed", "The AI reader's answer could not be understood.", "Choose the file again to retry. If it keeps failing, enter the details manually.", 502);

  const result = buildReport({ parsed, kind, inspected, model });

  logExtraction("parsed", {
    model,
    fieldsFound: result.report.fields.filter((f) => f.status === "found").length,
    fieldsTotal: result.report.fields.length,
    tableRows: result.report.tables.reduce((n, t) => n + t.rows.length, 0),
    issues: result.report.issues.length,
    needsReview: result.report.needsReview,
    legibility: result.report.legibility,
    ms: Date.now() - requestStartedAt,
  });

  // An empty result must never look like a successful read.
  const foundFields = result.report.fields.filter((f) => f.status === "found").length;
  // the sheet's own rows ("rows as in the file") do not count: they exist even when the reader found nothing
  const tableRows = result.report.tables.filter((t) => !/\(rows as in the file\)$/.test(t.name)).reduce((n, t) => n + t.rows.length, 0);
  if (foundFields === 0 && tableRows === 0) {
    const why = result.report.issues.filter((i) => !/lighter fallback model/i.test(i)).slice(0, 3).join(" ");
    if (result.report.legibility === "poor" || result.report.fields.some((f) => f.status === "unreadable")) {
      throw new ExtractionError(
        "unreadable",
        `Nothing could be read from this file — it is too blurry, too small or too dark.${why ? ` (${why})` : ""}`,
        inspected.info.kind === "image"
          ? "Retake the photo flat and in good light (or scan it), at a higher resolution, or upload the original PDF. Otherwise enter the details manually."
          : "Upload a clearer scan (at least 200 dpi) or the original PDF, or enter the details manually.",
        422,
      );
    }
    throw new ExtractionError(
      "nothing_found",
      `The file was read, but none of the details this form needs were found in it${result.report.documentType !== "other" ? ` (it looks like a ${result.report.documentTypeLabel.toLowerCase()})` : ""}.${why ? ` (${why})` : ""}`,
      "Check that you chose the right document, or enter the details manually.",
      422,
    );
  }
  if (isLightModel(model)) {
    result.report.issues.push("The preferred AI reader was busy, so a lighter fallback model read this file. Check every value against the original.");
    result.report.needsReview = true;
  }
  return result;
}
