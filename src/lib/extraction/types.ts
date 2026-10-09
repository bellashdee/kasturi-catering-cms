export type Confidence = "high" | "medium" | "low";
export type FieldStatus = "found" | "absent" | "unreadable";

export type ReportField = {
  field: string;
  /** What to show: the value, "Not found" (absent) or "Needs review" (present but unreadable). */
  display: string;
  value: string | number | boolean | null;
  status: FieldStatus;
  /** The label printed next to the value on the document (lets a reviewer spot a value read from the wrong line). */
  label: string | null;
  /** "Page 2" / sheet name; null when the reader did not say. */
  source: string | null;
  /** null when the field is absent (nothing was read, so there is nothing to rate). */
  confidence: Confidence | null;
  notes: string[];
  needsReview: boolean;
};

export type ReportTable = {
  name: string;
  columns: string[];
  rows: (string | number | null)[][];
  /** Source page of each row, same order as rows. */
  sources: (string | null)[];
};

export type ValidationCheck = { name: string; ok: boolean; detail: string };

export type FileInspection = {
  kind: "pdf" | "image" | "spreadsheet";
  pageCount: number | null;
  /** PDF pages that carry real embedded text. */
  textPages: number[];
  /** PDF pages that are images only (scans/photos) and are read visually (OCR by the AI reader). */
  scannedPages: number[];
  sheets?: { name: string; rows: number; truncated: boolean }[];
  summary: string;
};

export type ExtractionReport = {
  documentType: string;
  documentTypeLabel: string;
  /** Set when the detected type is not what the form expected. */
  typeWarning: string | null;
  legibility: "good" | "partial" | "poor" | "unknown";
  inspection: FileInspection;
  fields: ReportField[];
  tables: ReportTable[];
  /** What the reader says is on each page / sheet — lets a reviewer see every page was looked at. */
  pages: { page: string; content: string }[];
  issues: string[];
  validation: ValidationCheck[];
  needsReview: boolean;
  /** True when the file was too poor to trust and nothing was pre-filled into the form. */
  valuesWithheld: boolean;
  model: string | null;
};

export type ExtractionErrorBody = {
  error: string;
  code: string;
  reason: string;
  recovery: string;
  page?: number;
};
