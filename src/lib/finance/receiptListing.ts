/**
 * Reads the AutoCount "AR Receive Payment (Multi-Currency) Audit Trail Listing" PDF: one block per receipt (OR) with the date,
 * the receipt number as printed, the debtor's account code and name, the amount and the bank account it went into.
 *
 * AutoCount prints the Doc No column narrow, so a receipt number is often cut short on the PDF ("OR-KI2611/0" for
 * OR-KI2611/012). The listing does not say which invoices a receipt paid; that is matched in the app.
 */

export type ListingReceipt = {
  /** 1-based position in the file, used as the key on the review screen */
  line: number;
  /** yyyy-mm-dd */
  date: string;
  /** the receipt number exactly as printed (may be cut short by AutoCount) */
  docNo: string;
  /** true when AutoCount cut the number short (it ends right after the "/") */
  docNoCut: boolean;
  accountCode: string;
  customerName: string;
  currency: string;
  /** in RM (the Local Credit column) */
  amount: number;
  /** the bank / cash account the money went into, e.g. "310-1000 MAYBANK" */
  bankAccount: string | null;
};

export type ParsedListing = {
  companyName: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  receipts: ListingReceipt[];
  /** the report's own grand total (Summary ... Total), to check nothing was missed */
  reportTotal: number | null;
  /** receipts of RM 0.00 (AutoCount keeps cancelled / zero ones), skipped */
  zeroSkipped: number;
};

const money = (s: string) => Number(s.replace(/,/g, ""));
const isoDate = (dmy: string) => {
  const [d, m, y] = dmy.split("/");
  return `${y}-${m}-${d}`;
};

const HEADER_LINE = [
  /^Date\s*:\s*\d{2}\/\d{2}\/\d{4}/i,
  /^AR Receive Payment/i,
  /^Report From/i,
  /\bPage \d+ of \d+\s*$/i,
  /^Date Doc No Acc/i,
];

export function looksLikeReceiptListing(text: string): boolean {
  return /AR Receive Payment/i.test(text) && /\b\d{2}\/\d{2}\/\d{4}\s+OR-/i.test(text);
}

export function parseReceiptListing(pageTexts: string[]): ParsedListing {
  const all = pageTexts.join("\n");
  const period = all.match(/Report From\s*:\s*(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/i);
  const companyLine = all.split("\n").find((l) => /\bPage \d+ of \d+\s*$/i.test(l));
  const companyName = companyLine ? companyLine.replace(/\(.*$/, "").replace(/\bPage \d+ of \d+\s*$/i, "").trim() || null : null;

  // the receipts part ends where the summary starts
  const body = all.split(/Summary AR Receive Payment/i)[0];
  const summary = all.split(/Summary AR Receive Payment/i)[1] ?? "";
  const totals = [...summary.matchAll(/Total:\s*([\d,]+\.\d{2})/gi)];
  const reportTotal = totals.length ? money(totals[totals.length - 1][1]) : null;

  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !HEADER_LINE.some((re) => re.test(l)));

  // group the lines into one block per receipt: a block starts with "dd/mm/yyyy <Doc No> <Acc. No>"
  const START = /^(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+(\d{3}-[A-Z0-9]{3,5})\s+(.*)$/i;
  const blocks: string[][] = [];
  for (const l of lines) {
    if (START.test(l)) blocks.push([l]);
    else if (blocks.length) blocks[blocks.length - 1].push(l);
  }

  const receipts: ListingReceipt[] = [];
  let zeroSkipped = 0;
  for (const block of blocks) {
    const realLines = block.filter((l) => !/^Total:/i.test(l));
    // the debtor line can wrap ("PERSATUAN BOLA SEPAK NEGERI" / "JOHOR (PBNJ)" / "MYR 1 7,290.00 7,290.00"): join until the currency
    const bankIdx = realLines.findIndex((l, i) => i > 0 && /^\d{3}-\d{4}\s/.test(l));
    const debtorText = (bankIdx > 0 ? realLines.slice(0, bankIdx) : realLines).join(" ").replace(/\s+/g, " ");
    const m = debtorText.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+(\d{3}-[A-Z0-9]{3,5})\s+(.+?)\s+([A-Z]{3})\s+([\d.]+)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?/i,
    );
    if (!m) continue;
    const [, dmy, docNo, accountCode, name, currency, , credit, localCredit] = m;
    const amount = money(localCredit ?? credit);
    if (!(amount > 0)) {
      zeroSkipped++;
      continue;
    }
    let bankAccount: string | null = null;
    if (bankIdx > 0) {
      const bankLine = realLines[bankIdx];
      const code = bankLine.match(/^(\d{3}-\d{4})\s+(.*)$/);
      if (code) {
        // "310-1000 MAYBANK NEGERI SEMBILAN FC SDN BHD 530.00 530.00": the account name is what comes before the trans. description
        let rest = code[2].replace(/(\s+[\d,]+\.\d{2})+\s*$/, "");
        const at = rest.toUpperCase().indexOf(name.toUpperCase().slice(0, 12));
        if (at > 0) rest = rest.slice(0, at);
        bankAccount = `${code[1]} ${rest.trim()}`.trim();
      }
    }
    receipts.push({
      line: receipts.length + 1,
      date: isoDate(dmy),
      docNo,
      docNoCut: /\/\d?$/.test(docNo),
      accountCode: accountCode.toUpperCase(),
      customerName: name.trim(),
      currency: currency.toUpperCase(),
      amount,
      bankAccount,
    });
  }

  return {
    companyName,
    periodFrom: period ? isoDate(period[1]) : null,
    periodTo: period ? isoDate(period[2]) : null,
    receipts,
    reportTotal,
    zeroSkipped,
  };
}
