"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { scaleIngredientRequirements } from "@/lib/kitchen/queries";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import type { Database } from "@/lib/supabase/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type IngredientInput = {
  companyId: string;
  name: string;
  category?: string;
  unitOfMeasure?: string;
  currentStockQty: number;
  reorderLevel: number;
  unitCost: number;
  preferredSupplierId?: string;
};

export async function createIngredient(input: IngredientInput) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("ingredients")
    .insert({
      company_id: input.companyId,
      name: input.name,
      category: input.category || null,
      unit_of_measure: input.unitOfMeasure || null,
      current_stock_qty: input.currentStockQty,
      reorder_level: input.reorderLevel,
      unit_cost: input.unitCost,
      preferred_supplier_id: input.preferredSupplierId || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/kitchen/ingredients");
  return data;
}

export async function updateIngredient(ingredientId: string, input: Partial<IngredientInput>) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("ingredients")
    .update({
      name: input.name,
      category: input.category || null,
      unit_of_measure: input.unitOfMeasure || null,
      reorder_level: input.reorderLevel,
      unit_cost: input.unitCost,
      preferred_supplier_id: input.preferredSupplierId || null,
    })
    .eq("id", ingredientId);
  if (error) throw error;
  revalidatePath("/kitchen/ingredients");
  revalidatePath(`/kitchen/ingredients/${ingredientId}`);
}

export type BulkIngredientRow = {
  name: string;
  category?: string;
  unitOfMeasure?: string;
  currentStockQty?: string;
  reorderLevel?: string;
  unitCost?: string;
};

export async function bulkImportIngredients(companyId: string, rows: BulkIngredientRow[]) {
  const { supabase } = await requireUser();
  const payload = rows
    .filter((r) => r.name?.trim())
    .map((r) => ({
      company_id: companyId,
      name: r.name.trim(),
      category: r.category || null,
      unit_of_measure: r.unitOfMeasure || null,
      current_stock_qty: Number(r.currentStockQty) || 0,
      reorder_level: Number(r.reorderLevel) || 0,
      unit_cost: Number(r.unitCost) || 0,
    }));
  if (payload.length === 0) return { inserted: 0 };
  const { error, count } = await supabase.from("ingredients").insert(payload, { count: "exact" });
  if (error) throw error;
  revalidatePath("/kitchen/ingredients");
  return { inserted: count ?? payload.length };
}

/**
 * The single place stock quantities change. Every adjustment — manual count,
 * OCR'd stock-count photo, receiving a purchase, kitchen consumption, or
 * wastage — goes through here so `ingredients.current_stock_qty` and the
 * `stock_movements` ledger never drift apart.
 */
export async function recordStockMovement(input: {
  companyId: string;
  ingredientId: string;
  movementType: "in" | "out" | "adjustment" | "wastage";
  quantity: number;
  notes?: string;
  documentId?: string;
  referenceType?: string;
  referenceId?: string;
}) {
  const { supabase, userId } = await requireUser();

  const { data: ingredient, error: ingredientError } = await supabase
    .from("ingredients")
    .select("current_stock_qty")
    .eq("id", input.ingredientId)
    .single();
  if (ingredientError) throw ingredientError;

  const signedQty = input.movementType === "in" ? input.quantity : -Math.abs(input.quantity);
  const newStock =
    input.movementType === "adjustment"
      ? input.quantity
      : Math.max(0, Number(ingredient.current_stock_qty) + signedQty);

  const { error: movementError } = await supabase.from("stock_movements").insert({
    company_id: input.companyId,
    ingredient_id: input.ingredientId,
    movement_type: input.movementType,
    quantity: input.movementType === "adjustment" ? newStock - Number(ingredient.current_stock_qty) : signedQty,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    document_id: input.documentId || null,
    notes: input.notes || null,
    created_by: userId,
  });
  if (movementError) throw movementError;

  const { error: updateError } = await supabase
    .from("ingredients")
    .update({ current_stock_qty: newStock })
    .eq("id", input.ingredientId);
  if (updateError) throw updateError;

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.documentId);
  }

  revalidatePath("/kitchen/stock");
  revalidatePath(`/kitchen/ingredients/${input.ingredientId}`);
  revalidatePath("/kitchen/ingredients");
}

/**
 * Duplicate check for invoice-driven stock entries: stock movements saved from
 * an uploaded invoice carry "Invoice <number>" in their notes, so the same
 * invoice number already recorded for this company and direction is a likely
 * double upload.
 */
export async function findDuplicateStockInvoice(input: { companyId: string; invoiceNumber: string; movementType: "in" | "out" }) {
  const { supabase } = await requireUser();
  const invoiceNumber = input.invoiceNumber.trim();
  if (!invoiceNumber) return false;
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("movement_type", input.movementType)
    .ilike("notes", `%Invoice ${invoiceNumber.replace(/[%_]/g, "")}%`)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export type MenuInput = {
  companyId: string;
  name: string;
  description?: string;
  items: { name: string; category: string; pricePerPax: number }[];
};

export async function createMenu(input: MenuInput) {
  const { supabase } = await requireUser();
  const { data: menu, error: menuError } = await supabase
    .from("menus")
    .insert({ company_id: input.companyId, name: input.name, description: input.description || null })
    .select("id")
    .single();
  if (menuError) throw menuError;

  const items = input.items.filter((i) => i.name.trim());
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("menu_items").insert(
      items.map((i) => ({
        company_id: input.companyId,
        menu_id: menu.id,
        name: i.name,
        category: i.category,
        price_per_pax: i.pricePerPax || null,
      })),
    );
    if (itemsError) throw itemsError;
  }

  revalidatePath("/kitchen/menus");
  return menu;
}

export type RecipeInput = {
  companyId: string;
  menuItemId?: string;
  name: string;
  yieldPax: number;
  instructions?: string;
  ingredients: { ingredientId: string; quantityPerYield: number; unit?: string }[];
};

/** Same dish written differently (spacing, punctuation, BIRYANI / BRIYANI, "3 RASA" / "3RASA") counts as the same recipe. */
function recipeNameKey(name: string): string {
  return name.toUpperCase().replace(/BIRYANI/g, "BRIYANI").replace(/[^A-Z0-9]/g, "");
}

export async function createRecipe(input: RecipeInput) {
  const { supabase } = await requireUser();
  const { data: existing, error: existingError } = await supabase.from("recipes").select("name").eq("company_id", input.companyId);
  if (existingError) throw existingError;
  const clash = existing?.find((r) => recipeNameKey(r.name) === recipeNameKey(input.name));
  if (clash) throw new Error(`A recipe called "${clash.name}" already exists for this company. Open that recipe instead of creating it again.`);
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      company_id: input.companyId,
      menu_item_id: input.menuItemId || null,
      name: input.name,
      yield_pax: input.yieldPax,
      instructions: input.instructions || null,
    })
    .select("id")
    .single();
  if (recipeError) throw recipeError;

  const lines = input.ingredients.filter((i) => i.ingredientId && i.quantityPerYield > 0);
  if (lines.length > 0) {
    const { error: linesError } = await supabase.from("recipe_ingredients").insert(
      lines.map((l) => ({
        recipe_id: recipe.id,
        ingredient_id: l.ingredientId,
        quantity_per_yield: l.quantityPerYield,
        unit: l.unit || null,
      })),
    );
    if (linesError) throw linesError;
  }

  revalidatePath("/kitchen/recipes");
  return recipe;
}

export type RecipeUpdateInput = {
  name: string;
  menuItemId?: string;
  yieldPax: number;
  instructions?: string;
  /** A line that already belongs to the recipe keeps its id; a line without an id is new; a saved line that is left out is removed. */
  ingredients: { id?: string; ingredientId: string; quantityPerYield: number; unit?: string }[];
};

/** Edit a recipe: its name, base yield, instructions and every ingredient line (change the item, quantity or unit, add or remove). */
export async function updateRecipe(recipeId: string, input: RecipeUpdateInput) {
  const { supabase } = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("Enter the recipe name.");
  if (!(input.yieldPax >= 1)) throw new Error("The base yield must be at least 1 pax.");

  const { data: recipe, error: readError } = await supabase.from("recipes").select("id, company_id").eq("id", recipeId).single();
  if (readError || !recipe) throw new Error("Recipe not found.");

  const { data: others, error: othersError } = await supabase.from("recipes").select("id, name").eq("company_id", recipe.company_id).neq("id", recipeId);
  if (othersError) throw othersError;
  const clash = others?.find((r) => recipeNameKey(r.name) === recipeNameKey(name));
  if (clash) throw new Error(`Another recipe called "${clash.name}" already exists for this company.`);

  const lines = input.ingredients.filter((l) => l.ingredientId && l.quantityPerYield > 0);
  if (lines.length === 0) throw new Error("Add at least one ingredient with a quantity.");

  // an ingredient can only be used from the same company as the recipe
  const { data: allowed } = await supabase.from("ingredients").select("id").eq("company_id", recipe.company_id).in("id", lines.map((l) => l.ingredientId));
  const allowedIds = new Set((allowed ?? []).map((i) => i.id));
  if (lines.some((l) => !allowedIds.has(l.ingredientId))) throw new Error("An ingredient does not belong to this company.");

  const { error: updateError } = await supabase
    .from("recipes")
    .update({ name, menu_item_id: input.menuItemId || null, yield_pax: input.yieldPax, instructions: input.instructions?.trim() || null })
    .eq("id", recipeId);
  if (updateError) throw updateError;

  const { data: existing, error: existingError } = await supabase.from("recipe_ingredients").select("id").eq("recipe_id", recipeId);
  if (existingError) throw existingError;
  const existingIds = new Set((existing ?? []).map((l) => l.id));
  const keptIds = new Set(lines.map((l) => l.id).filter((id): id is string => !!id && existingIds.has(id)));

  for (const l of lines.filter((x) => x.id && existingIds.has(x.id))) {
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({ ingredient_id: l.ingredientId, quantity_per_yield: l.quantityPerYield, unit: l.unit || null })
      .eq("id", l.id as string);
    if (error) throw error;
  }
  const fresh = lines.filter((l) => !l.id || !existingIds.has(l.id));
  if (fresh.length > 0) {
    const { error } = await supabase
      .from("recipe_ingredients")
      .insert(fresh.map((l) => ({ recipe_id: recipeId, ingredient_id: l.ingredientId, quantity_per_yield: l.quantityPerYield, unit: l.unit || null })));
    if (error) throw error;
  }
  const removed = Array.from(existingIds).filter((id) => !keptIds.has(id));
  if (removed.length > 0) {
    const { error } = await supabase.from("recipe_ingredients").delete().in("id", removed);
    if (error) throw error;
  }

  revalidatePath("/kitchen/recipes");
  revalidatePath(`/kitchen/recipes/${recipeId}`);
}

/** Delete a recipe with its ingredient lines. Production orders made from it stay (they just lose the link). */
export async function deleteRecipe(recipeId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("recipes").delete().eq("id", recipeId).select("id");
  if (error || !data?.length) throw new Error("You cannot delete this recipe.");
  revalidatePath("/kitchen/recipes");
}

export type ProductionOrderInput = {
  companyId: string;
  recipeId?: string;
  menuPlanDishId?: string;
  paxCount?: number;
  plannedDate: string;
  assignedStaff?: string;
  prepTimeMinutes?: number;
  notes?: string;
};

export async function createProductionOrder(input: ProductionOrderInput) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("production_orders")
    .insert({
      company_id: input.companyId,
      recipe_id: input.recipeId || null,
      menu_plan_dish_id: input.menuPlanDishId || null,
      pax_count: input.paxCount ?? null,
      planned_date: input.plannedDate,
      assigned_staff: input.assignedStaff || null,
      prep_time_minutes: input.prepTimeMinutes ?? null,
      notes: input.notes || null,
      status: "planned",
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/kitchen");
  return data;
}

/**
 * Marking a production order complete is what actually consumes stock:
 * Recipe + Pax scales the ingredient list, and each ingredient's stock is
 * decremented via the same recordStockMovement ledger everything else uses.
 * If the order is linked to a catering event, its ingredient cost also
 * updates that event's costing — Kitchen writes into Catering's own
 * `event_costing` row rather than keeping a second, competing total.
 *
 * Orders linked to a real menu-plan dish (menu_plan_dish_id) instead of a
 * recipe do NOT auto-deduct stock here: menu_plan_ingredients are text names
 * imported from the Excel reference file, not linked by id to the `ingredients`
 * stock table, so there is no reliable id to deduct against. Their scaled
 * ingredient list is still shown for reference on the order's detail page.
 */
export async function updateProductionOrderStatus(orderId: string, status: string) {
  const { supabase } = await requireUser();

  const { data: order, error: orderError } = await supabase
    .from("production_orders")
    .select("id, company_id, catering_event_id, recipe_id, menu_plan_dish_id, pax_count, catering_events(pax_count)")
    .eq("id", orderId)
    .single();
  if (orderError) throw orderError;

  const { error: updateError } = await supabase.from("production_orders").update({ status }).eq("id", orderId);
  if (updateError) throw updateError;

  if (status === "completed" && order.recipe_id) {
    const targetPax = order.pax_count ?? order.catering_events?.pax_count ?? null;

    const { data: recipe } = await supabase
      .from("recipes")
      .select("yield_pax, recipe_ingredients(ingredient_id, quantity_per_yield, unit, ingredients(name, unit_of_measure, current_stock_qty, unit_cost))")
      .eq("id", order.recipe_id)
      .single();

    if (recipe && targetPax) {
      const requirements = scaleIngredientRequirements(recipe.recipe_ingredients, recipe.yield_pax, targetPax);
      let ingredientCost = 0;

      for (const req of requirements) {
        ingredientCost += req.quantityNeeded * req.unitCost;
        await recordStockMovement({
          companyId: order.company_id,
          ingredientId: req.ingredientId,
          movementType: "out",
          quantity: req.quantityNeeded,
          notes: "Consumed by production order",
          referenceType: "production_order",
          referenceId: orderId,
        });
      }

      if (order.catering_event_id) {
        const { data: existingCosting } = await supabase
          .from("event_costing")
          .select("id, food_cost")
          .eq("catering_event_id", order.catering_event_id)
          .maybeSingle();

        if (existingCosting) {
          await supabase
            .from("event_costing")
            .update({ ingredient_cost: Math.round(ingredientCost * 100) / 100, updated_at: new Date().toISOString() })
            .eq("id", existingCosting.id);
        } else {
          await supabase.from("event_costing").insert({
            company_id: order.company_id,
            catering_event_id: order.catering_event_id,
            ingredient_cost: Math.round(ingredientCost * 100) / 100,
          });
        }
      }
    }
  }

  revalidatePath("/kitchen");
  revalidatePath(`/kitchen/${orderId}`);
  if (order.catering_event_id) revalidatePath(`/catering/${order.catering_event_id}`);
  revalidatePath("/");
}

export type PurchaseRequestInput = {
  companyId: string;
  ingredientId: string;
  supplierId?: string;
  quantityRequested: number;
  unit?: string;
  requiredDate?: string;
  notes?: string;
  productionOrderId?: string;
  documentId?: string;
};

export async function createPurchaseRequest(input: PurchaseRequestInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("purchase_requests").insert({
    company_id: input.companyId,
    ingredient_id: input.ingredientId,
    supplier_id: input.supplierId || null,
    quantity_requested: input.quantityRequested,
    unit: input.unit || null,
    required_date: input.requiredDate || null,
    notes: input.notes || null,
    production_order_id: input.productionOrderId || null,
    document_id: input.documentId || null,
    created_by: userId,
    status: "draft",
  });
  if (error) throw error;
  revalidatePath("/kitchen/purchase-requests");
}

/** Marking a request "completed" closes the loop by adding the stock back in. */
export async function updatePurchaseRequestStatus(requestId: string, status: string) {
  const { supabase } = await requireUser();

  const { data: request, error: fetchError } = await supabase
    .from("purchase_requests")
    .select("id, company_id, ingredient_id, quantity_requested")
    .eq("id", requestId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase.from("purchase_requests").update({ status }).eq("id", requestId);
  if (updateError) throw updateError;

  if (status === "completed") {
    await recordStockMovement({
      companyId: request.company_id,
      ingredientId: request.ingredient_id,
      movementType: "in",
      quantity: Number(request.quantity_requested),
      notes: "Received from purchase request",
      referenceType: "purchase_request",
      referenceId: requestId,
    });
  }

  revalidatePath("/kitchen/purchase-requests");
}

/** Renames an ingredient without touching any of its other details. */
export async function renameIngredient(ingredientId: string, name: string) {
  const { supabase } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a name.");
  const { error } = await supabase.from("ingredients").update({ name: trimmed }).eq("id", ingredientId);
  if (error) throw error;
  revalidatePath("/kitchen/ingredients");
  revalidatePath(`/kitchen/ingredients/${ingredientId}`);
}

type KTables = Database["public"]["Tables"];
export type PurchaseRequestRow = KTables["purchase_requests"]["Row"];
export type IngredientRow = KTables["ingredients"]["Row"];
export type MenuRow = KTables["menus"]["Row"];
export type MenuItemRow = KTables["menu_items"]["Row"];
export type MenuSnapshot = { menu: MenuRow; items: MenuItemRow[] };

async function kitchenAdmin(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], companyId: string, message: string) {
  const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: companyId });
  if (data !== true) throw new Error(message);
}

export type PurchaseRequestEdit = { quantity: number; unit?: string; requiredDate?: string; notes?: string };

/** Changes the quantity, unit, required date or notes of a purchase request that has not been received yet. */
export async function updatePurchaseRequest(id: string, input: PurchaseRequestEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("purchase_requests").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This request was not found (it may have been deleted).");
    if (before.status === "completed") throw new Error("This request is already received into the stock, so it cannot be changed.");
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Enter a quantity more than 0.");
    if (input.requiredDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.requiredDate)) throw new Error("Enter a valid required date.");
    const { error } = await supabase.from("purchase_requests").update({ quantity_requested: input.quantity, unit: input.unit?.trim() || null, required_date: input.requiredDate || null, notes: input.notes?.trim() || null }).eq("id", id);
    if (error) throw error;
    await recordAudit({ companyId: before.company_id, relatedTable: "purchase_requests", relatedId: id, action: "edited", previousValue: `${before.quantity_requested} ${before.unit ?? ""}`.trim(), newValue: `${input.quantity} ${input.unit ?? ""}`.trim() });
    revalidatePath("/kitchen/purchase-requests");
    return {};
  }, "Could not save the request. Please try again.");
}

/** Deletes a purchase request that is not received yet; returns it so the delete can be undone. */
export async function deletePurchaseRequest(id: string): Promise<ActionResult<{ row: PurchaseRequestRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("purchase_requests").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This request was not found (it may already be deleted).");
    if (before.status === "completed") throw new Error("This request is already received into the stock, so it cannot be deleted.");
    const { data: removed, error } = await supabase.from("purchase_requests").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the request.");
    await recordAudit({ companyId: before.company_id, relatedTable: "purchase_requests", relatedId: id, action: "deleted", previousValue: `${before.quantity_requested} ${before.unit ?? ""} (${before.status})`.trim(), newValue: "Deleted" });
    revalidatePath("/kitchen/purchase-requests");
    return { row: before };
  }, "Could not delete the request. Please try again.");
}

/** Undo of a delete: the purchase request comes back as it was. */
export async function restorePurchaseRequest(row: PurchaseRequestRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    const { error } = await supabase.from("purchase_requests").insert(row);
    if (error) throw new Error("Could not put the request back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "purchase_requests", relatedId: row.id, action: "restored", newValue: "Put back after it was deleted" });
    revalidatePath("/kitchen/purchase-requests");
    return {};
  }, "Could not put the request back.");
}

/**
 * Deletes an ingredient that is not used anywhere. One used in a recipe, in the stock history or in a purchase request is kept (deleting it would
 * delete all of those too). Returns the ingredient so the delete can be undone.
 */
export async function deleteIngredient(id: string): Promise<ActionResult<{ row: IngredientRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: ing } = await supabase.from("ingredients").select("*").eq("id", id).maybeSingle();
    if (!ing) throw new Error("This ingredient was not found (it may already be deleted).");
    await kitchenAdmin(supabase, ing.company_id, "Only an admin of the company can delete an ingredient.");
    const head = { count: "exact" as const, head: true };
    const [recipes, movements, requests] = await Promise.all([
      supabase.from("recipe_ingredients").select("id", head).eq("ingredient_id", id),
      supabase.from("stock_movements").select("id", head).eq("ingredient_id", id),
      supabase.from("purchase_requests").select("id", head).eq("ingredient_id", id),
    ]);
    const used = [[recipes.count, "recipe line(s)"], [movements.count, "stock movement(s)"], [requests.count, "purchase request(s)"]].filter(([n]) => (n as number) > 0).map(([n, label]) => `${n} ${label}`);
    if (used.length > 0) throw new Error(`This ingredient cannot be deleted: it is used in ${used.join(", ")}.`);
    const { data: removed, error } = await supabase.from("ingredients").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the ingredient.");
    await recordAudit({ companyId: ing.company_id, relatedTable: "ingredients", relatedId: id, action: "deleted", previousValue: ing.name, newValue: "Deleted" });
    revalidatePath("/kitchen/ingredients");
    return { row: ing };
  }, "Could not delete the ingredient. Please try again.");
}

/** Undo of a delete: the ingredient comes back as it was. */
export async function restoreIngredient(row: IngredientRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    await kitchenAdmin(supabase, row.company_id, "Only an admin of the company can put an ingredient back.");
    const { error } = await supabase.from("ingredients").insert(row);
    if (error) throw new Error("Could not put the ingredient back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "ingredients", relatedId: row.id, action: "restored", newValue: `${row.name} put back after it was deleted` });
    revalidatePath("/kitchen/ingredients");
    return {};
  }, "Could not put the ingredient back.");
}

export type MenuEdit = { name: string; description?: string; items: { name: string; category: string; pricePerPax?: number | null }[] };

/** Changes a menu: its name, description and items (the items are replaced as they are on the screen). */
export async function updateMenu(id: string, input: MenuEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("menus").select("*, menu_items(*)").eq("id", id).maybeSingle();
    if (!before) throw new Error("This menu was not found (it may have been deleted).");
    if (!input.name?.trim()) throw new Error("Write the name of the menu.");
    const items = input.items.filter((i) => i.name.trim());
    const { error } = await supabase.from("menus").update({ name: input.name.trim(), description: input.description?.trim() || null }).eq("id", id);
    if (error) throw error;
    const { error: deleteError } = await supabase.from("menu_items").delete().eq("menu_id", id);
    if (deleteError) throw deleteError;
    if (items.length > 0) {
      const { error: insertError } = await supabase.from("menu_items").insert(items.map((i) => ({ company_id: before.company_id, menu_id: id, name: i.name.trim(), category: i.category, price_per_pax: i.pricePerPax ?? null })));
      if (insertError) {
        await supabase.from("menu_items").insert(before.menu_items);
        throw insertError;
      }
    }
    await recordAudit({ companyId: before.company_id, relatedTable: "menus", relatedId: id, action: "edited", previousValue: `${before.name} · ${before.menu_items.length} item(s)`, newValue: `${input.name.trim()} · ${items.length} item(s)` });
    revalidatePath("/kitchen/menus");
    revalidatePath(`/kitchen/menus/${id}`);
    return {};
  }, "Could not save the menu. Please try again.");
}

/** Deletes a menu with its items and returns both, so the delete can be undone. */
export async function deleteMenu(id: string): Promise<ActionResult<{ row: MenuSnapshot }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: menu } = await supabase.from("menus").select("*, menu_items(*)").eq("id", id).maybeSingle();
    if (!menu) throw new Error("This menu was not found (it may already be deleted).");
    const { menu_items: items, ...row } = menu;
    const { data: removed, error } = await supabase.from("menus").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the menu.");
    await recordAudit({ companyId: menu.company_id, relatedTable: "menus", relatedId: id, action: "deleted", previousValue: `${menu.name} · ${items.length} item(s)`, newValue: "Deleted" });
    revalidatePath("/kitchen/menus");
    return { row: { menu: row, items } };
  }, "Could not delete the menu. Please try again.");
}

/** Undo of a delete: the menu and its items come back as they were. */
export async function restoreMenu(snapshot: MenuSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { menu, items } = snapshot;
    if (!menu?.id || !menu.company_id) throw new Error("There is nothing to put back.");
    const { error } = await supabase.from("menus").insert(menu);
    if (error) throw new Error("Could not put the menu back.");
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("menu_items").insert(items);
      if (itemsError) {
        await supabase.from("menus").delete().eq("id", menu.id);
        throw new Error("Could not put the menu back.");
      }
    }
    await recordAudit({ companyId: menu.company_id, relatedTable: "menus", relatedId: menu.id, action: "restored", newValue: `${menu.name} put back after it was deleted` });
    revalidatePath("/kitchen/menus");
    return {};
  }, "Could not put the menu back.");
}
