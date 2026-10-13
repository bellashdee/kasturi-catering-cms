import * as XLSX from "xlsx";
import type { Database } from "@/lib/supabase/types";
import { MEAL_SESSION_LABEL, PURCHASE_ITEM_STATUS_LABEL, STOCK_STATUS_LABEL } from "@/lib/purchaseList/constants";

type Breakdown = { menuLabel: string; baseQuantity: number | null; basePax: number; unit: string | null; quantity: number | null; note?: string };
type Tables = Database["public"]["Tables"];
export type PurchaseListForExport = Tables["purchase_lists"]["Row"] & {
  companies: { name: string } | null;
  purchase_list_menus: Tables["purchase_list_menus"]["Row"][];
  purchase_list_items: Tables["purchase_list_items"]["Row"][];
};

/** The purchase list as an Excel workbook: the list sheet (what to buy) and a by-menu sheet (where each quantity comes from). */
export function buildPurchaseListWorkbook(list: PurchaseListForExport): Buffer {
  const items = [...list.purchase_list_items].sort((a, b) => a.sort_order - b.sort_order);
  const menus = [...list.purchase_list_menus].sort((a, b) => a.sort_order - b.sort_order);

  const header: (string | number | null)[][] = [
    ["PURCHASE LIST"],
    ["Company", list.companies?.name ?? ""],
    ["Event", list.event_name],
    ["Customer / project", list.customer_name ?? ""],
    ["Event date", list.event_date ?? ""],
    ["Meal session", list.meal_session ? MEAL_SESSION_LABEL[list.meal_session] : ""],
    ["Required pax", list.required_pax],
    ["Menu", [list.menu_category, list.week_numbers?.length ? `Week ${list.week_numbers.join(", ")}` : "", list.meal_sessions?.length ? list.meal_sessions.join(", ") : ""].filter(Boolean).join(" · ")],
    ["Dishes", menus.map((m) => m.menu_label).join("; ")],
    [],
    ["Ingredient", "Calculated quantity", "Unit", "Final quantity to purchase", "Rounding", "Stock", "Supplier", "Remarks", "Purchase status", "Notes to check"],
  ];
  const rows = items.map((i) => [
    i.ingredient_name,
    i.calculated_quantity === null ? "" : Number(i.calculated_quantity),
    i.unit ?? "",
    i.final_quantity === null ? "" : Number(i.final_quantity),
    i.rounding_note ?? "",
    i.stock_status === "checked" && i.stock_available !== null ? `${STOCK_STATUS_LABEL[i.stock_status]} (${Number(i.stock_available)} ${i.unit ?? ""})` : STOCK_STATUS_LABEL[i.stock_status],
    i.supplier ?? "",
    i.remark ?? "",
    PURCHASE_ITEM_STATUS_LABEL[i.status] ?? i.status,
    (i.flags ?? []).join(" | "),
  ]);
  const listSheet = XLSX.utils.aoa_to_sheet([...header, ...rows]);
  listSheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 8 }, { wch: 26 }, { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 60 }];

  const breakdownRows: (string | number)[][] = [["Ingredient", "Menu", "Menu quantity", "Menu pax", "Unit", `Quantity for ${list.required_pax} pax`, "Note"]];
  for (const i of items) {
    for (const b of (i.breakdown as unknown as Breakdown[]) ?? []) {
      breakdownRows.push([i.ingredient_name, b.menuLabel, b.baseQuantity ?? "", b.basePax, b.unit ?? "", b.quantity ?? "", b.note ?? ""]);
    }
  }
  const breakdownSheet = XLSX.utils.aoa_to_sheet(breakdownRows);
  breakdownSheet["!cols"] = [{ wch: 28 }, { wch: 50 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 70 }];

  // the same numbers grouped by dish, as printed for the kitchen
  const dishRows: (string | number)[][] = [["Dish", "Ingredient", "Original quantity", "Original pax", "Unit", `Required quantity for ${list.required_pax} pax`, "Remark"]];
  const byDish = new Map<string, (string | number)[][]>();
  for (const i of items) {
    for (const b of ((i.breakdown as unknown as (Breakdown & { remark?: string | null })[]) ?? [])) {
      const rows = byDish.get(b.menuLabel) ?? [];
      rows.push([b.menuLabel, i.ingredient_name, b.baseQuantity ?? "", b.basePax, b.unit ?? "", b.quantity ?? "", b.remark ?? ""]);
      byDish.set(b.menuLabel, rows);
    }
  }
  for (const rows of byDish.values()) dishRows.push(...rows);
  const dishSheet = XLSX.utils.aoa_to_sheet(dishRows);
  dishSheet["!cols"] = [{ wch: 50 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, listSheet, "Purchase List");
  XLSX.utils.book_append_sheet(wb, breakdownSheet, "By ingredient");
  XLSX.utils.book_append_sheet(wb, dishSheet, "By dish");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return buffer;
}
