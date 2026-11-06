import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { menuRows } from "@/lib/catering/days";

type DB = SupabaseClient<Database>;

/**
 * The menu items the Catering quotation lists for a production order: those of its own event day, else of the
 * event day on the order's planned date (older orders have no day link), else the event's only day, else the event's menu text.
 */
export function orderMenuItems(order: {
  planned_date: string | null;
  catering_event_days?: { menu_details: string | null } | null;
  catering_events?: { menu_description: string | null; catering_event_days?: { day_date: string; menu_details: string | null }[] | null } | null;
}): string[] {
  const days = order.catering_events?.catering_event_days ?? [];
  const text =
    order.catering_event_days?.menu_details ||
    days.find((d) => d.day_date === order.planned_date)?.menu_details ||
    (days.length === 1 ? days[0].menu_details : null) ||
    order.catering_events?.menu_description;
  return menuRows(text);
}

export async function listProductionOrders(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("production_orders")
    .select("*, catering_events(event_name, menu_description, catering_event_days(day_date, menu_details)), catering_event_days(menu_details), recipes(name), menu_plan_dishes(name), companies(name)")
    .in("company_id", companyIds)
    .order("planned_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getProductionOrder(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("production_orders")
    .select("*, catering_events(event_name, pax_count, event_date, setup_time, event_time, menu_description, catering_event_days(day_date, menu_details)), catering_event_days(day_date, setup_time, event_time, menu_details), recipes(id, name, yield_pax), companies(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listIngredients(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase
    .from("ingredients")
    .select("*, suppliers(name), companies(name)")
    .in("company_id", companyIds)
    .order("name");
  if (search) query = query.ilike("name", `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getIngredient(supabase: DB, id: string) {
  const { data, error } = await supabase.from("ingredients").select("*, companies(name)").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function listStockMovementsForIngredient(supabase: DB, ingredientId: string) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("ingredient_id", ingredientId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

export async function listStockMovementsForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*, ingredients(name, unit_of_measure), companies(name)")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function listMenus(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("menus")
    .select("*, menu_items(id), companies(name)")
    .in("company_id", companyIds)
    .order("name");
  if (error) throw error;
  return data;
}

export async function getMenu(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("menus")
    .select("*, menu_items(*), companies(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listRecipes(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("recipes")
    // only the number of ingredient lines is shown in the list: counted by the database, not sent line by line
    .select("*, menu_items(name), recipe_ingredients(count), companies(name)")
    .in("company_id", companyIds)
    .order("name");
  if (error) throw error;
  return data;
}

export async function getRecipe(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("recipes")
    .select("*, menu_items(name), recipe_ingredients(*, ingredients(name, unit_of_measure, current_stock_qty, unit_cost)), companies(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listPurchaseRequests(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*, ingredients(name, unit_of_measure), suppliers(name), companies(name)")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export type IngredientRequirement = {
  ingredientId: string;
  ingredientName: string;
  unit: string | null;
  quantityNeeded: number;
  currentStock: number;
  unitCost: number;
  sufficient: boolean;
};

export async function getDailyKitchenReport(supabase: DB, companyIds: string[], date: string) {
  const dayStart = `${date}T00:00:00+08:00`;
  const dayEnd = `${date}T23:59:59.999+08:00`;

  const [ordersRes, movementsRes, purchaseRequestsRes] = await Promise.all([
    supabase
      .from("production_orders")
      .select("*, recipes(name), companies(name)")
      .in("company_id", companyIds)
      .eq("planned_date", date),
    supabase
      .from("stock_movements")
      .select("*, ingredients(name, unit_cost, unit_of_measure)")
      .in("company_id", companyIds)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd),
    supabase
      .from("purchase_requests")
      .select("*, ingredients(name), suppliers(name), companies(name)")
      .in("company_id", companyIds)
      .not("status", "in", "(completed,rejected)"),
  ]);

  const orders = ordersRes.data ?? [];
  const movements = movementsRes.data ?? [];
  const consumed = movements.filter((m) => m.movement_type === "out");
  const wastage = movements.filter((m) => m.movement_type === "wastage");
  const received = movements.filter((m) => m.movement_type === "in");

  const costOf = (rows: typeof movements) =>
    rows.reduce((total, m) => total + Math.abs(Number(m.quantity)) * Number(m.ingredients?.unit_cost ?? 0), 0);

  return {
    orders,
    consumed,
    wastage,
    received,
    consumedCost: costOf(consumed),
    wastageCost: costOf(wastage),
    pendingPurchaseRequests: purchaseRequestsRes.data ?? [],
  };
}

/** Recipe + Pax -> ingredient requirements, scaled from the recipe's base yield. */
export function scaleIngredientRequirements(
  recipeIngredients: { ingredient_id: string; quantity_per_yield: number; unit: string | null; ingredients: { name: string; unit_of_measure: string | null; current_stock_qty: number; unit_cost: number } | null }[],
  yieldPax: number,
  targetPax: number,
): IngredientRequirement[] {
  const factor = yieldPax > 0 ? targetPax / yieldPax : 0;
  return recipeIngredients.map((ri) => {
    const quantityNeeded = Math.round(ri.quantity_per_yield * factor * 1000) / 1000;
    const currentStock = Number(ri.ingredients?.current_stock_qty ?? 0);
    return {
      ingredientId: ri.ingredient_id,
      ingredientName: ri.ingredients?.name ?? "Unknown",
      unit: ri.unit ?? ri.ingredients?.unit_of_measure ?? null,
      quantityNeeded,
      currentStock,
      unitCost: Number(ri.ingredients?.unit_cost ?? 0),
      sufficient: currentStock >= quantityNeeded,
    };
  });
}
