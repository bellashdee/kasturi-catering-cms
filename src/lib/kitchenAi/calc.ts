import { sameKind, toBase, type Base } from "./units";
import type { CalcDish, CalcLine, CalcResult, CalcSession, ConsolRow, KState, RecipeData, StockInfo } from "./types";

export const normName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type StockLookup = { byId: Map<string, StockInfo>; byName: Map<string, StockInfo> };

function lineOf(name: string, ingredientId: string | null, b: Base, estimate: boolean): CalcLine {
  return { name, ingredientId, qty: b.qty, family: b.family, key: b.key, estimate };
}

/**
 * Required quantity = (standard recipe quantity ÷ standard recipe yield) × required servings.
 * A dish with a recipe uses only that recipe's own quantities. A dish without one uses its AI estimate when it has one (kept
 * apart and labelled), otherwise it is reported as needing recipe data. Nothing is ever filled in by guessing.
 */
export function calculate(state: KState, recipes: Map<string, RecipeData>, stock: StockLookup | null = null): CalcResult {
  const needsData: CalcResult["needsData"] = [];
  let usesEstimate = false;
  let usesPendingEstimate = false;

  const consolidate = (dishes: CalcDish[]): ConsolRow[] => {
    const rows = new Map<string, ConsolRow>();
    for (const d of dishes) {
      for (const l of d.lines) {
        const key = `${normName(l.name)}|${l.family}|${l.key}`;
        const row = rows.get(key) ?? { name: l.name, ingredientId: l.ingredientId, family: l.family, key: l.key, qty: 0, estimateQty: 0, stock: null, shortage: null };
        row.qty += l.qty;
        if (l.estimate) row.estimateQty += l.qty;
        row.ingredientId = row.ingredientId ?? l.ingredientId;
        rows.set(key, row);
      }
    }
    const list = Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (stock) {
      for (const row of list) {
        const info = (row.ingredientId ? stock.byId.get(row.ingredientId) : undefined) ?? stock.byName.get(normName(row.name));
        if (!info) {
          row.stock = { qty: 0, known: false };
          continue;
        }
        const have = toBase(info.qty, info.unit);
        const need: Base = { qty: row.qty, family: row.family, key: row.key };
        if (sameKind(have, need)) {
          row.stock = { qty: have.qty, known: true };
          row.shortage = Math.max(0, row.qty - have.qty);
        } else {
          row.stock = { qty: 0, known: false };
        }
      }
    }
    return list;
  };

  const sessions: CalcSession[] = state.sessions.map((s) => {
    const dishes: CalcDish[] = s.items.map((item) => {
      const base: CalcDish = {
        sessionId: s.id,
        sessionName: s.name,
        itemId: item.id,
        itemName: item.name,
        pax: s.pax,
        source: "missing",
        recipeName: null,
        recipeYield: null,
        estimateStatus: null,
        lines: [],
        problem: null,
      };
      const recipe = item.recipeId ? recipes.get(item.recipeId) : undefined;

      if (recipe) {
        base.source = "recipe";
        base.recipeName = recipe.name;
        base.recipeYield = recipe.yieldPax;
        if (recipe.lines.length === 0 || !(recipe.yieldPax > 0)) {
          base.source = "missing";
          base.problem = "recipe_empty";
          needsData.push({ sessionName: s.name, itemId: item.id, itemName: item.name, reason: "recipe_empty" });
          return base;
        }
        if (s.pax === null || !(s.pax > 0)) {
          base.problem = "pax";
          needsData.push({ sessionName: s.name, itemId: item.id, itemName: item.name, reason: "pax" });
          return base;
        }
        const factor = s.pax / recipe.yieldPax;
        base.lines = recipe.lines.map((l) => lineOf(l.name, l.ingredientId, toBase(l.quantity * factor, l.unit), false));
        return base;
      }

      if (item.estimate) {
        usesEstimate = true;
        if (item.estimate.status === "pending") usesPendingEstimate = true;
        base.source = "estimate";
        base.estimateStatus = item.estimate.status;
        if (s.pax === null || !(s.pax > 0)) {
          base.problem = "pax";
          needsData.push({ sessionName: s.name, itemId: item.id, itemName: item.name, reason: "pax" });
          return base;
        }
        const factor = s.pax / item.estimate.basisPax;
        base.lines = item.estimate.lines.map((l) => lineOf(l.name, null, toBase(l.quantity * factor, l.unit), true));
        return base;
      }

      base.problem = "recipe";
      needsData.push({ sessionName: s.name, itemId: item.id, itemName: item.name, reason: "recipe" });
      return base;
    });
    return { id: s.id, name: s.name, pax: s.pax, dishes, consolidated: consolidate(dishes) };
  });

  return { sessions, combined: consolidate(sessions.flatMap((s) => s.dishes)), needsData, usesEstimate, usesPendingEstimate };
}
