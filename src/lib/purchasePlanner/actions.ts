"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { createPurchaseOrder } from "@/lib/procurement/actions";
import { loadEventDraft } from "@/lib/kitchenAi/event";
import { loadRecipeData, loadRecipeRefs, loadStock } from "@/lib/kitchenAi/data";
import { autoMatch, candidatesFor, type Candidate, type RecipeRef } from "@/lib/kitchenAi/match";
import type { RecipeData } from "@/lib/kitchenAi/types";

export type PlanDish = { id: string; name: string; recipeId: string | null; auto: boolean; candidates: Candidate[] };
export type PlanSession = { id: string; eventId: string; eventName: string; eventDate: string; name: string; pax: number | null; serviceTypes: string[]; dishes: PlanDish[] };
export type EventPlan = {
  sessions: PlanSession[];
  recipes: RecipeData[];
  recipeRefs: RecipeRef[];
  stock: { id: string; name: string; qty: number; unit: string | null }[];
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/**
 * The menu of the chosen events as the kitchen needs it: every session (meal / day) with its pax and its dishes, and for each dish the
 * recipe that clearly fits (shown for review, the person can change it) with the recipes it could also be. Nothing is written.
 */
export async function loadEventPlan(companyId: string, eventIds: string[]): Promise<ActionResult<EventPlan>> {
  return runAction(async () => {
    if (eventIds.length === 0) throw new Error("Choose at least one event.");
    if (eventIds.length > 20) throw new Error("Choose 20 events or fewer at a time.");
    const { supabase } = await requireUser();
    const [refs, stock] = await Promise.all([loadRecipeRefs(supabase, companyId), loadStock(supabase, companyId)]);

    const sessions: PlanSession[] = [];
    for (const eventId of eventIds) {
      const draft = await loadEventDraft(supabase, eventId);
      if (!draft) throw new Error("An event was not found (it may have been deleted).");
      if (draft.companyId !== companyId) throw new Error("The events must all belong to the same company.");
      draft.sessions.forEach((s, si) => {
        sessions.push({
          id: `${eventId}:${si}`,
          eventId,
          eventName: draft.ctx.name,
          eventDate: draft.ctx.date,
          name: s.name,
          pax: s.pax,
          serviceTypes: s.serviceTypes,
          dishes: s.menu.map((name, di) => {
            const best = autoMatch(name, refs);
            return { id: `${eventId}:${si}:${di}`, name, recipeId: best?.recipeId ?? null, auto: !!best, candidates: candidatesFor(name, refs) };
          }),
        });
      });
    }

    const ids = new Set<string>();
    for (const s of sessions) for (const d of s.dishes) {
      if (d.recipeId) ids.add(d.recipeId);
      for (const c of d.candidates) ids.add(c.recipeId);
    }
    const recipes = Array.from((await loadRecipeData(supabase, Array.from(ids))).values());
    const stockList = Array.from(stock.byId.entries()).map(([id, s]) => ({ id, name: s.name, qty: s.qty, unit: s.unit }));
    return { sessions, recipes, recipeRefs: refs, stock: stockList };
  }, "Could not read the menu of the event. Please try again.");
}

/**
 * A plan made from recipes chosen by hand (no event): every recipe is one line with its own pax, which starts as the yield of the recipe
 * (so the quantities are the recipe as written) and can be changed. Nothing is written.
 */
export async function loadRecipePlan(companyId: string, recipeIds: string[]): Promise<ActionResult<EventPlan>> {
  return runAction(async () => {
    const ids = Array.from(new Set(recipeIds));
    if (ids.length === 0) throw new Error("Choose at least one recipe.");
    if (ids.length > 60) throw new Error("Choose 60 recipes or fewer at a time.");
    const { supabase } = await requireUser();
    const [refs, stock, data] = await Promise.all([loadRecipeRefs(supabase, companyId), loadStock(supabase, companyId), loadRecipeData(supabase, ids)]);
    const known = new Set(refs.map((r) => r.id));
    const sessions: PlanSession[] = [];
    for (const id of ids) {
      const recipe = data.get(id);
      if (!recipe || !known.has(id)) throw new Error("A recipe was not found for this company.");
      sessions.push({
        id: `recipe:${id}`,
        eventId: "",
        eventName: "",
        eventDate: "",
        name: recipe.name,
        pax: recipe.yieldPax > 0 ? recipe.yieldPax : null,
        serviceTypes: [],
        dishes: [{ id: `recipe:${id}:0`, name: recipe.name, recipeId: id, auto: false, candidates: [] }],
      });
    }
    const stockList = Array.from(stock.byId.entries()).map(([id, s]) => ({ id, name: s.name, qty: s.qty, unit: s.unit }));
    return { sessions, recipes: Array.from(data.values()), recipeRefs: refs, stock: stockList };
  }, "Could not read the recipes. Please try again.");
}

/** The ingredient lines of recipes chosen later by hand. */
export async function loadRecipes(ids: string[]): Promise<ActionResult<{ recipes: RecipeData[] }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    return { recipes: Array.from((await loadRecipeData(supabase, ids.slice(0, 100))).values()) };
  }, "Could not read the recipe. Please try again.");
}

export type PlannedOrder = {
  supplierId: string;
  items: { itemName: string; quantity: number; unit: string; unitPrice: number }[];
};

/** One draft purchase order for each supplier, with the items, quantities and prices as they were on the screen. */
export async function createPlannedPurchaseOrders(input: { companyId: string; sourceEvents: string; orders: PlannedOrder[] }): Promise<ActionResult<{ created: { id: string; poNumber: string; supplierName: string; total: number; items: number }[] }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (input.orders.length === 0) throw new Error("There is nothing to order yet: choose a supplier item and a quantity for at least one ingredient.");
    const ids = Array.from(new Set(input.orders.map((o) => o.supplierId)));
    const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("company_id", input.companyId).in("id", ids);
    const names = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

    const created: { id: string; poNumber: string; supplierName: string; total: number; items: number }[] = [];
    let n = 0;
    for (const order of input.orders) {
      const supplierName = names.get(order.supplierId);
      if (!supplierName) throw new Error("A supplier was not found for this company.");
      const items = order.items.filter((i) => i.itemName.trim() && i.quantity > 0 && Number.isFinite(i.unitPrice) && i.unitPrice >= 0);
      if (items.length === 0) continue;
      const poNumber = `PO-${(Date.now() + n++).toString().slice(-8)}`;
      const po = await createPurchaseOrder({ companyId: input.companyId, poNumber, supplierId: order.supplierId, orderDate: "", items: items.map((i) => ({ itemName: i.itemName, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice })) });
      await supabase.from("purchase_orders").update({ source_events: input.sourceEvents.slice(0, 500) || null }).eq("id", po.id);
      created.push({ id: po.id, poNumber, supplierName, total: Math.round(items.reduce((t, i) => t + i.quantity * i.unitPrice, 0) * 100) / 100, items: items.length });
    }
    if (created.length === 0) throw new Error("There is nothing to order yet.");
    revalidatePath("/kitchen/purchase-requests");
    revalidatePath("/supplier-procurement/orders");
    return { created };
  }, "Could not create the purchase orders. Please try again.");
}
