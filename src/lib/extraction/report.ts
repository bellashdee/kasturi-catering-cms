import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL, EXPECTED_TYPES, type DocumentType } from "./docTypes";
import { validateFigures } from "./validate";
import type { Confidence, ExtractionReport, FieldStatus, ReportField, ReportTable } from "./types";
import type { Inspected } from "./inspect";
import { hasSourceText, snapToSource } from "./snap";

type Meta = { status?: string; page?: unknown; confidence?: string; note?: unknown; printed?: unknown; label?: unknown };
type Json = Record<string, unknown>;

/** Finds the JSON object in a model answer (models sometimes wrap it in prose or a code fence). */
export function parseModelJson(raw: string): Json | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Json) : null;
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const asConfidence = (v: unknown): Confidence | null => (v === "high" || v === "medium" || v === "low" ? v : null);

function sourceLabel(page: unknown, inspection: Inspected["info"]): string | null {
  if (typeof page === "number" && Number.isFinite(page)) return `Page ${page}`;
  if (typeof page === "string" && page.trim()) {
    const n = page.match(/^(?:page|p\.?)?\s*(\d+)$/i);
    return n ? `Page ${n[1]}` : page.trim();
  }
  if (inspection.kind !== "spreadsheet" && inspection.pageCount === 1) return "Page 1";
  return null;
}

function pageNumber(source: string | null): number | null {
  const m = source?.match(/^Page (\d+)$/);
  return m ? Number(m[1]) : null;
}

const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const stripThousands = (s: string) => s.replace(/(?<=\d),(?=\d{3})/g, "");

/** Fields whose value should literally appear on the page (names, numbers, references), as opposed to summaries the reader wrote. */
const CHECKABLE_FIELD = /(number|_no$|amount|total|price|cost|spend|tax|reference|name|date)$/i;

/**
 * Cross-checks a value against the PDF's own embedded text. A value the AI "read" that is nowhere in the page text is the
 * classic sign of a misread or invented value.
 */
function valueInText(value: unknown, printed: string | null, pageText: string): boolean | null {
  const normalizedPage = normalizeText(pageText);
  // The text exactly as printed is the best thing to look for (keeps "RM 1,686.50", "01/08/2026", "5510 1672 4784" intact).
  if (printed && printed.trim().length >= 2) {
    const p = normalizeText(printed.replace(/^\s*(rm|myr)\s*/i, ""));
    return p.length >= 2 ? normalizedPage.includes(p) : null;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return null; // dates are re-formatted by the reader
  if (typeof value === "number") {
    const text = stripThousands(pageText);
    const forms = new Set([value.toFixed(2), String(value), value.toFixed(1)]);
    return [...forms].some((f) => new RegExp(`(^|[^\\d.])${f.replace(".", "\\.")}(?!\\d)`).test(text));
  }
  if (typeof value === "string" && value.trim().length >= 3) return normalizedPage.includes(normalizeText(value.replace(/^\s*(rm|myr)\s*/i, "")));
  return null;
}

export function buildReport(params: {
  parsed: Json;
  kind: string;
  inspected: Inspected;
  model: string | null;
}): { extracted: Json; report: ExtractionReport } {
  const { parsed, kind, inspected, model } = params;
  const wrapped = isObject(parsed.data);
  const data: Json = wrapped ? { ...(parsed.data as Json) } : { ...parsed };
  const fieldMeta: Record<string, Meta> = isObject(parsed.field_meta) ? (parsed.field_meta as Record<string, Meta>) : {};
  const issues: string[] = Array.isArray(parsed.issues) ? parsed.issues.filter((i): i is string => typeof i === "string" && i.trim().length > 0) : [];
  issues.push(...inspected.warnings);

  // A supplier invoice is saved exactly as printed: the reader's copy of names, codes and numbers is replaced by the file's own
  // characters, and anything that cannot be found in the file as written is flagged instead of being trusted.
  if ((kind === "supplier_invoice" || kind === "ai_invoice") && hasSourceText(inspected)) {
    const snap = (value: unknown, label: string): unknown => {
      if (typeof value !== "string" || !value.trim()) return value;
      const { text, found } = snapToSource(value, inspected);
      if (!found && value.replace(/\s+/g, "").length >= 3) issues.push(`${label} "${value}" was not found exactly as written in the file. Check it against the original.`);
      return found ? text : value;
    };
    data.supplier_name = snap(data.supplier_name, "The supplier name");
    data.invoice_number = snap(data.invoice_number, "The invoice number");
    if (Array.isArray(data.items)) {
      data.items = data.items.map((it, n) => {
        if (!isObject(it)) return it;
        if (kind === "ai_invoice") return { ...it, description: snap(it.description, `Line ${n + 1} description`), item_code: snap(it.item_code, `Line ${n + 1} item code`) };
        return { ...it, item_name: snap(it.item_name, `Line ${n + 1} description`), item_code: snap(it.item_code, `Line ${n + 1} item code`) };
      });
    }
  }
  if (!wrapped) issues.push("The reader did not return confidence details for this file, so every field should be checked.");

  const detected = typeof parsed.document_type === "string" && (DOCUMENT_TYPES as readonly string[]).includes(parsed.document_type) ? (parsed.document_type as DocumentType) : "other";
  const expected = EXPECTED_TYPES[kind];
  const typeWarning =
    expected && wrapped && !expected.includes(detected) && detected !== "other"
      ? `This looks like a ${DOCUMENT_TYPE_LABEL[detected].toLowerCase()}, but this form expects ${expected.map((t) => DOCUMENT_TYPE_LABEL[t].toLowerCase()).join(" / ")}. Some fields may be empty or wrong — check them against the original.`
      : null;
  // The reader's own opinion of legibility is not enough: a measured very small / very blurry image is poor regardless.
  const reported = parsed.legibility === "good" || parsed.legibility === "partial" || parsed.legibility === "poor" ? parsed.legibility : "unknown";
  const legibility: ExtractionReport["legibility"] = inspected.imageQuality?.veryPoor ? "poor" : reported;

  const isSheet = inspected.sheetText !== null;
  const hasTextLayer = isSheet || (inspected.pageTexts !== null && inspected.info.textPages.length > 0);
  const textFor = (page: number | null): string => {
    if (inspected.sheetText) return inspected.sheetText;
    if (!inspected.pageTexts) return "";
    if (page && inspected.pageTexts[page - 1] !== undefined) return inspected.pageTexts[page - 1];
    return inspected.pageTexts.join("\n");
  };

  const pages = (Array.isArray(parsed.pages_read) ? parsed.pages_read : [])
    .filter(isObject)
    .map((p) => ({ page: typeof p.page === "number" ? `Page ${p.page}` : typeof p.page === "string" ? p.page : "", content: typeof p.content === "string" ? p.content : "" }))
    .filter((p) => p.page);
  if (wrapped && inspected.info.kind === "pdf" && inspected.info.pageCount) {
    const reported = new Set(pages.map((p) => pageNumber(sourceLabel(p.page, inspected.info))));
    const missing = Array.from({ length: inspected.info.pageCount }, (_, i) => i + 1).filter((n) => !reported.has(n));
    if (missing.length > 0 && missing.length < inspected.info.pageCount) issues.push(`The reader did not report on page${missing.length === 1 ? "" : "s"} ${missing.join(", ")} — ${missing.length === 1 ? "it" : "they"} may not have been read. Check the original.`);
    else if (missing.length === inspected.info.pageCount) issues.push("The reader did not confirm which pages it looked at, so page coverage is unverified.");
  }

  const fields: ReportField[] = [];
  const tables: ReportTable[] = [];

  for (const [field, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.some(isObject)) {
      const objs = value.filter(isObject);
      const columns = Array.from(new Set(objs.flatMap((o) => Object.keys(o)))).filter((c) => c !== "page");
      tables.push({
        name: field,
        columns,
        rows: objs.map((o) => columns.map((c) => (typeof o[c] === "number" || typeof o[c] === "string" ? (o[c] as string | number) : null))),
        sources: objs.map((o) => sourceLabel(o.page, inspected.info)),
      });
      continue;
    }
    if (isObject(value)) continue;

    const meta = fieldMeta[field] ?? {};
    const hasValue = value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);
    let status: FieldStatus = meta.status === "unreadable" ? "unreadable" : meta.status === "absent" ? "absent" : hasValue ? "found" : meta.status === "found" ? "found" : "absent";
    if (hasValue && status !== "found") status = "found"; // a value was returned, so it was read
    const source = sourceLabel(meta.page, inspected.info);
    const printed = typeof meta.printed === "string" && meta.printed.trim() ? meta.printed.trim() : null;
    let confidence = asConfidence(meta.confidence);
    const notes: string[] = typeof meta.note === "string" && meta.note.trim() ? [meta.note.trim()] : [];
    let needsReview = false;

    if (status === "unreadable") {
      confidence = confidence ?? "low";
      needsReview = true;
      if (notes.length === 0) notes.push("Present in the document but could not be read reliably.");
    } else if (status === "absent") {
      confidence = null;
    } else {
      if (!confidence) {
        confidence = "medium";
        notes.push("The reader gave no confidence for this value.");
      }
      // Cross-check against the PDF's embedded text where there is one.
      if (hasTextLayer && CHECKABLE_FIELD.test(field)) {
        const p = pageNumber(source);
        const pageHasText = isSheet || (p ? inspected.info.textPages.includes(p) : true);
        if (pageHasText) {
          let present = valueInText(value, printed, textFor(p));
          if (present === false && p && !isSheet && valueInText(value, printed, textFor(null)) === true) {
            // The reader may have named the wrong page: look through the whole document before doubting the value.
            present = true;
            notes.push(`Found in the document's text, but not on ${source}.`);
          }
          if (present === false) {
            confidence = "low";
            notes.push(`This value was not found in the ${isSheet ? "spreadsheet's" : "PDF's"} own text — check it against the original.`);
          }
        }
      }
      if (confidence === "low") needsReview = true;
    }

    const display = status === "absent" ? "Not found" : status === "unreadable" ? "Needs review" : printed ?? (typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : String(value));
    fields.push({
      field,
      label: typeof meta.label === "string" && meta.label.trim() && status === "found" ? meta.label.trim() : null,
      display,
      value: status === "found" ? (typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : display) : null,
      status,
      source,
      confidence,
      notes,
      needsReview,
    });
  }

  // A very poor image: nothing it "says" can be trusted. A low-resolution one: nothing is better than "medium".
  const lowRes = inspected.warnings.some((w) => /^Low-resolution|looks soft or blurry/.test(w));
  for (const f of fields) {
    if (f.status !== "found") continue;
    if (legibility === "poor") {
      f.confidence = "low";
      f.needsReview = true;
      f.notes.push("The image quality is poor — this value may be wrong.");
    } else if (lowRes && f.confidence === "high") {
      f.confidence = "medium";
      f.notes.push("Low-resolution image.");
    }
  }

  // Spreadsheets: also show the sheet's own rows exactly as in the file, so completeness never depends on the AI reader.
  for (const g of inspected.grids ?? []) {
    tables.push({ name: `${g.name} (rows as in the file)`, columns: g.columns, rows: g.rows, sources: g.rows.map(() => g.name) });
  }

  // Figures check — never changes a value.
  const totals = isObject(parsed.totals) ? parsed.totals : {};
  const items = Array.isArray(data.items) ? data.items.filter(isObject) : [];
  // Only figures that are really on the document may be used to "check" it: a total the reader worked out itself, or one
  // that is not in the document's text, would make the check meaningless.
  const stated = (printedFigure: unknown, fieldValue: unknown, fieldName: string): unknown => {
    const candidate = printedFigure ?? fieldValue;
    if (candidate === null || candidate === undefined) return null;
    const f = fields.find((x) => x.field === fieldName);
    if (printedFigure == null && f && f.status === "found" && f.confidence === "low") return null;
    if (hasTextLayer && valueInText(candidate, null, textFor(null)) === false) {
      issues.push(`The ${fieldName.replace(/_/g, " ")} the reader reported (${String(candidate)}) is not in the document's text, so it was not used for the figure checks.`);
      return null;
    }
    return candidate;
  };
  const validation = validateFigures({
    items,
    stated: {
      subtotal: stated(totals.subtotal, data.subtotal, "subtotal"),
      tax: stated(totals.tax, data.tax_amount, "tax_amount"),
      total: stated(totals.total, data.total_amount, "total_amount"),
    },
    amount: data.amount ?? data.total_amount ?? data.cost ?? null,
  });

  // Existing module forms read the flat data: hand them the same shape as before (without the extra per-line keys).
  const extracted: Json = { ...data };
  // the AI invoice reader keeps every per-line key (page, line total) for its own review screen
  if (kind !== "auto" && kind !== "ai_invoice" && Array.isArray(extracted.items)) {
    extracted.items = extracted.items.map((it) => {
      if (!isObject(it)) return it;
      const { page: _page, line_total: lineTotal, ...rest } = it;
      void _page;
      // a supplier invoice is saved exactly as printed, so its form also gets the amount printed for each line
      return kind === "supplier_invoice" ? { ...rest, line_total: lineTotal } : rest;
    });
  }

  // Too poor to trust: show what was seen as suggestions only, and do not pre-fill the form with it.
  const valuesWithheld = legibility === "poor";
  if (valuesWithheld) {
    for (const key of Object.keys(extracted)) extracted[key] = Array.isArray(extracted[key]) ? [] : null;
    issues.push("The image quality is too poor to trust, so nothing was filled into the form. The values listed here are only suggestions — type the correct ones from the original, or upload a clearer copy.");
  }

  const needsReview =
    fields.some((f) => f.needsReview) || issues.length > 0 || validation.some((c) => !c.ok) || !!typeWarning || legibility === "poor" || legibility === "partial";

  return {
    extracted,
    report: {
      documentType: detected,
      documentTypeLabel: DOCUMENT_TYPE_LABEL[detected],
      typeWarning,
      legibility,
      inspection: inspected.info,
      fields,
      tables,
      pages,
      issues,
      validation,
      needsReview,
      valuesWithheld,
      model,
    },
  };
}
