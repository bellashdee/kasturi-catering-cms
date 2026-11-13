import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listPackageMenus(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("package_menus")
    .select("*, package_menu_items(id), companies(name)")
    .in("company_id", companyIds)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data;
}

export async function getPackageMenu(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("package_menus")
    .select("*, package_menu_items(*), companies(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listActivePackageMenusForCompany(supabase: DB, companyId: string) {
  const { data, error } = await supabase
    .from("package_menus")
    .select("id, name, price_per_pax, minimum_pax, package_menu_items(meal_type, item_name, sort_order)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data;
}
