import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { loadSupplierItemOptions } from "@/lib/purchasePlanner/data";
import { quantityInUom, rankSupplierItems, type SupplierItemOption } from "@/lib/purchasePlanner/shared";
import { display, formatQty, type Base } from "./units";
import type { ConsolRow, Lang } from "./types";

type DB = SupabaseClient<Database>;

export type PurchaseLine = {
  ingredient: string;
  item: string;
  uom: string;
  /** null when the supplier sells it in a unit that cannot be worked out exactly from the recipe: the person enters it */
  qty: number | null;
  price: number;
  amount: number | null;
  needed: string;
  estimate: boolean;
};
export type PurchaseGroup = { supplier: string; lines: PurchaseLine[]; total: number };
export type PurchasePlan = {
  groups: PurchaseGroup[];
  unassigned: { ingredient: string; needed: string; reason: string }[];
  total: number;
};

const T = {
  en: { noItem: "No supplier item found for it", enough: "Enough in stock" },
  ms: { noItem: "Tiada item pembekal dijumpai", enough: "Stok mencukupi" },
};

/**
 * What to buy from which supplier: every ingredient of the list is matched to the supplier item that looks like it (from the supplier
 * purchase listings: unit of measure and latest price as on the invoice). The quantity is converted to the supplier's unit only when
 * the conversion is exact; nothing is invented, an ingredient with no matching item is listed apart.
 */
export function buildPurchasePlan(rows: ConsolRow[], items: SupplierItemOption[], useStock: boolean, lang: Lang = "en"): PurchasePlan {
  const L = T[lang];
  const groups = new Map<string, PurchaseGroup>();
  const unassigned: PurchasePlan["unassigned"] = [];
  for (const row of rows) {
    const known = useStock && row.stock?.known;
    const needQty = known ? row.shortage ?? 0 : row.qty;
    const need: Base = { qty: needQty, family: row.family, key: row.key };
    const d = display({ qty: row.qty, family: row.family, key: row.key });
    const neededText = `${formatQty(d.qty)} ${d.unit}`;
    if (known && needQty <= 1e-9) {
      unassigned.push({ ingredient: row.name, needed: neededText, reason: L.enough });
      continue;
    }
    const best = rankSupplierItems(row.name, items, 1)[0]?.option;
    if (!best) {
      unassigned.push({ ingredient: row.name, needed: neededText, reason: L.noItem });
      continue;
    }
    const q = quantityInUom(need, best.uom).qty;
    const line: PurchaseLine = { ingredient: row.name, item: best.description, uom: best.uom, qty: q, price: best.price, amount: q !== null ? Math.round(q * best.price * 100) / 100 : null, needed: neededText, estimate: row.estimateQty > 0 };
    const g = groups.get(best.supplierId) ?? { supplier: best.supplierName, lines: [], total: 0 };
    g.lines.push(line);
    if (line.amount !== null) g.total = Math.round((g.total + line.amount) * 100) / 100;
    groups.set(best.supplierId, g);
  }
  const list = Array.from(groups.values()).sort((a, b) => a.supplier.localeCompare(b.supplier));
  return { groups: list, unassigned, total: Math.round(list.reduce((t, g) => t + g.total, 0) * 100) / 100 };
}

export async function loadPurchasePlan(supabase: DB, companyId: string, rows: ConsolRow[], useStock: boolean, lang: Lang): Promise<PurchasePlan> {
  return buildPurchasePlan(rows, await loadSupplierItemOptions(supabase, companyId), useStock, lang);
}

const esc = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
const money = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The by-supplier list as the chat shows it. */
export function purchaseText(plan: PurchasePlan, lang: Lang): string {
  const ms = lang === "ms";
  const H = ms
    ? { title: "SENARAI PEMBELIAN MENGIKUT PEMBEKAL", ing: "Bahan", item: "Item untuk dibeli", qty: "Kuantiti", unit: "Unit", price: "Harga seunit", amount: "Jumlah", sub: "Jumlah pembekal", confirm: "isi kuantiti", none: "Tiada bahan yang dapat dipadankan dengan item pembekal.", apart: "TIADA DALAM PESANAN LAGI", needed: "Diperlukan", why: "Sebab", grand: "Jumlah keseluruhan", note: "Harga ialah harga terkini setiap pembekal. Semak sebelum membuat pesanan." }
    : { title: "PURCHASE LIST BY SUPPLIER", ing: "Ingredient", item: "Item to buy", qty: "Qty", unit: "Unit", price: "Unit price", amount: "Amount", sub: "Supplier total", confirm: "enter the quantity", none: "No ingredient could be matched to a supplier item.", apart: "NOT IN A PURCHASE LIST YET", needed: "Needed", why: "Reason", grand: "Grand total", note: "The prices are the latest price of each supplier. Check them before ordering." };
  const out: string[] = [`**${H.title}**`];
  if (plan.groups.length === 0) out.push(H.none);
  for (const g of plan.groups) {
    const rows = g.lines.map((l) => `| ${esc(l.ingredient)}${l.estimate ? " ⚠" : ""} | ${esc(l.item)} | ${l.qty !== null ? formatQty(l.qty) : `(${H.confirm})`} | ${esc(l.uom || "unit")} | ${money(l.price)} | ${l.amount !== null ? money(l.amount) : "—"} |`);
    out.push(`**${g.supplier}**\n| ${H.ing} | ${H.item} | ${H.qty} | ${H.unit} | ${H.price} | ${H.amount} |\n| --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n${H.sub}: **${money(g.total)}**`);
  }
  if (plan.groups.length > 0) out.push(`${H.grand}: **${money(plan.total)}**`);
  if (plan.unassigned.length > 0) {
    out.push(`**${H.apart}**\n| ${H.ing} | ${H.needed} | ${H.why} |\n| --- | --- | --- |\n${plan.unassigned.map((u) => `| ${esc(u.ingredient)} | ${esc(u.needed)} | ${esc(u.reason)} |`).join("\n")}`);
  }
  out.push(H.note);
  return out.join("\n\n");
}
