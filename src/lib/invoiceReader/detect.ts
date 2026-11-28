/**
 * Works out what a file really is from its bytes (magic numbers / container contents), not from its name. Pure: runs in
 * the browser (before upload) and on the server (before reading).
 */

export type InvoiceFormat = "pdf" | "image" | "xml" | "excel" | "csv" | "word" | "word_legacy" | "unsupported";

export type Detected = {
  format: InvoiceFormat;
  mime: string;
  /** what the name says, when it disagrees with the content */
  extensionMismatch: string | null;
  label: string;
};

/** the documents.file_type value used to store the file */
export const STORAGE_FILE_TYPE: Record<InvoiceFormat, "pdf" | "photo" | "text" | "excel" | "csv" | "word" | "other"> = {
  pdf: "pdf",
  image: "photo",
  xml: "text",
  excel: "excel",
  csv: "csv",
  word: "word",
  word_legacy: "word",
  unsupported: "other",
};

export const FORMAT_LABEL: Record<InvoiceFormat, string> = {
  pdf: "PDF",
  image: "Photo / screenshot",
  xml: "XML e-invoice",
  excel: "Excel",
  csv: "CSV",
  word: "Word (DOCX)",
  word_legacy: "Word 97-2003 (DOC)",
  unsupported: "Unsupported file",
};

export const INVOICE_FILE_ACCEPT = "application/pdf,image/*,.xml,text/xml,application/xml,.xlsx,.xls,.csv,.docx,.doc";

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < Math.min(to, b.length); i++) s += String.fromCharCode(b[i]);
  return s;
}

/** names of the entries in a ZIP file's central directory (enough to tell DOCX from XLSX) */
function zipEntryNames(b: Uint8Array): string[] {
  const names: string[] = [];
  // local file headers: PK\x03\x04, name length at +26, extra length at +28, name at +30
  let i = 0;
  let guard = 0;
  while (i + 30 < b.length && guard++ < 400) {
    if (!(b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x03 && b[i + 3] === 0x04)) break;
    const compressed = b[i + 18] | (b[i + 19] << 8) | (b[i + 20] << 16) | (b[i + 21] << 24);
    const nameLen = b[i + 26] | (b[i + 27] << 8);
    const extraLen = b[i + 28] | (b[i + 29] << 8);
    names.push(ascii(b, i + 30, i + 30 + nameLen));
    const flags = b[i + 6] | (b[i + 7] << 8);
    if (flags & 0x08) {
      // sizes are after the data: fall back to scanning the whole file for names
      return scanNames(b);
    }
    i = i + 30 + nameLen + extraLen + (compressed >>> 0);
  }
  return names.length ? names : scanNames(b);
}

function scanNames(b: Uint8Array): string[] {
  const text = ascii(b, 0, b.length);
  const found = new Set<string>();
  for (const m of text.matchAll(/(word\/document\.xml|xl\/workbook\.xml|ppt\/presentation\.xml)/g)) found.add(m[1]);
  return [...found];
}

/** an old Office (OLE2 compound) file: is it a Word document or an Excel workbook? */
function oleKind(b: Uint8Array): "word" | "excel" | null {
  // directory entry names are UTF-16LE
  const text = ascii(b, 0, Math.min(b.length, 4 * 1024 * 1024)).replace(/\0/g, "");
  if (/WordDocument/.test(text)) return "word";
  if (/Workbook|Book/.test(text)) return "excel";
  return null;
}

function looksLikeText(b: Uint8Array): boolean {
  const n = Math.min(b.length, 2048);
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32)) bad++;
  }
  return bad / Math.max(n, 1) < 0.02;
}

export function detectFormat(bytes: Uint8Array, filename: string): Detected {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const result = (format: InvoiceFormat, mime: string): Detected => {
    const expected: Record<InvoiceFormat, string[]> = {
      pdf: ["pdf"],
      image: ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"],
      xml: ["xml"],
      excel: ["xlsx", "xls", "xlsm"],
      csv: ["csv", "txt"],
      word: ["docx"],
      word_legacy: ["doc"],
      unsupported: [],
    };
    const mismatch = ext && format !== "unsupported" && !expected[format].includes(ext) ? `The file is named .${ext} but it is really a ${FORMAT_LABEL[format]} file.` : null;
    return { format, mime, extensionMismatch: mismatch, label: FORMAT_LABEL[format] };
  };

  if (bytes.length === 0) return result("unsupported", "application/octet-stream");
  if (ascii(bytes, 0, 1024).includes("%PDF-")) return result("pdf", "application/pdf");
  if (starts(bytes, [0xff, 0xd8, 0xff])) return result("image", "image/jpeg");
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47])) return result("image", "image/png");
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) return result("image", "image/gif");
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return result("image", "image/webp");
  if (starts(bytes, [0x66, 0x74, 0x79, 0x70], 4) && /heic|heix|mif1|heif/.test(ascii(bytes, 8, 12))) return result("image", "image/heic");
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const names = zipEntryNames(bytes);
    if (names.some((n) => n.startsWith("word/"))) return result("word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    if (names.some((n) => n.startsWith("xl/"))) return result("excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return result("unsupported", "application/zip");
  }
  if (starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const kind = oleKind(bytes);
    if (kind === "word") return result("word_legacy", "application/msword");
    if (kind === "excel") return result("excel", "application/vnd.ms-excel");
    return result("unsupported", "application/x-ole-storage");
  }
  if (looksLikeText(bytes)) {
    const head = ascii(bytes, 0, 4096).replace(/^﻿|^ï»¿/, "").trimStart();
    if (head.startsWith("<?xml") || /^<([A-Za-z_][\w.-]*:)?(Invoice|CreditNote|DebitNote)\b/.test(head)) return result("xml", "application/xml");
    if (head.startsWith("<")) return result("xml", "application/xml");
    if (ext === "csv" || head.split("\n").slice(0, 5).every((l) => l.includes(","))) return result("csv", "text/csv");
  }
  return result("unsupported", "application/octet-stream");
}

/** SHA-256 of the file, hex: the fingerprint used to spot the same file uploaded twice. Works in the browser and in Node. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
