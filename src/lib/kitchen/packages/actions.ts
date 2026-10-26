"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export type PackageRow = Database["public"]["Tables"]["package_menus"]["Row"];
export type PackageItemRow = Database["public"]["Tables"]["package_menu_items"]["Row"];
export type PackageSnapshot = { pkg: PackageRow; items: PackageItemRow[] };

/** Changes a package menu: its name, price, minimum pax, notes and menu lines (the lines are replaced as they are on the screen). */
export async function updatePackageMenu(id: string, input: Omit<PackageMenuInput, "companyId">): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("package_menus").select("*, package_menu_items(*)").eq("id", id).maybeSingle();
    if (!before) throw new Error("This package was not found (it may have been deleted).");
    if (!input.name?.trim()) throw new Error("Write the name of the package.");
    if (!Number.isFinite(input.pricePerPax) || input.pricePerPax < 0) throw new Error("Enter the price per pax.");
    if (!Number.isFinite(input.minimumPax) || input.minimumPax < 0) throw new Error("Enter the minimum pax.");
    const items = input.items.filter((i) => i.itemName.trim());
    const { error } = await supabase.from("package_menus").update({ name: input.name.trim(), price_per_pax: input.pricePerPax, minimum_pax: input.minimumPax, included_items: input.includedItems?.trim() || null, special_requirements: input.specialRequirements?.trim() || null }).eq("id", id);
    if (error) throw error;
    const { error: deleteError } = await supabase.from("package_menu_items").delete().eq("package_menu_id", id);
    if (deleteError) throw deleteError;
    if (items.length > 0) {
      const { error: insertError } = await supabase.from("package_menu_items").insert(items.map((i, n) => ({ company_id: before.company_id, package_menu_id: id, meal_type: i.mealType, item_name: i.itemName.trim(), sort_order: n })));
      if (insertError) {
        await supabase.from("package_menu_items").insert(before.package_menu_items);
        throw insertError;
      }
    }
    await recordAudit({ companyId: before.company_id, relatedTable: "package_menus", relatedId: id, action: "edited", previousValue: `${before.name} · RM ${before.price_per_pax} · ${before.package_menu_items.length} line(s)`, newValue: `${input.name.trim()} · RM ${input.pricePerPax} · ${items.length} line(s)` });
    revalidatePath("/kitchen/packages");
    revalidatePath(`/kitchen/packages/${id}`);
    return {};
  }, "Could not save the package. Please try again.");
}

/** Deletes a package menu that no event uses; returns it with its lines so the delete can be undone. */
export async function deletePackageMenu(id: string): Promise<ActionResult<{ row: PackageSnapshot }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: pkg } = await supabase.from("package_menus").select("*, package_menu_items(*)").eq("id", id).maybeSingle();
    if (!pkg) throw new Error("This package was not found (it may already be deleted).");
    const { count } = await supabase.from("catering_events").select("id", { count: "exact", head: true }).eq("package_menu_id", id);
    if ((count ?? 0) > 0) throw new Error(`This package is used by ${count} event(s), so it cannot be deleted. Set it to Inactive instead.`);
    const { package_menu_items: items, ...row } = pkg;
    const { data: removed, error } = await supabase.from("package_menus").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the package.");
    await recordAudit({ companyId: pkg.company_id, relatedTable: "package_menus", relatedId: id, action: "deleted", previousValue: `${pkg.name} · RM ${pkg.price_per_pax} · ${items.length} line(s)`, newValue: "Deleted" });
    revalidatePath("/kitchen/packages");
    return { row: { pkg: row, items } };
  }, "Could not delete the package. Please try again.");
}

/** Undo of a delete: the package and its lines come back as they were. */
export async function restorePackageMenu(snapshot: PackageSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { pkg, items } = snapshot;
    if (!pkg?.id || !pkg.company_id) throw new Error("There is nothing to put back.");
    const { error } = await supabase.from("package_menus").insert(pkg);
    if (error) throw new Error("Could not put the package back.");
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("package_menu_items").insert(items);
      if (itemsError) {
        await supabase.from("package_menus").delete().eq("id", pkg.id);
        throw new Error("Could not put the package back.");
      }
    }
    await recordAudit({ companyId: pkg.company_id, relatedTable: "package_menus", relatedId: pkg.id, action: "restored", newValue: `${pkg.name} put back after it was deleted` });
    revalidatePath("/kitchen/packages");
    return {};
  }, "Could not put the package back.");
}
