"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import { consolidate } from "@/lib/purchaseList/calc";
import { getStockMap, loadSelectedMenus } from "@/lib/purchaseList/queries";
import { PURCHASE_ITEM_STATUSES, MEAL_SESSIONS } from "@/lib/purchaseList/constants";

type Result = { ok: boolean; error?: string; id?: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

const fail = (err: unknown, fallback: string): Result => ({ ok: false, error: err instanceof Error ? err.message : fallback });

export type PurchaseListInput = {
  companyId: string;
  eventName: string;
  customerName?: string;
  eventDate?: string;
  mealSession?: string;
  requiredPax: number;
  cateringEventId?: string;
  notes?: string;
  /** The weekly menu this list was generated from (shown on the list; the quantities still come from the menu records). */
  menuCategory?: string;
  weekNumbers?: number[];
  mealSessions?: string[];
  menus: { sourceType: "menu_plan" | "recipe"; sourceId: string }[];
  /** Edits the user made on the calculated lines, keyed by the line's key. Everything else is recalculated on the server. */
  overrides: Record<string, { finalQuantity?: number | null; supplier?: string; remark?: string; status?: string }>;
};

/**
 * Saves a purchase list. The ingredient quantities are recalculated here from the real menu records, so what is stored is
 * exactly what the menu data gives for the stated pax; only the purchase quantity, supplier and remark come from the user.
 * Nothing is deducted from stock and no purchase order is created.
 */
export async function createPurchaseList(input: PurchaseListInput): Promise<Result> {
  try {
    const { supabase, userId } = await requireUser();
    const eventName = input.eventName.trim();
    if (!eventName) throw new Error("Enter the event name.");
    if (!Number.isInteger(input.requiredPax) || input.requiredPax <= 0) throw new Error("Required pax must be a whole number above 0.");
    if (input.mealSession && !MEAL_SESSIONS.includes(input.mealSession)) throw new Error("Select a valid meal session.");
    if (input.menus.length === 0) throw new Error("Select at least one menu.");
    const seen = new Set(input.menus.map((m) => `${m.sourceType}:${m.sourceId}`));
    if (seen.size !== input.menus.length) throw new Error("The same menu was selected twice.");

    const menus = await loadSelectedMenus(supabase, input.companyId, input.menus);
    const stock = await getStockMap(supabase, input.companyId);
    const items = consolidate(menus, input.requiredPax, { stock });
    if (items.length === 0) throw new Error("The selected menus have no ingredients.");

    const { data: list, error } = await supabase
      .from("purchase_lists")
      .insert({
        company_id: input.companyId,
        event_name: eventName,
        customer_name: input.customerName?.trim() || null,
        event_date: input.eventDate || null,
        meal_session: input.mealSession || null,
        required_pax: input.requiredPax,
        catering_event_id: input.cateringEventId || null,
        notes: input.notes?.trim() || null,
        menu_category: input.menuCategory || null,
        week_numbers: input.weekNumbers ?? [],
        meal_sessions: input.mealSessions ?? [],
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const { error: menuError } = await supabase.from("purchase_list_menus").insert(
      menus.map((m, i) => ({ company_id: input.companyId, purchase_list_id: list.id, source_type: m.sourceType, source_id: m.sourceId, menu_label: m.label, group_label: m.groupLabel, sort_order: i })),
    );
    const { error: itemError } = menuError
      ? { error: menuError }
      : await supabase.from("purchase_list_items").insert(
          items.map((it, i) => {
            const o = input.overrides[it.key];
            const finalQuantity = o && "finalQuantity" in o ? o.finalQuantity ?? null : it.suggested;
            if (finalQuantity !== null && !(finalQuantity >= 0)) throw new Error(`${it.name}: the purchase quantity cannot be negative.`);
            if (o?.status && !PURCHASE_ITEM_STATUSES.includes(o.status)) throw new Error(`${it.name}: select a valid status.`);
            return {
              company_id: input.companyId,
              purchase_list_id: list.id,
              ingredient_name: it.name,
              unit: it.unit,
              calculated_quantity: it.calculated,
              final_quantity: finalQuantity,
              rounding_note: it.roundingNote,
              stock_status: it.stockStatus,
              stock_available: it.stockAvailable,
              supplier: o?.supplier?.trim() || null,
              remark: o?.remark?.trim() || null,
              status: o?.status || "pending",
              flags: it.flags,
              breakdown: it.breakdown as unknown as Json,
              sort_order: i,
            };
          }),
        );
    if (itemError) {
      // do not leave a half-saved list behind
      await supabase.from("purchase_lists").delete().eq("id", list.id);
      throw itemError;
    }
    revalidatePath("/kitchen/purchase-lists");
    return { ok: true, id: list.id };
  } catch (err) {
    return fail(err, "Could not save the purchase list.");
  }
}

export async function updatePurchaseListItem(
  itemId: string,
  patch: { finalQuantity?: number | null; status?: string; supplier?: string; remark?: string },
): Promise<Result> {
  try {
    const { supabase } = await requireUser();
    if (patch.status !== undefined && !PURCHASE_ITEM_STATUSES.includes(patch.status)) throw new Error("Select a valid status.");
    if (patch.finalQuantity !== undefined && patch.finalQuantity !== null && !(patch.finalQuantity >= 0)) throw new Error("The purchase quantity cannot be negative.");
    const update: Database["public"]["Tables"]["purchase_list_items"]["Update"] = { updated_at: new Date().toISOString() };
    if (patch.finalQuantity !== undefined) update.final_quantity = patch.finalQuantity;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.supplier !== undefined) update.supplier = patch.supplier.trim() || null;
    if (patch.remark !== undefined) update.remark = patch.remark.trim() || null;
    const { data, error } = await supabase.from("purchase_list_items").update(update).eq("id", itemId).select("purchase_list_id").single();
    if (error) throw error;
    revalidatePath(`/kitchen/purchase-lists/${data.purchase_list_id}`);
    revalidatePath("/kitchen/purchase-lists");
    return { ok: true };
  } catch (err) {
    return fail(err, "Could not update the item.");
  }
}

export async function setAllItemsStatus(listId: string, status: string): Promise<Result> {
  try {
    const { supabase } = await requireUser();
    if (!PURCHASE_ITEM_STATUSES.includes(status)) throw new Error("Select a valid status.");
    const { error } = await supabase.from("purchase_list_items").update({ status, updated_at: new Date().toISOString() }).eq("purchase_list_id", listId);
    if (error) throw error;
    revalidatePath(`/kitchen/purchase-lists/${listId}`);
    revalidatePath("/kitchen/purchase-lists");
    return { ok: true };
  } catch (err) {
    return fail(err, "Could not update the items.");
  }
}

export async function deletePurchaseList(listId: string): Promise<Result> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("purchase_lists").delete().eq("id", listId);
    if (error) throw error;
    revalidatePath("/kitchen/purchase-lists");
    return { ok: true };
  } catch (err) {
    return fail(err, "Could not delete the purchase list.");
  }
}
