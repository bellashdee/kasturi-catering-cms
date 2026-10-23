import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type PurchaseLine = {
  id: string;
  companyId: string;
  companyName: string;
  supplierId: string;
  supplierName: string;
  docNo: string;
  docDate: string;
  itemCode: string | null;
  description: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type LineFilters = {
  supplierIds?: string[];
  /** YYYY-MM-DD */
  from?: string;
  to?: string;
};

const PAGE = 1000;

/** The purchase lines of the given companies, every page (the database returns at most 1000 rows per request). */
export async function listPurchaseLines(supabase: DB, companyIds: string[], filters: LineFilters = {}): Promise<PurchaseLine[]> {
  if (companyIds.length === 0) return [];
  const out: PurchaseLine[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let query = supabase
      .from("supplier_purchase_lines")
      .select("id, company_id, supplier_id, doc_no, doc_date, item_code, description, uom, quantity, unit_price, line_amount, companies(name), suppliers(name)")
      .in("company_id", companyIds)
      .order("doc_date", { ascending: false })
      .order("doc_no", { ascending: false })
      .order("line_no")
      .range(offset, offset + PAGE - 1);
    if (filters.supplierIds) query = query.in("supplier_id", filters.supplierIds);
    if (filters.from) query = query.gte("doc_date", filters.from);
    if (filters.to) query = query.lte("doc_date", filters.to);
    const { data, error } = await query;
    if (error) throw error;
    for (const r of data ?? []) {
      out.push({
        id: r.id,
        companyId: r.company_id,
        companyName: r.companies?.name ?? "",
        supplierId: r.supplier_id,
        supplierName: r.suppliers?.name ?? "",
        docNo: r.doc_no,
        docDate: r.doc_date,
        itemCode: r.item_code,
        description: r.description,
        uom: r.uom ?? "",
        quantity: Number(r.quantity),
        unitPrice: Number(r.unit_price),
        amount: Number(r.line_amount),
      });
    }
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

export const normaliseName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type SupplierItem = {
  key: string;
  itemCode: string | null;
  description: string;
  uom: string;
  /** the most recent price paid per unit (per this UOM) and its date */
  latestPrice: number;
  latestDate: string;
  lowestPrice: number;
  highestPrice: number;
  timesBought: number;
  totalQuantity: number;
  companies: string[];
};

export type SupplierItems = {
  /** one entry per supplier name (the same supplier kept by several companies is one entry) */
  key: string;
  name: string;
  companies: string[];
  items: SupplierItem[];
};

/**
 * What each supplier sold, worked out from the invoice lines: one row per item and unit of measure with the latest price per
 * unit, the lowest and highest price paid, how often it was bought and the total quantity. Suppliers and items are in alphabetical order.
 */
export function summariseSupplierItems(lines: PurchaseLine[]): SupplierItems[] {
  const suppliers = new Map<string, { name: string; companies: Set<string>; items: Map<string, SupplierItem & { companySet: Set<string> }> }>();
  for (const l of lines) {
    const sKey = normaliseName(l.supplierName);
    const sup = suppliers.get(sKey) ?? { name: l.supplierName, companies: new Set<string>(), items: new Map() };
    suppliers.set(sKey, sup);
    sup.companies.add(l.companyName);
    const iKey = `${normaliseName(l.description)}|${l.uom}`;
    const cur = sup.items.get(iKey);
    if (!cur) {
      sup.items.set(iKey, {
        key: iKey,
        itemCode: l.itemCode,
        description: l.description,
        uom: l.uom,
        latestPrice: l.unitPrice,
        latestDate: l.docDate,
        lowestPrice: l.unitPrice,
        highestPrice: l.unitPrice,
        timesBought: 1,
        totalQuantity: l.quantity,
        companies: [],
        companySet: new Set([l.companyName]),
      });
      continue;
    }
    if (l.docDate > cur.latestDate) {
      cur.latestDate = l.docDate;
      cur.latestPrice = l.unitPrice;
      cur.itemCode = l.itemCode ?? cur.itemCode;
    }
    cur.lowestPrice = Math.min(cur.lowestPrice, l.unitPrice);
    cur.highestPrice = Math.max(cur.highestPrice, l.unitPrice);
    cur.timesBought += 1;
    cur.totalQuantity += l.quantity;
    cur.companySet.add(l.companyName);
  }
  return Array.from(suppliers.entries())
    .map(([key, s]) => ({
      key,
      name: s.name,
      companies: Array.from(s.companies).sort(),
      items: Array.from(s.items.values())
        .map(({ companySet, ...item }) => ({ ...item, totalQuantity: Math.round(item.totalQuantity * 10000) / 10000, companies: Array.from(companySet).sort() }))
        .sort((a, b) => a.description.localeCompare(b.description) || a.uom.localeCompare(b.uom)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
