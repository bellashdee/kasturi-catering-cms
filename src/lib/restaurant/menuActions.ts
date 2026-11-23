"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { UNITS, normUnit } from "@/lib/restaurant/costing";
import { STATIONS } from "@/lib/restaurant/menuData";
import { MAX_FILE_BYTES } from "@/lib/restaurant/feedme";
import { parseFeedMeProducts, productKey, type FeedMeProduct } from "@/lib/restaurant/feedmeProducts";

/**
 * Menu, costing list and recipes of the restaurant. Every action returns an ActionResult; the database refuses what a role may not do
 * (prices: Manager / Admin; recipes: Chef / Manager / Admin; approval: Manager / Admin, never your own version except an Admin) and its message is shown.
 */
async function context() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  const db = (await createClient()) as unknown as SupabaseClient;
  return { session, db };
}

const refresh = () => revalidatePath("/restaurant", "layout");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbError(error: { code?: string; message?: string }, duplicate: string): never {
  if (error.code === "23505") throw new Error(duplicate);
  throw error;
}

const optionalMoney = (v: number | null, label: string): number | null => {
  if (v === null || !Number.isFinite(v)) return null;
  if (v < 0) throw new Error(`${label} cannot be negative.`);
  if (v > 99999) throw new Error(`${label} is too large.`);
  return Math.round(v * 100) / 100;
};

/* ------------------------------------------------------------------ categories */

export async function saveCategory(input: { companyId: string; id?: string; name: string; sortOrder: number }): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const name = input.name.trim();
    if (!name) throw new Error("Write the name of the category.");
    if (name.length > 60) throw new Error("The category name is too long.");
    const sort = Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder) : 0;
    const { error } = input.id
      ? await db.from("rst_menu_categories").update({ name, sort_order: sort }).eq("id", input.id)
      : await db.from("rst_menu_categories").insert({ company_id: input.companyId, name, sort_order: sort });
    if (error) dbError(error, "A category with this name already exists.");
    refresh();
    return {};
  });
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const { error } = await db.from("rst_menu_categories").update({ is_active: active }).eq("id", id);
    if (error) throw error;
    refresh();
    return {};
  });
}

/* ------------------------------------------------------------------ menu items and options */

export type MenuItemInput = {
  companyId: string;
  id?: string;
  code: string;
  name: string;
  description: string;
  categoryId: string;
  price: number | null;
  station: string;
  prepMinutes: number | null;
  portionText: string;
  feedmeName: string;
};

export async function saveMenuItem(input: MenuItemInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { db } = await context();
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code) throw new Error("Write the code (SKU) of the item.");
    if (!name) throw new Error("Write the name of the item.");
    if (code.length > 30) throw new Error("The code is too long (30 letters at most).");
    if (input.station && !STATIONS.some((s) => s.key === input.station)) throw new Error("Choose a kitchen station from the list.");
    if (input.categoryId && !UUID.test(input.categoryId)) throw new Error("Choose a category from the list.");
    const prep = input.prepMinutes === null || !Number.isFinite(input.prepMinutes) ? null : Math.round(input.prepMinutes);
    if (prep !== null && (prep < 0 || prep > 600)) throw new Error("The preparation time must be from 0 to 600 minutes.");
    const row = {
      code,
      name,
      description: input.description.trim() || null,
      category_id: input.categoryId || null,
      price: optionalMoney(input.price, "The price"),
      station: input.station || null,
      prep_minutes: prep,
      portion_text: input.portionText.trim() || null,
      feedme_name: input.feedmeName.trim() || null,
    };
    if (input.id) {
      const { error } = await db.from("rst_menu_items").update(row).eq("id", input.id);
      if (error) dbError(error, "Another item already has this code or this FeedMe name.");
      refresh();
      return { id: input.id };
    }
    const { data, error } = await db.from("rst_menu_items").insert({ ...row, company_id: input.companyId }).select("id").single();
    if (error) dbError(error, "Another item already has this code or this FeedMe name.");
    refresh();
    return { id: (data as { id: string }).id };
  });
}

/** Available / temporarily unavailable, and active / deactivated. An item is never deleted. */
export async function setItemFlags(id: string, flags: { isAvailable?: boolean; isActive?: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const patch: Record<string, boolean> = {};
    if (flags.isAvailable !== undefined) patch.is_available = flags.isAvailable;
    if (flags.isActive !== undefined) patch.is_active = flags.isActive;
    if (Object.keys(patch).length === 0) return {};
    const { error } = await db.from("rst_menu_items").update(patch).eq("id", id);
    if (error) throw error;
    refresh();
    return {};
  });
}

export async function saveOption(input: { companyId: string; menuItemId: string; id?: string; kind: "variant" | "addon"; name: string; priceDelta: number }): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const name = input.name.trim();
    if (!name) throw new Error("Write the name of the option.");
    if (input.kind !== "variant" && input.kind !== "addon") throw new Error("Choose variant or add-on.");
    const delta = Number.isFinite(input.priceDelta) ? Math.round(input.priceDelta * 100) / 100 : 0;
    if (delta < -9999 || delta > 9999) throw new Error("The price is not valid.");
    const { error } = input.id
      ? await db.from("rst_menu_options").update({ name, kind: input.kind, price_delta: delta }).eq("id", input.id)
      : await db.from("rst_menu_options").insert({ company_id: input.companyId, menu_item_id: input.menuItemId, name, kind: input.kind, price_delta: delta });
    if (error) dbError(error, "This item already has an option with this name.");
    refresh();
    return {};
  });
}

export async function setOptionActive(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const { error } = await db.from("rst_menu_options").update({ is_active: active }).eq("id", id);
    if (error) throw error;
    refresh();
    return {};
  });
}

/* ------------------------------------------------------------------ the costing list (ingredients) */

export type IngredientInput = { companyId: string; id?: string; name: string; unit: string; unitCost: number | null; yieldPct: number; isSeafood: boolean; notes: string; fromSuggestion: boolean };

export async function saveIngredient(input: IngredientInput): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const name = input.name.trim();
    if (!name) throw new Error("Write the name of the ingredient.");
    const unit = normUnit(input.unit);
    if (!(UNITS as readonly string[]).includes(unit)) throw new Error("Choose the unit from the list (kg, g, l, ml, pcs, pack ...).");
    if (input.unitCost !== null && Number.isFinite(input.unitCost) && (input.unitCost < 0 || input.unitCost > 99999)) throw new Error("The unit cost is not valid.");
    const yieldPct = Number.isFinite(input.yieldPct) ? input.yieldPct : 100;
    if (!(yieldPct > 0) || yieldPct > 100) throw new Error("The usable share (yield) must be above 0 and at most 100 %.");
    const row = { name, unit, unit_cost: input.unitCost === null || !Number.isFinite(input.unitCost) ? null : Math.round(input.unitCost * 10000) / 10000, yield_pct: yieldPct, is_seafood: input.isSeafood, notes: input.notes.trim() || null, price_source: input.fromSuggestion ? "suggestion" : "typed" };
    const { error } = input.id ? await db.from("rst_ingredients").update(row).eq("id", input.id) : await db.from("rst_ingredients").insert({ ...row, company_id: input.companyId });
    if (error) dbError(error, "An ingredient with this name already exists.");
    refresh();
    return {};
  });
}

export async function setIngredientActive(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const { error } = await db.from("rst_ingredients").update({ is_active: active }).eq("id", id);
    if (error) throw error;
    refresh();
    return {};
  });
}

export type PriceSuggestion = { source: "Supplier invoice" | "Supplier quote" | "Supplier purchase"; name: string; supplier: string | null; unit: string | null; price: number; date: string | null };

/**
 * A SUGGESTION for the unit cost of an ingredient: what the suppliers of this company charged for a similar name (supplier invoices, price quotes
 * and purchase history in Supplier & Procurement). Nothing is saved: the person chooses to use a price.
 */
export async function suggestPrices(companyId: string, name: string): Promise<ActionResult<{ suggestions: PriceSuggestion[] }>> {
  return runAction(async () => {
    const { db } = await context();
    const words = name.toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 3);
    const word = words.sort((a, b) => b.length - a.length)[0];
    if (!word) return { suggestions: [] };
    const like = `%${word}%`;
    const [inv, quotes, lines] = await Promise.all([
      db.from("supplier_invoice_items").select("item_name, uom, unit_price, supplier_invoices!inner(company_id, invoice_date, suppliers(name))").eq("supplier_invoices.company_id", companyId).ilike("item_name", like).gt("unit_price", 0).limit(40),
      db.from("supplier_price_quotes").select("item_name, unit, price_per_unit, quoted_on, suppliers(name)").eq("company_id", companyId).ilike("item_name", like).gt("price_per_unit", 0).limit(40),
      db.from("supplier_purchase_lines").select("description, uom, unit_price, doc_date, suppliers(name)").eq("company_id", companyId).ilike("description", like).gt("unit_price", 0).limit(40),
    ]);
    const out: PriceSuggestion[] = [];
    const nameOf = (s: unknown) => (Array.isArray(s) ? (s[0] as { name?: string } | undefined)?.name : (s as { name?: string } | null)?.name) ?? null;
    for (const r of (inv.data ?? []) as Record<string, unknown>[]) {
      const head = (Array.isArray(r.supplier_invoices) ? r.supplier_invoices[0] : r.supplier_invoices) as { invoice_date?: string; suppliers?: unknown } | null;
      out.push({ source: "Supplier invoice", name: String(r.item_name), supplier: nameOf(head?.suppliers), unit: (r.uom as string | null) ?? null, price: Number(r.unit_price), date: head?.invoice_date ?? null });
    }
    for (const r of (quotes.data ?? []) as Record<string, unknown>[]) out.push({ source: "Supplier quote", name: String(r.item_name), supplier: nameOf(r.suppliers), unit: (r.unit as string | null) ?? null, price: Number(r.price_per_unit), date: (r.quoted_on as string | null) ?? null });
    for (const r of (lines.data ?? []) as Record<string, unknown>[]) out.push({ source: "Supplier purchase", name: String(r.description), supplier: nameOf(r.suppliers), unit: (r.uom as string | null) ?? null, price: Number(r.unit_price), date: (r.doc_date as string | null) ?? null });
    out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { suggestions: out.slice(0, 8) };
  });
}

/* ------------------------------------------------------------------ recipes */

export type RecipeInput = {
  menuItemId: string;
  portionYield: number;
  portionText: string;
  instructions: string;
  changeNote: string;
  lines: { ingredientId: string; quantity: number; unit: string; wastePct: number; note: string }[];
};

/** Saves the recipe as a draft: a change to an approved recipe makes a NEW version. The unit costs are taken from the costing list by the database. */
export async function saveRecipe(input: RecipeInput): Promise<ActionResult<{ versionId: string }>> {
  return runAction(async () => {
    const { db } = await context();
    if (!UUID.test(input.menuItemId)) throw new Error("The menu item is missing.");
    if (!Number.isFinite(input.portionYield) || input.portionYield <= 0) throw new Error("Write how many portions the recipe makes (1 for a dish made to order).");
    if (input.lines.length === 0) throw new Error("Add at least one ingredient.");
    const lines = input.lines.map((l, i) => {
      if (!UUID.test(l.ingredientId)) throw new Error(`Line ${i + 1}: choose an ingredient from the costing list.`);
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new Error(`Line ${i + 1}: enter the quantity.`);
      const unit = normUnit(l.unit);
      if (!(UNITS as readonly string[]).includes(unit)) throw new Error(`Line ${i + 1}: choose the unit.`);
      const waste = Number.isFinite(l.wastePct) ? l.wastePct : 0;
      if (waste < 0 || waste >= 90) throw new Error(`Line ${i + 1}: the waste must be from 0 to 89 %.`);
      return { ingredient_id: l.ingredientId, quantity: l.quantity, unit, waste_pct: waste, note: l.note };
    });
    const { data, error } = await db.rpc("rst_save_recipe", {
      p_menu_item: input.menuItemId,
      p_payload: { portion_yield: input.portionYield, portion_text: input.portionText, instructions: input.instructions, change_note: input.changeNote, lines },
    });
    if (error) throw error;
    refresh();
    return { versionId: data as string };
  });
}

export async function approveRecipeVersion(versionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    if (!UUID.test(versionId)) throw new Error("The version is missing.");
    const { error } = await db.rpc("rst_approve_recipe_version", { p_version: versionId });
    if (error) throw error;
    refresh();
    return {};
  });
}

/* ------------------------------------------------------------------ match the menu with the product names of FeedMe */

export type MatchState = "linked" | "suggest" | "new";
export type MatchRow = { key: string; name: string; qty: number | null; price: number | null; category: string | null; state: MatchState; itemId: string | null; itemName: string | null };

async function readProducts(formData: FormData): Promise<{ products: FeedMeProduct[]; source: string; warning: string | null; fileName: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose the FeedMe Excel file first.");
  if (!/\.xlsx$/i.test(file.name)) throw new Error("The file must be an Excel .xlsx file.");
  if (file.size > MAX_FILE_BYTES) throw new Error("This file is too big.");
  const parsed = parseFeedMeProducts(new Uint8Array(await file.arrayBuffer()));
  if (!parsed.ok) throw new Error(parsed.error);
  return { products: parsed.products, source: parsed.source, warning: parsed.warning, fileName: file.name.slice(0, 120) };
}

/** Shows the product names of the file and which menu item each one is, or could be. Nothing is saved. */
export async function previewFeedMeProducts(formData: FormData): Promise<ActionResult<{ fileName: string; source: string; warning: string | null; rows: MatchRow[] }>> {
  return runAction(async () => {
    const { db } = await context();
    const companyId = String(formData.get("companyId") ?? "");
    if (!UUID.test(companyId)) throw new Error("The company is missing. Reload the page.");
    const { products, source, warning, fileName } = await readProducts(formData);
    const { data, error } = await db.from("rst_menu_items").select("id, name, feedme_name").eq("company_id", companyId).range(0, 4999);
    if (error) throw error;
    const items = (data ?? []) as { id: string; name: string; feedme_name: string | null }[];
    const byFeedMe = new Map(items.filter((i) => i.feedme_name).map((i) => [productKey(i.feedme_name as string), i]));
    const byName = new Map(items.filter((i) => !i.feedme_name).map((i) => [productKey(i.name), i]));
    const rows: MatchRow[] = products.map((p) => {
      const k = productKey(p.name);
      const linked = byFeedMe.get(k);
      if (linked) return { ...p, key: k, state: "linked", itemId: linked.id, itemName: linked.name };
      const same = byName.get(k);
      if (same) return { ...p, key: k, state: "suggest", itemId: same.id, itemName: same.name };
      return { ...p, key: k, state: "new", itemId: null, itemName: null };
    });
    return { fileName, source, warning, rows };
  });
}

/**
 * Saves the choices: link a FeedMe name to an existing item (only an item that has no FeedMe name yet: a name is never overwritten) or create a new
 * menu item from the product. The file is read again here, so the names always come from the file. Choices come as "link:<itemId>" or "create".
 */
export async function applyFeedMeMatches(formData: FormData): Promise<ActionResult<{ linked: number; created: number; skipped: string[] }>> {
  return runAction(async () => {
    const { db } = await context();
    const companyId = String(formData.get("companyId") ?? "");
    if (!UUID.test(companyId)) throw new Error("The company is missing. Reload the page.");
    const { products } = await readProducts(formData);
    const byKey = new Map(products.map((p) => [productKey(p.name), p]));
    const choices = formData.getAll("choice").map(String);
    if (choices.length === 0) throw new Error("Choose at least one product to link or create.");

    const { data: cats } = await db.from("rst_menu_categories").select("id, name").eq("company_id", companyId);
    const catByName = new Map(((cats ?? []) as { id: string; name: string }[]).map((c) => [c.name.toLowerCase(), c.id]));
    const { data: existing } = await db.from("rst_menu_items").select("code").eq("company_id", companyId);
    const usedCodes = new Set(((existing ?? []) as { code: string }[]).map((e) => e.code.toLowerCase()));
    let seq = 0;
    const nextCode = () => {
      do seq += 1;
      while (usedCodes.has(`fm-${String(seq).padStart(3, "0")}`));
      const code = `FM-${String(seq).padStart(3, "0")}`;
      usedCodes.add(code.toLowerCase());
      return code;
    };

    let linked = 0;
    let created = 0;
    const skipped: string[] = [];
    for (const raw of choices) {
      const sep = raw.indexOf("|");
      const key = sep >= 0 ? raw.slice(0, sep) : raw;
      const action = sep >= 0 ? raw.slice(sep + 1) : "";
      const product = byKey.get(key);
      if (!product) {
        skipped.push(`${key}: not in the file`);
        continue;
      }
      if (action === "create") {
        const { error } = await db.from("rst_menu_items").insert({
          company_id: companyId,
          code: nextCode(),
          name: product.name,
          feedme_name: product.name,
          category_id: product.category ? catByName.get(product.category.toLowerCase()) ?? null : null,
          // the price of the file is the price FeedMe sells at; the database lets only a Manager or an Admin set a price, so a Chef creates the item without one
          price: null,
        });
        if (error) {
          if (error.code === "23505") skipped.push(`${product.name}: already exists`);
          else throw error;
        } else created += 1;
      } else if (action.startsWith("link:")) {
        const itemId = action.slice(5);
        if (!UUID.test(itemId)) {
          skipped.push(`${product.name}: choose an item`);
          continue;
        }
        const { data, error } = await db.from("rst_menu_items").update({ feedme_name: product.name }).eq("id", itemId).eq("company_id", companyId).is("feedme_name", null).select("id");
        if (error) {
          if (error.code === "23505") skipped.push(`${product.name}: already linked to another item`);
          else throw error;
        } else if (!data || data.length === 0) skipped.push(`${product.name}: that item already has a FeedMe name`);
        else linked += 1;
      } else skipped.push(`${product.name}: no choice`);
    }
    refresh();
    return { linked, created, skipped };
  });
}
