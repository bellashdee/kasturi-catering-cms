"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type PackageMenuInput = {
  companyId: string;
  name: string;
  pricePerPax: number;
  minimumPax: number;
  includedItems?: string;
  specialRequirements?: string;
  items: { mealType: string; itemName: string }[];
};

export async function createPackageMenu(input: PackageMenuInput) {
  const { supabase } = await requireUser();
  const { data: pkg, error } = await supabase
    .from("package_menus")
    .insert({
      company_id: input.companyId,
      name: input.name,
      price_per_pax: input.pricePerPax,
      minimum_pax: input.minimumPax,
      included_items: input.includedItems || null,
      special_requirements: input.specialRequirements || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const items = input.items.filter((i) => i.itemName.trim());
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("package_menu_items").insert(
      items.map((i, index) => ({
        company_id: input.companyId,
        package_menu_id: pkg.id,
        meal_type: i.mealType,
        item_name: i.itemName.trim(),
        sort_order: index,
      })),
    );
    if (itemsError) throw itemsError;
  }

  revalidatePath("/kitchen/packages");
  return pkg;
}

export async function setPackageMenuActive(packageId: string, isActive: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("package_menus").update({ is_active: isActive }).eq("id", packageId);
  if (error) throw error;
  revalidatePath("/kitchen/packages");
  revalidatePath(`/kitchen/packages/${packageId}`);
}
