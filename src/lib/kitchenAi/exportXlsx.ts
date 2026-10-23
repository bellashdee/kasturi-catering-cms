"use client";

import * as XLSX from "xlsx";
import { display } from "./units";
import type { CalcResult, ConsolRow, KState } from "./types";

const ESTIMATE_LABEL = "AI ESTIMATE — NOT YET VERIFIED";

function qty(row: { qty: number; family: ConsolRow["family"]; key: string }, state: KState): [number, string] {
  const d = display({ qty: row.qty, family: row.family, key: row.key }, state.unitMode);
  return [d.qty, d.unit];
}

/**
 * The final ingredient list as an Excel file: a summary, the quantities per dish (with the source of every dish: recipe or
 * AI estimate) and the consolidated list (with stock and quantity to buy when the stock was compared).
 */
export function exportKitchenList(state: KState, calc: CalcResult): void {
  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    ["KITCHEN INGREDIENT REQUIREMENTS"],
    ["Company", state.companyName],
    ["Event", state.event?.name ?? state.photoEventName ?? ""],
    ["Event date", state.event?.date ?? ""],
    ["Menu source", state.documentIds.length > 0 ? "Uploaded menu photo" : state.event ? "Event order" : "Entered by hand"],
    ...calc.sessions.map((s): (string | number)[] => [`Pax — ${s.name}`, s.pax ?? "not entered"]),
    ["Prepared", new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" }) + " (Malaysia time)"],
  ];
  if (calc.usesEstimate) summary.push([], [calc.usesPendingEstimate ? `⚠ Contains ${ESTIMATE_LABEL}: a chef must review it before it is used for purchasing or production.` : "Contains AI estimates that have been reviewed by a chef."]);
  if (calc.needsData.length > 0) summary.push([], ["Dishes with no quantities (recipe data or pax missing):", ...Array.from(new Set(calc.needsData.map((n) => n.itemName)))]);
  const s1 = XLSX.utils.aoa_to_sheet(summary);
  s1["!cols"] = [{ wch: 30 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, s1, "Summary");

  const dishRows: (string | number)[][] = [["Session", "Pax", "Dish", "Source", "Ingredient", "Quantity", "Unit"]];
  for (const s of calc.sessions) {
    for (const d of s.dishes) {
      const source = d.source === "recipe" ? `Recipe: ${d.recipeName}` : d.source === "estimate" ? (d.estimateStatus === "reviewed" ? "AI estimate (reviewed)" : ESTIMATE_LABEL) : d.problem === "pax" ? "Pax not entered" : "Recipe Data Required";
      if (d.lines.length === 0) dishRows.push([s.name, s.pax ?? "", d.itemName, source, "", "", ""]);
      for (const l of d.lines) {
        const [q, u] = qty(l, state);
        dishRows.push([s.name, s.pax ?? "", d.itemName, source, l.name, q, u]);
      }
    }
  }
  const s2 = XLSX.utils.aoa_to_sheet(dishRows);
  s2["!cols"] = [{ wch: 18 }, { wch: 8 }, { wch: 30 }, { wch: 34 }, { wch: 28 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, s2, "By dish");

  const consolidated = (rows: ConsolRow[]) => {
    const withStock = state.stockCompared;
    const out: (string | number)[][] = [["Ingredient", "Total quantity", "Unit", "Source", ...(withStock ? ["In stock", "To buy", "Stock note"] : [])]];
    for (const r of rows) {
      const [q, u] = qty(r, state);
      const source = r.estimateQty <= 0 ? "Recipe" : r.estimateQty >= r.qty - 1e-9 ? ESTIMATE_LABEL : `Recipe + AI estimate (${qty({ ...r, qty: r.estimateQty }, state).join(" ")})`;
      const line: (string | number)[] = [r.name, q, u, source];
      if (withStock) {
        if (r.stock?.known) {
          const have = qty({ qty: r.stock.qty, family: r.family, key: r.key }, state);
          const buy = qty({ qty: r.shortage ?? 0, family: r.family, key: r.key }, state);
          line.push(have[0], buy[0], (r.shortage ?? 0) > 1e-9 ? "" : "enough");
        } else line.push("", q, r.stock ? "not in the stock list or unit differs" : "");
      }
      out.push(line);
    }
    return out;
  };
  const s3 = XLSX.utils.aoa_to_sheet(consolidated(calc.combined));
  s3["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, s3, "Consolidated");

  if (calc.sessions.length > 1) {
    for (const s of calc.sessions) {
      const sheet = XLSX.utils.aoa_to_sheet(consolidated(s.consolidated));
      sheet["!cols"] = s3["!cols"];
      XLSX.utils.book_append_sheet(wb, sheet, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Session");
    }
  }

  const base = (state.event?.name ?? state.photoEventName ?? "menu").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "menu";
  XLSX.writeFile(wb, `ingredients-${base}.xlsx`);
}
