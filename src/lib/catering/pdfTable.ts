import { fieldOfHeader } from "@/lib/catering/eventImport";

/**
 * Reading a table out of a PDF that has a text layer (an event list exported from Excel or Word): every piece of text keeps its position,
 * so the rows are the lines and the columns are found under the header. Nothing is read by AI and nothing is guessed: a scanned PDF (no
 * text) gives no rows and the user is told to use the Excel file instead.
 */

/** One piece of text on a page: its words, left edge, right edge and baseline (PDF points, y grows upwards). */
export type PdfText = { str: string; x: number; right: number; y: number };

type Cell = { text: string; x0: number; x1: number };
type Line = { y: number; items: PdfText[] };

const LINE_TOLERANCE = 3;
const CELL_GAP = 7;
/** How far above or below the main header line the rest of a two- or three-line header can be. */
const HEADER_BAND = 12;

/** The lines of a page, top to bottom; pieces whose baselines are within a few points are on the same line. */
function linesOf(items: PdfText[]): Line[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l.y - item.y) <= LINE_TOLERANCE);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

/** The cells of a line: pieces closer than a small gap belong to the same cell. */
function cellsOf(line: Line): Cell[] {
  const cells: Cell[] = [];
  for (const item of line.items) {
    const last = cells[cells.length - 1];
    if (last && item.x - last.x1 < CELL_GAP) {
      last.text = `${last.text} ${item.str.trim()}`;
      last.x1 = Math.max(last.x1, item.right);
    } else cells.push({ text: item.str.trim(), x0: item.x, x1: item.right });
  }
  return cells;
}

/** Several header lines as one ("Type of" over "Serving" is one header): cells that overlap side to side are joined top to bottom. */
function mergeHeader(lines: Line[]): Cell[] {
  const merged: Cell[] = [];
  for (const cell of lines.flatMap(cellsOf)) {
    const same = merged.find((m) => cell.x0 < m.x1 + 2 && cell.x1 > m.x0 - 2);
    if (same) {
      same.text = `${same.text} ${cell.text}`;
      same.x0 = Math.min(same.x0, cell.x0);
      same.x1 = Math.max(same.x1, cell.x1);
    } else merged.push({ ...cell });
  }
  return merged.sort((a, b) => a.x0 - b.x0);
}

const fieldsIn = (cells: Cell[]) => new Set(cells.map((c) => fieldOfHeader(c.text)).filter(Boolean)).size;
const hasDigits = (line: Line) => line.items.some((i) => /\d/.test(i.str));

/**
 * The header: the line near the top that names the most columns (at least three), with the lines just above and under it that carry the
 * rest of its headers ("Type of" / "Serving"): no numbers and within a few points. A title further up is not part of it.
 */
function findHeader(lines: Line[]): { end: number; cells: Cell[] } | null {
  let main = -1;
  let bestScore = 2;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const score = fieldsIn(cellsOf(lines[i]));
    if (score > bestScore) {
      bestScore = score;
      main = i;
    }
  }
  if (main < 0) return null;
  let start = main;
  while (start > 0 && !hasDigits(lines[start - 1]) && lines[start - 1].y - lines[main].y <= HEADER_BAND) start--;
  let end = main + 1;
  while (end < lines.length && !hasDigits(lines[end]) && lines[main].y - lines[end].y <= HEADER_BAND) end++;
  return { end, cells: mergeHeader(lines.slice(start, end)) };
}

/**
 * The table of the pages as rows of cells, header first, ready for the same column matching as an Excel sheet.
 * - A piece of text belongs to the column whose header it starts after (names start at the left of a wide column, under no header word).
 * - A merged date cell sits in the middle of its rows in a PDF: each row without a date takes the nearest date (by position) above or below.
 * - A line with words in one or two columns only and nothing in the first one continues the row above (a long name on two lines).
 * - Total lines and a header repeated on a later page are left out.
 */
export function tableFromPdfPages(pages: PdfText[][]): string[][] {
  const out: string[][] = [];
  let header: Cell[] | null = null;
  for (const page of pages) {
    const lines = linesOf(page);
    const found = findHeader(lines);
    if (!found && !header) continue;
    if (found) header = found.cells;
    const columns = header!;
    if (out.length === 0) out.push(columns.map((c) => c.text));
    const dateCol = columns.findIndex((c) => fieldOfHeader(c.text) === "eventDate");
    const columnOf = (item: PdfText) => Math.max(0, columns.filter((c) => c.x1 < item.x - 0.5).length - (columns[0] && item.x < columns[0].x0 ? 1 : 0));

    const rows: { y: number; cells: string[] }[] = [];
    const anchors: { y: number; value: string }[] = [];
    for (const line of lines.slice(found ? found.end : 0)) {
      const text = line.items.map((i) => i.str).join(" ");
      if (/\btotal\b/i.test(text)) continue;
      if (fieldsIn(cellsOf(line)) >= 3 && !hasDigits(line)) continue;
      const cells = columns.map(() => "");
      for (const item of line.items) {
        const col = Math.min(columns.length - 1, columnOf(item));
        cells[col] = cells[col] ? `${cells[col]} ${item.str.trim()}` : item.str.trim();
      }
      const filled = cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
      if (dateCol >= 0 && cells[dateCol]) anchors.push({ y: line.y, value: cells[dateCol] });
      // a line that only carries a date is the merged date of the rows around it, not a row of its own
      if (filled.length === 1 && filled[0] === dateCol) continue;
      const previous = rows[rows.length - 1];
      const continues = previous && !cells[0] && filled.length <= 2 && filled.every((i) => i !== dateCol && /[a-z]/i.test(cells[i]));
      if (continues) {
        cells.forEach((c, i) => {
          if (c) previous.cells[i] = previous.cells[i] ? `${previous.cells[i]} ${c}` : c;
        });
      } else rows.push({ y: line.y, cells });
    }
    if (dateCol >= 0 && anchors.length > 0) {
      for (const row of rows) {
        if (row.cells[dateCol]) continue;
        row.cells[dateCol] = anchors.reduce((best, a) => (Math.abs(a.y - row.y) < Math.abs(best.y - row.y) ? a : best)).value;
      }
    }
    out.push(...rows.map((r) => r.cells));
  }
  return out;
}

/** Reads the text of every page of a PDF in the browser (no upload) and returns its table. */
export async function readPdfTable(data: ArrayBuffer): Promise<string[][]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const pages: PdfText[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => "str" in i)
        .map((i) => ({ str: i.str, x: i.transform[4], right: i.transform[4] + i.width, y: i.transform[5] })),
    );
  }
  return tableFromPdfPages(pages);
}
