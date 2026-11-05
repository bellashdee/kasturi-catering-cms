"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { canAccessModule } from "@/lib/modules";
import { getAiProvider, geminiGenerateWithSources } from "@/lib/ai/gemini";
import { parseModelJson } from "@/lib/extraction/report";
import { kitchenPlanAccess } from "@/lib/kitchenPlan/access";
import { itemKey, normalizeUnit, UNITS, untyped } from "./shared";

export type SuggestedRecipe = {
  title: string;
  servings: number;
  ingredients: { name: string; unit: string }[];
  steps: string[];
  sources: { title: string; url: string }[];
  /** how the suggestion was found: with a Google search, or from the AI's own knowledge (then there are no links) */
  basis: "google" | "ai_only";
};

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * A REFERENCE only: the ingredients and steps that recipes found on Google (or, when no search is available, the AI) give for a menu.
 * Nothing is saved here. A chef reviews and edits the list, and only then saves it as a company recipe.
 */
export async function suggestRecipe(menuName: string): Promise<ActionResult<{ recipe: SuggestedRecipe }>> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!canAccessModule(session.allowedModules, "kitchen")) throw new Error("Only Kitchen can look up recipes.");
    const name = clean(menuName, 120);
    if (!name) throw new Error("Write the menu name first.");
    const provider = getAiProvider();
    if (!provider) throw new Error("The recipe look-up needs the AI service, which is not set up on this server.");

    const prompt = `A catering chef in Malaysia wants a REFERENCE recipe for the menu "${name}". Search for common recipes of this dish and answer with ONLY a JSON object, no other text:
{
  "title": the dish name as it is usually written,
  "servings": the number of servings the recipes you found usually make, as a plain integer,
  "ingredients": [ { "name": ingredient name in Bahasa Melayu capital letters as used in Malaysian kitchens (for example "BAWANG BESAR"), "unit": one of ${UNITS.map((u) => `"${u}"`).join(", ")} - the unit this ingredient is usually bought in } ],
  "steps": [ one short cooking step each, in order, in plain English ]
}
Rules: list every ingredient the dish normally needs, once each (oil, salt, spices, coconut milk and so on); do NOT write quantities; at most 30 ingredients and 15 steps; do not invent special ingredients that the dish does not normally use.`;

    let raw = "";
    let sources: { title: string; url: string }[] = [];
    let basis: SuggestedRecipe["basis"] = "ai_only";
    if (process.env.GEMINI_API_KEY) {
      const r = await geminiGenerateWithSources({ turns: [{ role: "user", parts: [{ text: prompt }] }], maxOutputTokens: 4096, search: true, budgetMs: 50_000 });
      raw = r.text;
      sources = r.sources.slice(0, 6);
      basis = sources.length > 0 ? "google" : "ai_only";
    } else {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await anthropic.messages.create({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 4096, messages: [{ role: "user", content: prompt }] });
      const block = res.content.find((b) => b.type === "text");
      raw = block && "text" in block ? block.text : "";
    }
    const parsed = parseModelJson(raw) as Record<string, unknown> | null;
    if (!parsed) throw new Error("The recipe could not be read. Please try again.");
    const seen = new Set<string>();
    const ingredients = (Array.isArray(parsed.ingredients) ? parsed.ingredients : [])
      .map((i) => {
        const o = (i ?? {}) as Record<string, unknown>;
        return { name: clean(o.name, 80).toUpperCase(), unit: normalizeUnit(clean(o.unit, 12)) };
      })
      .filter((i) => {
        if (!i.name || seen.has(itemKey(i.name))) return false;
        seen.add(itemKey(i.name));
        return true;
      })
      .slice(0, 30);
    if (ingredients.length === 0) throw new Error("No ingredient was found for this menu. Write the ingredients yourself, or try another name.");
    const steps = (Array.isArray(parsed.steps) ? parsed.steps : []).map((s) => clean(s, 300)).filter(Boolean).slice(0, 15);
    const servings = Number(parsed.servings);
    return { recipe: { title: clean(parsed.title, 120) || name, servings: Number.isFinite(servings) && servings >= 1 && servings <= 1000 ? Math.round(servings) : 10, ingredients, steps, sources, basis } };
  });
}

export type ReferenceRecipeInput = {
  companyId: string;
  name: string;
  yieldPax: number;
  instructions: string;
  /** where the reference came from (kept with the recipe) */
  sourceNote: string;
  lines: { name: string; unit: string; quantity: number | null }[];
  /** true: the chef approves it as an official company recipe. false: kept as a draft, not used for purchasing. */
  approve: boolean;
};

const STOCK_UNIT: Record<string, string> = { KG: "kg", GRAM: "g", LITRE: "l", ML: "ml" };

/** The chef's reviewed list becomes a company recipe. It never replaces a recipe that already exists. */
export async function saveReferenceRecipe(input: ReferenceRecipeInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!canAccessModule(session.allowedModules, "kitchen")) throw new Error("Only Kitchen can save a recipe.");
    if (input.approve && !(await kitchenPlanAccess(session)).canPlan) throw new Error("Only a chef, the Kitchen PIC, a manager or an admin can approve a recipe. Save it as a draft for them to approve.");
    const supabase = await createClient();
    const db = untyped(supabase);

    const name = clean(input.name, 120);
    if (!name) throw new Error("Write the recipe name.");
    if (!(input.yieldPax >= 1)) throw new Error("The base yield must be at least 1 pax.");
    const lines = input.lines.map((l) => ({ name: clean(l.name, 80).toUpperCase(), unit: normalizeUnit(l.unit), quantity: l.quantity })).filter((l) => l.name);
    if (lines.length === 0) throw new Error("The ingredient list is empty. Add at least one ingredient.");
    if (lines.some((l) => l.quantity !== null && !(l.quantity >= 0))) throw new Error("A quantity cannot be negative.");
    const keys = new Set<string>();
    for (const l of lines) {
      if (keys.has(itemKey(l.name))) throw new Error(`${l.name} is listed twice. Keep one line for each ingredient.`);
      keys.add(itemKey(l.name));
    }

    const { data: existing } = await db.from("recipes").select("id, name").eq("company_id", input.companyId);
    const clash = (existing ?? []).find((r: { name: string }) => itemKey(r.name) === itemKey(name));
    if (clash) throw new Error(`A recipe called "${clash.name}" already exists for this company. It is not changed. Open that recipe, or use another name.`);

    // each ingredient is the stock item of the same name; a new name becomes a new stock item (with no stock)
    const { data: stock } = await db.from("ingredients").select("id, name").eq("company_id", input.companyId).limit(5000);
    const stockByKey = new Map((stock ?? []).map((s: { id: string; name: string }) => [itemKey(s.name), s.id]));
    const ingredientIds: string[] = [];
    for (const l of lines) {
      let id = stockByKey.get(itemKey(l.name));
      if (!id) {
        const { data: made, error } = await db
          .from("ingredients")
          .insert({ company_id: input.companyId, name: l.name, unit_of_measure: STOCK_UNIT[l.unit] ?? l.unit.toLowerCase(), current_stock_qty: 0, reorder_level: 0, unit_cost: 0 })
          .select("id")
          .single();
        if (error) throw error;
        id = made.id as string;
        stockByKey.set(itemKey(l.name), id);
      }
      ingredientIds.push(id);
    }

    const now = new Date().toISOString();
    const { data: recipe, error: recipeError } = await db
      .from("recipes")
      .insert({
        company_id: input.companyId,
        name,
        yield_pax: Math.round(input.yieldPax),
        instructions: input.instructions.trim() || null,
        status: input.approve ? "approved" : "draft",
        source_note: input.sourceNote.trim() || null,
        approved_by: input.approve ? session.userId : null,
        approved_at: input.approve ? now : null,
      })
      .select("id")
      .single();
    if (recipeError) throw recipeError;
    const { error: linesError } = await db.from("recipe_ingredients").insert(lines.map((l, i) => ({ recipe_id: recipe.id, ingredient_id: ingredientIds[i], quantity_per_yield: l.quantity ?? 0, unit: l.unit })));
    if (linesError) throw linesError;
    await recordAudit({ companyId: input.companyId, relatedTable: "recipes", relatedId: recipe.id, action: input.approve ? "recipe_approved" : "recipe_saved_as_draft", newValue: `${name} · ${lines.length} ingredients${input.sourceNote ? ` · ${input.sourceNote}` : ""}` });
    revalidatePath("/kitchen/recipes");
    return { id: recipe.id as string };
  });
}

/** A chef approves a draft recipe as an official company recipe. */
export async function approveRecipe(recipeId: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!canAccessModule(session.allowedModules, "kitchen") || !(await kitchenPlanAccess(session)).canPlan) throw new Error("Only a chef, the Kitchen PIC, a manager or an admin can approve a recipe.");
    const db = untyped(await createClient());
    const { data: recipe } = await db.from("recipes").select("id, name, company_id, status, recipe_ingredients(id)").eq("id", recipeId).maybeSingle();
    if (!recipe) throw new Error("This recipe was not found.");
    if (recipe.status !== "draft") throw new Error("This recipe is already approved.");
    if (!recipe.recipe_ingredients?.length) throw new Error("Add the ingredients to this recipe before approving it.");
    const { error } = await db.from("recipes").update({ status: "approved", approved_by: session.userId, approved_at: new Date().toISOString() }).eq("id", recipeId);
    if (error) throw error;
    await recordAudit({ companyId: recipe.company_id, relatedTable: "recipes", relatedId: recipe.id, action: "recipe_approved", previousValue: "Draft", newValue: `${recipe.name} approved` });
    revalidatePath("/kitchen/recipes");
    revalidatePath(`/kitchen/recipes/${recipeId}`);
    return {};
  });
}
