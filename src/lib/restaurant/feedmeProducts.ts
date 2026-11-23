import * as XLSX from "xlsx";
import { FEEDME_MERCHANT, cellText, numberOf } from "@/lib/restaurant/feedme";

/**
 * Reads the product names of a FeedMe Excel so a menu item can carry the name FeedMe uses (read only). Two shapes are understood:
 *  - the Overview file: the sheet "Top Products" (Name | Value = how many were sold; FeedMe lists only the top ones);
 *  - a product / menu list: a sheet whose header row has a Product / Item / Name column (and, when there, Price, Category and Quantity columns).
 * The file is untrusted: only names, an optional price, category and quantity are read. A file that says it is for another merchant is refused.
 */
export type FeedMeProduct = { name: string; qty: number | null; price: number | null; category: string | null };
export type FeedMeProductsParse = { ok: true; products: FeedMeProduct[]; source: string; warning: string | null } | { ok: false; error: string };

const MAX_PRODUCTS = 600;
export const productKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

function rowsOf(wb: XLSX.WorkBook, name: string): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
}

export function parseFeedMeProducts(bytes: Uint8Array): FeedMeProductsParse {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: false, error: "This is not an Excel (.xlsx) file." };
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
  } catch {
    return { ok: false, error: "The Excel file could not be read. Download it again from FeedMe." };
  }
  if (wb.SheetNames.length > 40) return { ok: false, error: "This file has too many sheets to be a FeedMe file." };

  // a merchant line, when the file has one, must be Restoran Bara
  let merchant = "";
  for (const n of wb.SheetNames.slice(0, 4)) {
    for (const r of rowsOf(wb, n).slice(0, 10)) {
      const t = cellText(r[0]);
      if (!merchant && /^merchant\s*:/i.test(t)) merchant = t.replace(/^merchant\s*:/i, "").trim();
    }
  }
  if (merchant && merchant.toLowerCase() !== FEEDME_MERCHANT.toLowerCase()) return { ok: false, error: `This file is for "${merchant.slice(0, 80)}", not for ${FEEDME_MERCHANT}. Nothing was read from it.` };

  const products = new Map<string, FeedMeProduct>();
  let source = "";
  const add = (name: string, qty: number | null, price: number | null, category: string | null) => {
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!clean || products.size >= MAX_PRODUCTS) return;
    const k = productKey(clean);
    if (!k) return;
    const cur = products.get(k);
    if (cur) cur.qty = qty === null ? cur.qty : (cur.qty ?? 0) + qty;
    else products.set(k, { name: clean, qty, price, category });
  };

  // 1) a product list: any sheet with a header row that has a product-like column
  for (const n of wb.SheetNames) {
    if (/top\s*products/i.test(n)) continue;
    const rows = rowsOf(wb, n);
    const at = rows.findIndex((r) => r.some((c) => /^(product|product name|item|item name|menu|menu item|name)$/i.test(cellText(c))) && r.filter((c) => cellText(c) !== "").length >= 2);
    if (at < 0) continue;
    const header = rows[at].map((c) => cellText(c).toLowerCase());
    const nameCol = header.findIndex((h) => /^(product|product name|item|item name|menu|menu item|name)$/.test(h));
    const priceCol = header.findIndex((h) => /price/.test(h));
    const catCol = header.findIndex((h) => /category|group/.test(h));
    const qtyCol = header.findIndex((h) => /^(qty|quantity|count|sold|value)$/.test(h));
    // a plain "Name | Value" sheet is one of the Overview figures (Sales, Bill Count ...), not a product list
    if (header[nameCol] === "name" && priceCol < 0 && catCol < 0) continue;
    for (const r of rows.slice(at + 1)) {
      const name = cellText(r[nameCol]);
      if (!name) continue;
      const price = priceCol >= 0 ? numberOf(r[priceCol]) : null;
      add(name, qtyCol >= 0 ? numberOf(r[qtyCol]) : null, price !== null && price >= 0 ? Math.round(price * 100) / 100 : null, catCol >= 0 ? cellText(r[catCol]) || null : null);
    }
    if (products.size > 0) {
      source = `the sheet "${n}"`;
      break;
    }
  }
  // 2) the Overview: Top Products
  if (products.size === 0) {
    const top = wb.SheetNames.find((n) => /top\s*products/i.test(n));
    if (top) {
      const rows = rowsOf(wb, top);
      const at = rows.findIndex((r) => cellText(r[0]).toLowerCase() === "name");
      for (const r of at >= 0 ? rows.slice(at + 1) : []) add(cellText(r[0]), numberOf(r[1]), null, null);
      if (products.size > 0) source = `the sheet "${top}"`;
    }
  }
  if (products.size === 0) return { ok: false, error: "No product names were found in this file. Use the Overview file (sheet Top Products) or a product list with a Product / Item / Name column." };
  const warning = merchant ? null : "This file has no Merchant line, so it could not be checked to be from Restoran Bara. Check the names before linking them.";
  return { ok: true, products: Array.from(products.values()), source, warning };
}
