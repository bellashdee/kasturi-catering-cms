/**
 * Reads staff payslips from an Excel / CSV payroll summary or from payslip PDFs (one payslip per page), in the browser,
 * so the salaries never leave the computer until Finance presses Save. Nothing is guessed: what cannot be read is left
 * blank for Finance to fill in on the preview.
 */
export type PayslipRow = {
  /** "Payroll.xlsx row 5" / "Payslips.pdf page 3" */
  source: string;
  name: string;
  employeeNo: string;
  ic: string;
  basic: number | null;
  gross: number | null;
  deductions: number | null;
  net: number | null;
};

export type StaffOption = { id: string; companyId: string; companyName: string; name: string; employeeNo: string | null; ic: string | null };

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/RM|MYR|,|\s/gi, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Fills what can be worked out from the other figures: deductions = gross − net, gross = net + deductions, gross = basic. */
export function completeFigures(row: PayslipRow): PayslipRow {
  let { gross, deductions } = row;
  const { net, basic } = row;
  if (gross === null && net !== null && deductions !== null) gross = r2(net + deductions);
  if (deductions === null && gross !== null && net !== null) deductions = r2(gross - net);
  if (gross === null && basic !== null) gross = basic;
  if (deductions === null && gross !== null) deductions = 0;
  return { ...row, gross, deductions };
}

// ---------- Excel / CSV ----------

const HEADER_RULES: { key: keyof Omit<PayslipRow, "source">; test: RegExp }[] = [
  { key: "employeeNo", test: /(emp(loyee)?|staff|worker)\s*(no|code|id|#)|^no\.?\s*pekerja|^code$/i },
  { key: "ic", test: /\b(i\/?c|nric|mykad|kad pengenalan|passport)\b/i },
  { key: "name", test: /\bname\b|\bnama\b/i },
  { key: "basic", test: /basic|pokok/i },
  { key: "gross", test: /gross|total\s*(earning|income|pay|wages|gaji)|jumlah\s*(pendapatan|gaji kasar)|gaji kasar/i },
  { key: "deductions", test: /total\s*deduct|jumlah\s*potongan|^deductions?$/i },
  { key: "net", test: /\bnet+\b|bersih|take\s*home/i },
];

/** The column of each field in the header row (the first row that has a name column and a salary column). */
function findHeader(rows: unknown[][]): { index: number; cols: Partial<Record<keyof Omit<PayslipRow, "source">, number>> } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cols: Partial<Record<keyof Omit<PayslipRow, "source">, number>> = {};
    rows[i].forEach((cell, c) => {
      const text = String(cell ?? "").trim();
      if (!text) return;
      for (const rule of HEADER_RULES) {
        if (cols[rule.key] === undefined && rule.test.test(text)) {
          cols[rule.key] = c;
          break;
        }
      }
    });
    if ((cols.name !== undefined || cols.employeeNo !== undefined || cols.ic !== undefined) && (cols.net !== undefined || cols.gross !== undefined || cols.basic !== undefined)) return { index: i, cols };
  }
  return null;
}

export async function readPayslipSpreadsheet(file: File): Promise<{ rows: PayslipRow[]; problems: string[] }> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows: PayslipRow[] = [];
  const problems: string[] = [];
  for (const sheetName of book.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, raw: true, defval: "" }) as unknown[][];
    const header = findHeader(aoa);
    if (!header) continue;
    const { cols } = header;
    const cell = (r: unknown[], k: keyof typeof cols) => (cols[k] === undefined ? "" : r[cols[k]!]);
    for (let i = header.index + 1; i < aoa.length; i++) {
      const r = aoa[i];
      const name = String(cell(r, "name") ?? "").trim();
      const employeeNo = String(cell(r, "employeeNo") ?? "").trim();
      const ic = String(cell(r, "ic") ?? "").trim();
      if (!name && !employeeNo && !ic) continue;
      if (/^(grand\s*)?total|jumlah/i.test(name)) continue; // the total line at the bottom
      rows.push(
        completeFigures({
          source: `${file.name}${book.SheetNames.length > 1 ? ` · ${sheetName}` : ""} row ${i + 1}`,
          name,
          employeeNo,
          ic,
          basic: toNumber(cell(r, "basic")),
          gross: toNumber(cell(r, "gross")),
          deductions: toNumber(cell(r, "deductions")),
          net: toNumber(cell(r, "net")),
        }),
      );
    }
  }
  if (rows.length === 0) problems.push(`${file.name}: no staff rows found. The sheet needs a header row with the staff name (or staff no. / IC) and the salary columns (Gross, Deductions, Net).`);
  return { rows, problems };
}

// ---------- PDF ----------

const AMOUNT = String.raw`(?:RM|MYR)?\s*\(?(-?[\d,]+\.\d{2})\)?`;
const findAmount = (text: string, labels: RegExp[]): number | null => {
  for (const label of labels) {
    const m = new RegExp(`${label.source}[^\\d\\n-]{0,40}?${AMOUNT}`, "i").exec(text);
    if (m) return toNumber(m[1]);
  }
  return null;
};
const findText = (text: string, labels: RegExp[], value: RegExp): string => {
  for (const label of labels) {
    const m = new RegExp(`${label.source}\\s*[:：]?\\s*(${value.source})`, "i").exec(text);
    if (m) return m[1].trim();
  }
  return "";
};

/** One payslip page read from its text. */
export function parsePayslipText(text: string, source: string): PayslipRow | null {
  const t = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const name = findText(t, [/employee\s*name/, /staff\s*name/, /\bname\b/, /\bnama\b/], /[A-Z][A-Z@'./() -]{2,60}?(?=\s{2,}|\n|\s+(?:I\/?C|NRIC|IC\s*No|Emp|Staff|Employee|Dept|Department|Position|Designation|Jawatan|No\.|Passport|$))/);
  const employeeNo = findText(t, [/emp(?:loyee)?\s*(?:no|code|id)\.?/, /staff\s*(?:no|id)\.?/, /no\.?\s*pekerja/], /[A-Z0-9-]{2,20}/);
  const ic = findText(t, [/i\/?c\s*(?:no)?\.?/, /nric/, /no\.?\s*k\/?p/, /passport\s*(?:no)?\.?/], /[A-Z0-9-]{6,20}/);
  const row = completeFigures({
    source,
    name: name.replace(/\s+/g, " ").trim(),
    employeeNo,
    ic,
    basic: findAmount(t, [/basic\s*(?:pay|salary|rate)?/, /gaji\s*pokok/]),
    gross: findAmount(t, [/gross\s*(?:pay|salary|wages|income)?/, /total\s*(?:earnings?|income|additions?)/, /jumlah\s*(?:pendapatan|gaji\s*kasar)/]),
    deductions: findAmount(t, [/total\s*deductions?/, /jumlah\s*potongan/]),
    net: findAmount(t, [/net+\s*(?:pay|salary|wages|amount)?/, /gaji\s*bersih/, /take\s*home\s*pay/]),
  });
  if (!row.name && !row.employeeNo && !row.ic) return null;
  if (row.net === null && row.gross === null) return null;
  return row;
}

export async function readPayslipPdf(file: File): Promise<{ rows: PayslipRow[]; problems: string[] }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: false });
  const rows: PayslipRow[] = [];
  const problems: string[] = [];
  text.forEach((pageText, i) => {
    const row = parsePayslipText(pageText, `${file.name} page ${i + 1}`);
    if (row) rows.push(row);
    else if (pageText.trim().length > 0) problems.push(`${file.name} page ${i + 1}: the staff name or the salary could not be read on this page.`);
    else problems.push(`${file.name} page ${i + 1}: no text on this page (it may be a scan or photo). Use the Excel payroll summary instead, or key it in.`);
  });
  return { rows, problems };
}

// ---------- matching the staff ----------

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const nameKey = (s: string | null | undefined) =>
  (s ?? "")
    .toUpperCase()
    .replace(/\b(BIN|BINTI|BT|BTE|A\/L|A\/P|AL|AP)\b/g, " ")
    .replace(/[^A-Z]/g, "");

/** The staff record a payslip belongs to: by IC, then staff no., then the exact name, then a name that contains the other. */
export function matchStaff(row: PayslipRow, staff: StaffOption[]): string | null {
  const ic = digits(row.ic);
  if (ic.length >= 6) {
    const hit = staff.filter((s) => digits(s.ic) === ic);
    if (hit.length === 1) return hit[0].id;
  }
  const no = row.employeeNo.trim().toUpperCase();
  if (no) {
    const hit = staff.filter((s) => (s.employeeNo ?? "").trim().toUpperCase() === no);
    if (hit.length === 1) return hit[0].id;
  }
  const key = nameKey(row.name);
  if (key.length >= 4) {
    const exact = staff.filter((s) => nameKey(s.name) === key);
    if (exact.length === 1) return exact[0].id;
    const partial = staff.filter((s) => {
      const k = nameKey(s.name);
      return k.length >= 4 && (k.includes(key) || key.includes(k));
    });
    if (partial.length === 1) return partial[0].id;
  }
  return null;
}
