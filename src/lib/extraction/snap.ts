import type { Inspected } from "./inspect";

/** Whitespace and case do not count when two texts are compared; everything else (letters, digits, punctuation) does. */
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Whether the file has text of its own to check a value against (spreadsheet cells or a PDF text layer). */
export function hasSourceText(inspected: Inspected): boolean {
  return (inspected.grids ?? []).length > 0 || (inspected.pageTexts ?? []).some((t) => t.trim().length > 0);
}

/**
 * The AI reader sometimes tidies what it copies (a double space dropped, a capital changed, a bracket moved). A document that
 * is saved exactly as printed cannot rely on that, so the reader's text is looked up in the file itself and replaced by the
 * file's own characters. Nothing is ever invented: a text that is not in the file under this comparison is returned unchanged
 * and reported as not found.
 */
export function snapToSource(value: string, inspected: Inspected): { text: string; found: boolean } {
  const wanted = squash(value);
  if (wanted.length < 3) return { text: value, found: false };

  // spreadsheets: a cell with the same text
  for (const g of inspected.grids ?? []) {
    for (const row of g.rows) {
      for (const cell of row) {
        const t = cell.trim();
        if (t && squash(t) === wanted) return { text: t, found: true };
      }
    }
  }

  // PDFs with a text layer: the same characters in the page text, on word boundaries
  for (const page of inspected.pageTexts ?? []) {
    if (!page.trim()) continue;
    const map: number[] = [];
    let flat = "";
    for (let i = 0; i < page.length; i++) {
      if (/\s/.test(page[i])) continue;
      flat += page[i].toLowerCase();
      map.push(i);
    }
    let from = 0;
    for (;;) {
      const at = flat.indexOf(wanted, from);
      if (at < 0) break;
      const start = map[at];
      const end = map[at + wanted.length - 1] + 1;
      const before = page[start - 1];
      const after = page[end];
      if (!(isWordChar(before) && isWordChar(page[start])) && !(isWordChar(after) && isWordChar(page[end - 1]))) {
        return { text: page.slice(start, end).replace(/\s*[\r\n]+\s*/g, " ").trim(), found: true };
      }
      from = at + 1;
    }
  }
  return { text: value, found: false };
}
