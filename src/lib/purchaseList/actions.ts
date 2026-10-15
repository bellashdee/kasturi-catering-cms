"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import { consolidate, normaliseName } from "@/lib/purchaseList/calc";
import { suggestItemSuppliers, supplierKey } from "@/lib/purchaseList/suppliers";
import { createPurchaseOrder } from "@/lib/procurement/actions";
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
    // who normally supplies each item (stock item's preferred supplier, else the latest purchase order): a starting point the person can change
    const suggested = await suggestItemSuppliers(supabase, input.companyId, items.map((it) => it.name));
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
              supplier: o?.supplier?.trim() || suggested.get(normaliseName(it.name))?.supplierName || null,
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

export type OrdersFromListResult = {
  ok: boolean;
  error?: string;
  created?: { id: string; poNumber: string; supplier: string; lines: number }[];
  /** Lines that were not ordered, with the reason, so nothing disappears silently. */
  skipped?: { reason: string; items: string[] }[];
};

/**
 * Turns a purchase list into purchase orders, one DRAFT order per supplier: only lines that have a buy quantity, a supplier that
 * is a real supplier record of the company, and no purchase order yet. Prices come from the latest purchase order of that item
 * from that supplier (else the stock item's unit cost, else 0 to fill in). The lines are marked Ordered and linked to their
 * order, so pressing the button again never doubles an order. Nothing is deducted from stock.
 */
export async function createPurchaseOrdersFromList(listId: string): Promise<OrdersFromListResult> {
  try {
    const { supabase } = await requireUser();
    const { data: list, error: listError } = await supabase.from("purchase_lists").select("id, company_id, event_name").eq("id", listId).single();
    if (listError) throw listError;
    const { data: lines, error: linesError } = await supabase
      .from("purchase_list_items")
      .select("id, ingredient_name, unit, final_quantity, supplier, purchase_order_id")
      .eq("purchase_list_id", listId)
      .order("sort_order");
    if (linesError) throw linesError;

    const open = (lines ?? []).filter((l) => !l.purchase_order_id);
    if (open.length === 0) return { ok: false, error: "Every line of this list already has a purchase order." };

    const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("company_id", list.company_id);
    const byName = new Map((suppliers ?? []).map((sup) => [supplierKey(sup.name), sup]));
    const suggested = await suggestItemSuppliers(supabase, list.company_id, open.map((l) => l.ingredient_name));

    const skipped: { reason: string; items: string[] }[] = [];
    const skip = (reason: string, item: string) => {
      const found = skipped.find((x) => x.reason === reason);
      if (found) found.items.push(item);
      else skipped.push({ reason, items: [item] });
    };

    const groups = new Map<string, { supplierId: string; supplierName: string; lines: typeof open }>();
    for (const l of open) {
      if (!(Number(l.final_quantity) > 0)) {
        skip("No buy quantity", l.ingredient_name);
        continue;
      }
      const typed = l.supplier?.trim();
      const record = typed ? byName.get(supplierKey(typed)) : undefined;
      const fallback = !typed ? suggested.get(normaliseName(l.ingredient_name)) : undefined;
      const target = record ? { id: record.id, name: record.name } : fallback ? { id: fallback.supplierId, name: fallback.supplierName } : null;
      if (!target) {
        skip(typed ? `Supplier "${typed}" is not in the supplier list` : "No supplier chosen", l.ingredient_name);
        continue;
      }
      const group = groups.get(target.id) ?? { supplierId: target.id, supplierName: target.name, lines: [] as typeof open };
      group.lines.push(l);
      groups.set(target.id, group);
    }
    if (groups.size === 0) return { ok: false, error: "No line could be ordered. Choose a supplier from the supplier list and a buy quantity for the lines first.", skipped };

    const created: { id: string; poNumber: string; supplier: string; lines: number }[] = [];
    let n = 0;
    for (const g of groups.values()) {
      n += 1;
      const poNumber = `PO-${Date.now().toString().slice(-8)}-${n}`;
      const po = await createPurchaseOrder({
        companyId: list.company_id,
        poNumber,
        supplierId: g.supplierId,
        orderDate: "",
        items: g.lines.map((l) => ({
          itemName: l.ingredient_name,
          quantity: Number(l.final_quantity),
          unit: l.unit ?? undefined,
          unitPrice: suggested.get(normaliseName(l.ingredient_name))?.supplierId === g.supplierId ? suggested.get(normaliseName(l.ingredient_name))?.lastPrice ?? 0 : 0,
        })),
      });
      const ids = g.lines.map((l) => l.id);
      const { error: linkError } = await supabase
        .from("purchase_list_items")
        .update({ purchase_order_id: po.id, status: "ordered", supplier: g.supplierName, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (linkError) throw linkError;
      created.push({ id: po.id, poNumber, supplier: g.supplierName, lines: ids.length });
    }

    revalidatePath(`/kitchen/purchase-lists/${listId}`);
    revalidatePath("/kitchen/purchase-lists");
    revalidatePath("/supplier-procurement/orders");
    return { ok: true, created, skipped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create the purchase orders." };
  }
}

/** Fills the supplier of every line that has none, from the stock item's preferred supplier or the latest purchase order. */
export async function fillSuggestedSuppliers(listId: string): Promise<Result & { filled?: number }> {
  try {
    const { supabase } = await requireUser();
    const { data: list, error } = await supabase.from("purchase_lists").select("company_id").eq("id", listId).single();
    if (error) throw error;
    const { data: lines } = await supabase.from("purchase_list_items").select("id, ingredient_name, supplier").eq("purchase_list_id", listId);
    const blank = (lines ?? []).filter((l) => !l.supplier?.trim());
    const suggested = await suggestItemSuppliers(supabase, list.company_id, blank.map((l) => l.ingredient_name));
    let filled = 0;
    for (const l of blank) {
      const s = suggested.get(normaliseName(l.ingredient_name));
      if (!s) continue;
      const { error: updateError } = await supabase.from("purchase_list_items").update({ supplier: s.supplierName, updated_at: new Date().toISOString() }).eq("id", l.id);
      if (updateError) throw updateError;
      filled += 1;
    }
    revalidatePath(`/kitchen/purchase-lists/${listId}`);
    return { ok: true, filled };
  } catch (err) {
    return fail(err, "Could not fill in the suppliers.");
  }
}
