import type { SupabaseClient } from "@supabase/supabase-js";
import { margin, recipeCost, type CostLine, type Margin, type RecipeCost } from "@/lib/restaurant/costing";

/** Reading the menu, the costing list and the recipes of the restaurant (phase 2). Plain values: numbers are numbers. */

export const STATIONS = [
  { key: "grill", label: "Grill / Ikan Bakar" },
  { key: "frying", label: "Frying" },
  { key: "hot_kitchen", label: "Hot Kitchen" },
  { key: "rice_side", label: "Rice & Side Dish" },
  { key: "drinks", label: "Drinks" },
  { key: "packing", label: "Packing" },
] as const;
export const stationLabel = (key: string | null) => STATIONS.find((s) => s.key === key)?.label ?? "—";

export type Category = { id: string; name: string; sort_order: number; is_active: boolean };
export type MenuItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category_id: string | null;
  /** the menu price before service charge and SST; null = not set */
  price: number | null;
  station: string | null;
  prep_minutes: number | null;
  portion_text: string | null;
  feedme_name: string | null;
  is_available: boolean;
  is_active: boolean;
};
export type MenuOption = { id: string; menu_item_id: string; kind: "variant" | "addon"; name: string; price_delta: number; is_active: boolean };
export type Ingredient = { id: string; name: string; unit: string; unit_cost: number | null; yield_pct: number; is_seafood: boolean; price_source: string; notes: string | null; is_active: boolean };
export type Version = {
  id: string;
  recipe_id: string;
  menu_item_id: string;
  version_no: number;
  status: "draft" | "approved";
  portion_yield: number;
  portion_text: string | null;
  instructions: string | null;
  change_note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  lines: VersionLine[];
};
export type VersionLine = CostLine & { id: string; line_no: number; ingredient_id: string | null; ingredient_name: string; note: string | null };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function fetchCategories(db: SupabaseClient, companyId: string): Promise<Category[]> {
  const { data, error } = await db.from("rst_menu_categories").select("id, name, sort_order, is_active").eq("company_id", companyId).order("sort_order").order("name");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function fetchMenuItems(db: SupabaseClient, companyId: string): Promise<MenuItem[]> {
  const { data, error } = await db
    .from("rst_menu_items")
    .select("id, code, name, description, category_id, price, station, prep_minutes, portion_text, feedme_name, is_available, is_active")
    .eq("company_id", companyId)
    .order("name")
    .range(0, 4999);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as MenuItem), price: num(r.price), prep_minutes: num(r.prep_minutes) }));
}

export async function fetchOptions(db: SupabaseClient, companyId: string, menuItemId?: string): Promise<MenuOption[]> {
  let q = db.from("rst_menu_options").select("id, menu_item_id, kind, name, price_delta, is_active").eq("company_id", companyId).order("kind").order("name");
  if (menuItemId) q = q.eq("menu_item_id", menuItemId);
  const { data, error } = await q.range(0, 4999);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as MenuOption), price_delta: Number(r.price_delta) }));
}

export async function fetchIngredients(db: SupabaseClient, companyId: string): Promise<Ingredient[]> {
  const { data, error } = await db.from("rst_ingredients").select("id, name, unit, unit_cost, yield_pct, is_seafood, price_source, notes, is_active").eq("company_id", companyId).order("name").range(0, 4999);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as Ingredient), unit_cost: num(r.unit_cost), yield_pct: Number(r.yield_pct) }));
}

/** Every version of every recipe with its lines (a restaurant has some hundreds of lines at most). `menuItemId` limits it to one dish. */
export async function fetchVersions(db: SupabaseClient, companyId: string, menuItemId?: string): Promise<{ versions: Version[]; currentByItem: Map<string, string> }> {
  let recipesQ = db.from("rst_recipes").select("id, menu_item_id, current_version_id").eq("company_id", companyId);
  if (menuItemId) recipesQ = recipesQ.eq("menu_item_id", menuItemId);
  const { data: recipes, error: re } = await recipesQ.range(0, 4999);
  if (re) throw re;
  const recipeRows = (recipes ?? []) as { id: string; menu_item_id: string; current_version_id: string | null }[];
  if (recipeRows.length === 0) return { versions: [], currentByItem: new Map() };
  const recipeIds = recipeRows.map((r) => r.id);
  const itemOf = new Map(recipeRows.map((r) => [r.id, r.menu_item_id]));

  const LINE_COLUMNS = "id, version_id, line_no, ingredient_id, ingredient_name, quantity, unit, waste_pct, unit_cost, cost_unit, yield_pct, note";
  let versionsQ = db.from("rst_recipe_versions").select("id, recipe_id, version_no, status, portion_yield, portion_text, instructions, change_note, created_by, created_at, approved_by, approved_at").eq("company_id", companyId);
  if (menuItemId) versionsQ = versionsQ.in("recipe_id", recipeIds);
  const { data: vs, error: ve } = await versionsQ.order("version_no", { ascending: false }).range(0, 9999);
  if (ve) throw ve;
  const versionRows = (vs ?? []) as Record<string, unknown>[];
  let linesQ = db.from("rst_recipe_lines").select(LINE_COLUMNS).eq("company_id", companyId);
  if (menuItemId) linesQ = linesQ.in("version_id", versionRows.map((v) => v.id as string));
  const { data: ls, error: le } = versionRows.length === 0 ? { data: [], error: null } : await linesQ.range(0, 19999);
  if (le) throw le;
  const lineRows = (ls ?? []) as Record<string, unknown>[];

  const people = Array.from(new Set(versionRows.flatMap((v) => [v.created_by as string | null, v.approved_by as string | null]).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (people.length > 0) {
    const { data } = await db.from("profiles").select("id, full_name").in("id", people);
    for (const p of (data ?? []) as { id: string; full_name: string | null }[]) names.set(p.id, p.full_name?.trim() || "—");
  }

  const linesBy = new Map<string, VersionLine[]>();
  for (const l of lineRows) {
    const arr = linesBy.get(l.version_id as string) ?? [];
    arr.push({
      id: l.id as string,
      line_no: Number(l.line_no),
      ingredient_id: (l.ingredient_id as string | null) ?? null,
      ingredient_name: l.ingredient_name as string,
      quantity: Number(l.quantity),
      unit: l.unit as string,
      waste_pct: Number(l.waste_pct),
      unit_cost: num(l.unit_cost),
      cost_unit: (l.cost_unit as string | null) ?? null,
      yield_pct: Number(l.yield_pct),
      note: (l.note as string | null) ?? null,
    });
    linesBy.set(l.version_id as string, arr);
  }
  const versions: Version[] = versionRows.map((v) => ({
    id: v.id as string,
    recipe_id: v.recipe_id as string,
    menu_item_id: itemOf.get(v.recipe_id as string) as string,
    version_no: Number(v.version_no),
    status: v.status as "draft" | "approved",
    portion_yield: Number(v.portion_yield),
    portion_text: (v.portion_text as string | null) ?? null,
    instructions: (v.instructions as string | null) ?? null,
    change_note: (v.change_note as string | null) ?? null,
    created_by: (v.created_by as string | null) ?? null,
    created_by_name: v.created_by ? names.get(v.created_by as string) ?? null : null,
    created_at: v.created_at as string,
    approved_by: (v.approved_by as string | null) ?? null,
    approved_by_name: v.approved_by ? names.get(v.approved_by as string) ?? null : null,
    approved_at: (v.approved_at as string | null) ?? null,
    lines: (linesBy.get(v.id as string) ?? []).sort((a, b) => a.line_no - b.line_no),
  }));
  const currentByItem = new Map<string, string>();
  for (const r of recipeRows) if (r.current_version_id) currentByItem.set(r.menu_item_id, r.current_version_id);
  return { versions, currentByItem };
}

export type ItemCost = {
  /** approved = the current approved version; draft = no approved version yet, the latest draft; none = no recipe */
  state: "approved" | "draft" | "none";
  version: Version | null;
  cost: RecipeCost | null;
  margin: Margin;
};

/** The cost of a menu item from its CURRENT approved version (or from its latest draft, marked as a draft). */
export function costOfItem(item: Pick<MenuItem, "id" | "price">, versions: Version[], currentByItem: Map<string, string>): ItemCost {
  const mine = versions.filter((v) => v.menu_item_id === item.id);
  const currentId = currentByItem.get(item.id);
  const current = currentId ? mine.find((v) => v.id === currentId) ?? null : null;
  const draft = mine.filter((v) => v.status === "draft").sort((a, b) => b.version_no - a.version_no)[0] ?? null;
  const version = current ?? draft;
  if (!version) return { state: "none", version: null, cost: null, margin: margin(item.price, null) };
  const cost = recipeCost(version.lines, version.portion_yield);
  return { state: current ? "approved" : "draft", version, cost, margin: margin(item.price, cost.perPortion) };
}
