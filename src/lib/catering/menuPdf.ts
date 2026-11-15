/**
 * The menu of an event read from its final quotation / invoice (the PDF saved from AutoCount). The PDF's text is read in the browser
 * (no upload needed for that); the AI only picks the dishes out of that text. A scanned PDF has no text and is refused.
 */

export type MenuSection = {
  /** what the document calls this part ("Day 1 - Lunch", "Hi-Tea"), as printed */
  label: string | null;
  /** YYYY-MM-DD when the document prints a date for this part */
  date: string | null;
  pax: number | null;
  /** the dishes, one per entry, as printed */
  items: string[];
};

export type MenuFromPdf = { documentType: string | null; documentNumber: string | null; sections: MenuSection[] };

/** The text of every page, line by line top to bottom (pieces on the same baseline are one line). */
export async function readPdfLines(data: ArrayBuffer): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const out: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const pieces = content.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i && !!(i as { str: string }).str.trim())
      .map((i) => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; parts: { str: string; x: number }[] }[] = [];
    for (const p of pieces) {
      const line = lines.find((l) => Math.abs(l.y - p.y) <= 3);
      if (line) line.parts.push(p);
      else lines.push({ y: p.y, parts: [p] });
    }
    for (const l of lines.sort((a, b) => b.y - a.y)) out.push(l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join("  "));
  }
  return out;
}

/** The menu lines as the event's menu text: one dish on each line. */
export function menuText(items: string[]): string {
  return items.map((i) => i.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}
