"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { canAccessModule } from "@/lib/modules";
import { getPlanEvent } from "@/lib/kitchenPlan/queries";
import { consolidateIngredients, itemKey, KITCHEN_EDITABLE, STATUS_LABEL, UNITS, untyped, type RequestStatus } from "./shared";

/** Kitchen = the Kitchen module; Purchaser = the Supplier & Procurement module; approval = managers and admins. */
async function context() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  const supabase = await createClient();
  return {
    session,
    db: untyped(supabase),
    isKitchen: canAccessModule(session.allowedModules, "kitchen"),
    isPurchaser: canAccessModule(session.allowedModules, "supplier-procurement"),
    canApprove: session.role !== "staff",
  };
}

type Ctx = Awaited<ReturnType<typeof context>>;

type Req = { id: string; company_id: string; request_no: string; status: RequestStatus; event_name: string };

const label = (s: string) => STATUS_LABEL[s as RequestStatus] ?? s;

function refresh(requestId?: string) {
  revalidatePath("/kitchen/purchase-requests");
  revalidatePath("/supplier-procurement/kitchen-requests");
  if (requestId) {
    revalidatePath(`/kitchen/purchase-requests/${requestId}`);
    revalidatePath(`/supplier-procurement/kitchen-requests/${requestId}`);
  }
}

async function loadRequest(c: Ctx, id: string): Promise<Req> {
  const { data, error } = await c.db.from("kitchen_purchase_requests").select("id, company_id, request_no, status, event_name").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This purchase request was not found, or you do not have access to it.");
  return data as Req;
}

function need(allowed: boolean, message: string) {
  if (!allowed) throw new Error(message);
}

async function move(c: Ctx, req: Req, to: RequestStatus, extra: Record<string, unknown> = {}, reason?: string) {
  const { error } = await c.db.from("kitchen_purchase_requests").update({ status: to, updated_at: new Date().toISOString(), ...extra }).eq("id", req.id);
  if (error) throw error;
  await recordAudit({ companyId: req.company_id, relatedTable: "kitchen_purchase_requests", relatedId: req.id, action: `status_${to}`, previousValue: label(req.status), newValue: label(to), reason });
}

async function nextRequestNo(db: SupabaseClient, companyId: string) {
  const ym = new Date(Date.now() + 8 * 3600_000).toISOString().slice(2, 7).replace("-", "");
  const prefix = `PR-${ym}-`;
  const { data } = await db.from("kitchen_purchase_requests").select("request_no").eq("company_id", companyId).like("request_no", `${prefix}%`).order("request_no", { ascending: false }).limit(1);
  const last = Number(((data?.[0]?.request_no as string | undefined) ?? "").slice(prefix.length)) || 0;
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}

// ------------------------------------------------------------------------------------------------------------- Kitchen

export type MenuSelection = { menu: string; recipeId: string | null };

/** Event menu selection -> the ingredient list of the approved recipes, consolidated, with the quantities left empty. */
export async function createRequestFromMenus(input: { eventId: string; dayId: string | null; selections: MenuSelection[] }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const c = await context();
    need(c.isKitchen, "Only Kitchen can make a purchase request.");
    const supabase = await createClient();
    const event = await getPlanEvent(supabase, input.eventId, input.dayId);
    if (!event) throw new Error("This event was not found, or you do not have access to it.");
    const chosen = input.selections.filter((s) => s.recipeId);
    if (chosen.length === 0) throw new Error("Select at least one menu that has an approved recipe.");

    const ids = Array.from(new Set(chosen.map((s) => s.recipeId as string)));
    const { data: recipes, error } = await c.db
      .from("recipes")
      .select("id, name, status, company_id, recipe_ingredients(unit, ingredients(name, unit_of_measure))")
      .in("id", ids);
    if (error) throw error;
    type RecipeRow = { id: string; name: string; status: string | null; company_id: string; recipe_ingredients: { unit: string | null; ingredients: { name: string; unit_of_measure: string | null } | null }[] };
    const byId = new Map((recipes as unknown as RecipeRow[]).map((r) => [r.id, r]));
    const menus = chosen.map((s) => {
      const r = byId.get(s.recipeId as string);
      if (!r || r.company_id !== event.companyId) throw new Error("A recipe was not found for this company.");
      if (r.status === "draft") throw new Error(`The recipe "${r.name}" is still a draft. A chef must approve it first.`);
      return { menu: s.menu || r.name, lines: r.recipe_ingredients.filter((l) => l.ingredients).map((l) => ({ name: l.ingredients!.name, unit: l.unit || l.ingredients!.unit_of_measure })) };
    });
    const items = consolidateIngredients(menus);
    if (items.length === 0) throw new Error("The selected recipes have no ingredients yet. Add the ingredients to the recipes first.");

    const requestNo = await nextRequestNo(c.db, event.companyId);
    const { data: created, error: insertError } = await c.db
      .from("kitchen_purchase_requests")
      .insert({ company_id: event.companyId, request_no: requestNo, catering_event_id: event.eventId, event_name: event.eventName, event_date: event.date, status: "draft", created_by: c.session.userId })
      .select("id")
      .single();
    if (insertError) throw insertError;
    const { error: itemsError } = await c.db.from("kitchen_purchase_request_items").insert(
      items.map((it, i) => ({ request_id: created.id, company_id: event.companyId, sort_order: i, item_name: it.itemName, item_key: itemKey(it.itemName), unit: it.unit, quantity: null, menus: it.menus, remark: it.remark })),
    );
    if (itemsError) throw itemsError;
    await recordAudit({ companyId: event.companyId, relatedTable: "kitchen_purchase_requests", relatedId: created.id, action: "created", newValue: `${requestNo} · ${event.eventName} · ${items.length} items from ${menus.length} menus` });
    refresh();
    return { id: created.id as string };
  });
}

export type ItemInput = { id?: string; itemName: string; unit: string; quantity: number | null; menus: string[]; remark: string };

/** Kitchen reviews the list: add, edit or delete an ingredient, write the quantity of each. */
export async function saveRequestItems(input: { requestId: string; notes: string; items: ItemInput[] }): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const c = await context();
    need(c.isKitchen, "Only Kitchen can change the ingredient list.");
    const req = await loadRequest(c, input.requestId);
    need(KITCHEN_EDITABLE.includes(req.status), `This request is "${label(req.status)}" and can no longer be changed by Kitchen.`);

    const names = new Set<string>();
    const rows = input.items.map((it, i) => {
      const name = it.itemName.replace(/\s+/g, " ").trim();
      if (!name) throw new Error(`Line ${i + 1}: write the item name.`);
      if (!(UNITS as readonly string[]).includes(it.unit)) throw new Error(`${name}: choose the unit.`);
      if (it.quantity !== null && !(it.quantity > 0)) throw new Error(`${name}: the quantity must be more than 0 (or leave it empty).`);
      if (it.quantity !== null && it.quantity > 1_000_000) throw new Error(`${name}: the quantity is too large.`);
      const key = itemKey(name);
      if (names.has(key)) throw new Error(`${name} is listed twice. Keep one line for each ingredient.`);
      names.add(key);
      return { ...it, itemName: name, key };
    });
    if (rows.length === 0) throw new Error("The list has no ingredient. Add at least one item.");

    const { data: existing, error } = await c.db.from("kitchen_purchase_request_items").select("id, item_key, unit, selected_quote_id").eq("request_id", req.id);
    if (error) throw error;
    const before = new Map((existing ?? []).map((e: { id: string; item_key: string; unit: string; selected_quote_id: string | null }) => [e.id, e]));
    const keep = new Set(rows.map((r) => r.id).filter((x): x is string => !!x && before.has(x)));
    const removed = [...before.keys()].filter((id) => !keep.has(id));
    if (removed.length > 0) {
      const { error: delError } = await c.db.from("kitchen_purchase_request_items").delete().in("id", removed);
      if (delError) throw delError;
    }
    for (const [i, r] of rows.entries()) {
      const payload = { sort_order: i, item_name: r.itemName, item_key: r.key, unit: r.unit, quantity: r.quantity, menus: r.menus, remark: r.remark.trim() || null };
      const old = r.id ? before.get(r.id) : undefined;
      if (old) {
        // a changed item or unit is a different thing to buy: the price chosen for the old one no longer applies
        const changed = old.item_key !== r.key || old.unit !== r.unit;
        const { error: upError } = await c.db.from("kitchen_purchase_request_items").update({ ...payload, ...(changed ? { selected_quote_id: null } : {}) }).eq("id", r.id as string);
        if (upError) throw upError;
      } else {
        const { error: insError } = await c.db.from("kitchen_purchase_request_items").insert({ ...payload, request_id: req.id, company_id: req.company_id });
        if (insError) throw insError;
      }
    }
    const complete = rows.every((r) => r.quantity !== null);
    const status: RequestStatus = req.status === "revision_required" ? "revision_required" : complete ? "pending_submission" : "draft";
    const { error: reqError } = await c.db.from("kitchen_purchase_requests").update({ kitchen_notes: input.notes.trim() || null, status, updated_at: new Date().toISOString() }).eq("id", req.id);
    if (reqError) throw reqError;
    await recordAudit({ companyId: req.company_id, relatedTable: "kitchen_purchase_requests", relatedId: req.id, action: "items_edited", newValue: `${rows.length} items, ${rows.filter((r) => r.quantity !== null).length} with a quantity${removed.length ? `, ${removed.length} removed` : ""}` });
    refresh(req.id);
    return { status };
  });
}

/** Kitchen sends the finished request (every item has a quantity) to the Purchaser. */
export async function submitRequest(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isKitchen, "Only Kitchen can submit a purchase request.");
    const req = await loadRequest(c, requestId);
    need(req.status === "pending_submission" || req.status === "revision_required", `This request is "${label(req.status)}" and cannot be submitted now.`);
    const { data: items, error } = await c.db.from("kitchen_purchase_request_items").select("item_name, quantity").eq("request_id", req.id);
    if (error) throw error;
    if (!items?.length) throw new Error("The list has no ingredient.");
    const missing = items.filter((i: { quantity: number | null }) => i.quantity === null).map((i: { item_name: string }) => i.item_name);
    if (missing.length > 0) throw new Error(`Write the quantity of: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ` and ${missing.length - 6} more` : ""}.`);
    await move(c, req, "submitted", { submitted_at: new Date().toISOString(), return_reason: null });
    refresh(req.id);
    return {};
  });
}

/** Kitchen removes a request it has not submitted. */
export async function deleteDraftRequest(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isKitchen, "Only Kitchen can delete a request.");
    const req = await loadRequest(c, requestId);
    need(req.status === "draft" || req.status === "pending_submission" || req.status === "rejected", "Only a request that has not been submitted, or that was rejected, can be deleted.");
    const { error } = await c.db.from("kitchen_purchase_requests").delete().eq("id", req.id);
    if (error) throw error;
    await recordAudit({ companyId: req.company_id, relatedTable: "kitchen_purchase_requests", relatedId: req.id, action: "deleted", previousValue: `${req.request_no} · ${req.event_name} · ${label(req.status)}` });
    refresh();
    return {};
  });
}

// ---------------------------------------------------------------------------------------------------------- Purchaser

export async function startReview(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isPurchaser, "Only the Purchaser can review a request.");
    const req = await loadRequest(c, requestId);
    need(req.status === "submitted", `This request is "${label(req.status)}".`);
    await move(c, req, "under_review");
    refresh(req.id);
    return {};
  });
}

/** The Purchaser writes the price a supplier offered for one item (the history of offers is kept). */
export async function addQuote(input: { requestId: string; itemId: string; supplierId: string; pricePerUnit: number; note?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isPurchaser, "Only the Purchaser can enter supplier prices.");
    const req = await loadRequest(c, input.requestId);
    need(req.status === "under_review", "Start the review first. Prices can only be entered while the request is Under Review.");
    if (!input.supplierId) throw new Error("Choose the supplier.");
    if (!(input.pricePerUnit >= 0) || !Number.isFinite(input.pricePerUnit)) throw new Error("Enter the price per unit.");
    if (input.pricePerUnit > 1_000_000) throw new Error("The price is too large.");
    const { data: item, error } = await c.db.from("kitchen_purchase_request_items").select("id, item_name, item_key, unit, selected_quote_id").eq("id", input.itemId).eq("request_id", req.id).maybeSingle();
    if (error) throw error;
    if (!item) throw new Error("This item is not in the request.");
    const { data: supplier } = await c.db.from("suppliers").select("id, name, company_id").eq("id", input.supplierId).maybeSingle();
    if (!supplier || supplier.company_id !== req.company_id) throw new Error("This supplier does not belong to this company.");
    const { data: quote, error: insError } = await c.db
      .from("supplier_price_quotes")
      .insert({ company_id: req.company_id, supplier_id: input.supplierId, item_key: item.item_key, item_name: item.item_name, unit: item.unit, price_per_unit: input.pricePerUnit, note: input.note?.trim() || null, entered_by: c.session.userId })
      .select("id")
      .single();
    if (insError) throw insError;
    // the first price entered for an item is chosen for it; the Purchaser can choose another one
    if (!item.selected_quote_id) await c.db.from("kitchen_purchase_request_items").update({ selected_quote_id: quote.id }).eq("id", item.id);
    await recordAudit({ companyId: req.company_id, relatedTable: "kitchen_purchase_requests", relatedId: req.id, action: "price_entered", newValue: `${item.item_name} · ${supplier.name} · RM ${input.pricePerUnit.toFixed(2)} / ${item.unit}` });
    refresh(req.id);
    return {};
  });
}

export async function selectQuote(input: { requestId: string; itemId: string; quoteId: string | null }): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isPurchaser, "Only the Purchaser can choose a supplier.");
    const req = await loadRequest(c, input.requestId);
    need(req.status === "under_review", "Suppliers can only be chosen while the request is Under Review.");
    const { data: item } = await c.db.from("kitchen_purchase_request_items").select("id, item_key, item_name").eq("id", input.itemId).eq("request_id", req.id).maybeSingle();
    if (!item) throw new Error("This item is not in the request.");
    if (input.quoteId) {
      const { data: q } = await c.db.from("supplier_price_quotes").select("id, item_key, price_per_unit, suppliers(name)").eq("id", input.quoteId).eq("company_id", req.company_id).maybeSingle();
      if (!q || q.item_key !== item.item_key) throw new Error("This price is not for this item.");
      await recordAudit({ companyId: req.company_id, relatedTable: "kitchen_purchase_requests", relatedId: req.id, action: "supplier_selected", newValue: `${item.item_name} · ${(q.suppliers as unknown as { name: string } | null)?.name ?? "Supplier"} · RM ${Number(q.price_per_unit).toFixed(2)}` });
    }
    const { error: upError } = await c.db.from("kitchen_purchase_request_items").update({ selected_quote_id: input.quoteId }).eq("id", item.id);
    if (upError) throw upError;
    refresh(req.id);
    return {};
  });
}

/** Purchaser (or an approver) sends the request back to Kitchen: the quantity or an item needs correcting. */
export async function returnToKitchen(requestId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isPurchaser || c.canApprove, "Only the Purchaser or an approver can return a request.");
    const req = await loadRequest(c, requestId);
    need(req.status === "under_review" || req.status === "pending_approval", `This request is "${label(req.status)}" and cannot be returned now.`);
    const why = reason.trim();
    if (!why) throw new Error("Write what Kitchen must correct.");
    await move(c, req, "revision_required", { return_reason: why }, why);
    refresh(req.id);
    return {};
  });
}

/** Every item has a supplier price chosen: the request goes to the approver. */
export async function sendForApproval(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isPurchaser, "Only the Purchaser can send a request for approval.");
    const req = await loadRequest(c, requestId);
    need(req.status === "under_review", `This request is "${label(req.status)}".`);
    const { data: items, error } = await c.db.from("kitchen_purchase_request_items").select("item_name, selected_quote_id").eq("request_id", req.id);
    if (error) throw error;
    const missing = (items ?? []).filter((i: { selected_quote_id: string | null }) => !i.selected_quote_id).map((i: { item_name: string }) => i.item_name);
    if (missing.length > 0) throw new Error(`Choose a supplier price for: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ` and ${missing.length - 6} more` : ""}.`);
    await move(c, req, "pending_approval");
    refresh(req.id);
    return {};
  });
}

export async function approveRequest(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.canApprove, "Only a manager or an admin can approve a purchase request.");
    const req = await loadRequest(c, requestId);
    need(req.status === "pending_approval", `This request is "${label(req.status)}", not waiting for approval.`);
    await move(c, req, "approved", { approved_by: c.session.userId, approved_at: new Date().toISOString() });
    refresh(req.id);
    return {};
  });
}

export async function rejectRequest(requestId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isPurchaser || c.canApprove, "Only the Purchaser or an approver can reject a request.");
    const req = await loadRequest(c, requestId);
    need(["submitted", "under_review", "pending_approval"].includes(req.status), `This request is "${label(req.status)}" and cannot be rejected now.`);
    const why = reason.trim();
    if (!why) throw new Error("Write the reason for rejecting.");
    await move(c, req, "rejected", { return_reason: why }, why);
    refresh(req.id);
    return {};
  });
}

export async function markPurchased(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isPurchaser, "Only the Purchaser can mark a request as purchased.");
    const req = await loadRequest(c, requestId);
    need(req.status === "approved", `This request is "${label(req.status)}". It must be Approved first.`);
    await move(c, req, "purchased");
    refresh(req.id);
    return {};
  });
}

/** Completed: the goods have arrived. Kitchen or the Purchaser closes the request. */
export async function markCompleted(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const c = await context();
    need(c.isPurchaser || c.isKitchen, "You cannot complete this request.");
    const req = await loadRequest(c, requestId);
    need(req.status === "purchased", `This request is "${label(req.status)}". It must be Purchased first.`);
    await move(c, req, "completed");
    refresh(req.id);
    return {};
  });
}

