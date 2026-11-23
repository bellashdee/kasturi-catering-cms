"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { canAccessModule } from "@/lib/modules";
import { untyped } from "@/lib/kitchenPurchase/shared";

export type MealsPaxDay = {
  companyId: string;
  site: string;
  date: string; // YYYY-MM-DD
  breakfast: number | null;
  lunch: number | null;
  dinner: number | null;
  hitea: number | null;
  remarks: string | null;
};

const cleanPax = (v: number | null, label: string): number | null => {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 100000) throw new Error(`${label} must be a whole number from 0 up.`);
  return v;
};

/** Saves the meals pax of one site for one day (a blank box is saved as blank, 0 is saved as 0). */
export async function saveMealsPaxDay(input: MealsPaxDay): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!canAccessModule(session.allowedModules, "catering")) throw new Error("You do not have access to Catering.");
    if (!session.hasAllCompaniesAccess && !session.companyIds.includes(input.companyId)) throw new Error("You do not have access to this company.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("The date is not valid.");
    const site = input.site.trim();
    if (!site || site.length > 40) throw new Error("The site is not valid.");
    const remarks = (input.remarks ?? "").trim();
    const supabase = await createClient();
    const { error } = await untyped(supabase)
      .from("site_meal_pax")
      .upsert(
        {
          company_id: input.companyId,
          site,
          pax_date: input.date,
          breakfast_pax: cleanPax(input.breakfast, "Breakfast"),
          lunch_pax: cleanPax(input.lunch, "Lunch"),
          dinner_pax: cleanPax(input.dinner, "Dinner"),
          hitea_pax: cleanPax(input.hitea, "Hi-tea"),
          remarks: remarks ? remarks.slice(0, 300) : null,
        },
        { onConflict: "company_id,site,pax_date" },
      );
    if (error) throw error;
    return {};
  });
}

/** Deletes the pax record of one site for one day (the day becomes blank again). */
export async function deleteMealsPaxDay(input: { companyId: string; site: string; date: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!canAccessModule(session.allowedModules, "catering")) throw new Error("You do not have access to Catering.");
    if (!session.hasAllCompaniesAccess && !session.companyIds.includes(input.companyId)) throw new Error("You do not have access to this company.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("The date is not valid.");
    const supabase = await createClient();
    const { error } = await untyped(supabase).from("site_meal_pax").delete().eq("company_id", input.companyId).eq("site", input.site.trim()).eq("pax_date", input.date);
    if (error) throw error;
    return {};
  });
}
