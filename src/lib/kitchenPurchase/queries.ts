import type { SupabaseClient } from "@supabase/supabase-js";
import { itemKey, untyped, type PastPrice, type Quote, type RequestItem } from "./shared";

export type RequestRow = {
  id: string;
  company_id: string;
  request_no: string;
  catering_event_id: string | null;
  event_name: string;
  event_date: string | null;
  status: string;
  kitchen_notes: string | null;
  return_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  companies?: { name: string } | null;
};

/** Requests of the companies, newest first. `statuses` limits the list (the Purchaser sees what Kitchen has submitted, not the drafts). */
export async function listKitchenRequests(client: SupabaseClient, companyIds: string[], statuses?: string[]) {
  const db = untyped(client);
  let q = db.from("kitchen_purchase_requests").select("*, companies(name), kitchen_purchase_request_items(count)").in("company_id", companyIds).order("created_at", { ascending: false }).limit(300);
  if (statuses) q = q.in("status", statuses);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as (RequestRow & { kitchen_purchase_request_items: { count: number }[] })[]).map((r) => ({ ...r, itemCount: r.kitchen_purchase_request_items?.[0]?.count ?? 0 }));
}

export type RequestDetail = {
  request: RequestRow;
  items: RequestItem[];
  /** every offered price recorded for the items of this request, newest first (history is kept) */
  quotes: Quote[];
};

export async function getKitchenRequest(client: SupabaseClient, id: string): Promise<RequestDetail | null> {
  const db = untyped(client);
  const { data: request, error } = await db.from("kitchen_purchase_requests").select("*, companies(name)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!request) return null;
  const { data: itemRows, error: itemError } = await db.from("kitchen_purchase_request_items").select("*").eq("request_id", id).order("sort_order");
  if (itemError) throw itemError;
  const items: RequestItem[] = (itemRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    sortOrder: r.sort_order as number,
    itemName: r.item_name as string,
    unit: r.unit as string,
    quantity: r.quantity === null ? null : Number(r.quantity),
    menus: (r.menus as string[]) ?? [],
    remark: (r.remark as string | null) ?? null,
    selectedQuoteId: (r.selected_quote_id as string | null) ?? null,
  }));
  const keys = Array.from(new Set((itemRows ?? []).map((r: Record<string, unknown>) => r.item_key as string)));
  let quotes: Quote[] = [];
  if (keys.length > 0) {
    const { data: q, error: quoteError } = await db
      .from("supplier_price_quotes")
      .select("id, supplier_id, item_key, price_per_unit, unit, quoted_on, note, created_at, suppliers(name)")
      .eq("company_id", (request as RequestRow).company_id)
      .in("item_key", keys)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (quoteError) throw quoteError;
    quotes = (q ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      supplierId: r.supplier_id as string,
      supplierName: (r.suppliers as { name: string } | null)?.name ?? "Supplier",
      itemKey: r.item_key as string,
      pricePerUnit: Number(r.price_per_unit),
      unit: r.unit as string,
      quotedOn: r.quoted_on as string,
      note: (r.note as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  }
  return { request: request as RequestRow, items, quotes };
}

export type TrailEntry = { id: string; action: string; by: string; at: string; previous: string | null; next: string | null; reason: string | null };

/** Who did what to a request and when: every status change, edit, price and approval. */
export async function requestTrail(client: SupabaseClient, requestId: string): Promise<TrailEntry[]> {
  const db = untyped(client);
  const { data, error } = await db.from("task_audit_log").select("id, action, performed_by, created_at, previous_value, new_value, reason").eq("related_table", "kitchen_purchase_requests").eq("related_id", requestId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  const ids = Array.from(new Set((data ?? []).map((r: { performed_by: string | null }) => r.performed_by).filter((x: string | null): x is string => !!x)));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await db.from("profiles").select("id, full_name").in("id", ids);
    for (const p of people ?? []) names.set(p.id, (p.full_name as string).trim());
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    action: r.action as string,
    by: names.get(r.performed_by as string) ?? "—",
    at: r.created_at as string,
    previous: (r.previous_value as string | null) ?? null,
    next: (r.new_value as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
  }));
}

/** Suppliers of the companies, for the Purchaser's supplier choice. */
export async function listSuppliersFor(client: SupabaseClient, companyIds: string[]) {
  const { data, error } = await untyped(client).from("suppliers").select("id, name").in("company_id", companyIds).order("name").limit(1000);
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

/** The last purchase cost of each item of a request, by item key (the stock list keeps it from the supplier purchases). */
export async function pastPricesFor(client: SupabaseClient, companyId: string): Promise<Record<string, PastPrice>> {
  const { data, error } = await untyped(client).from("ingredients").select("name, unit_of_measure, unit_cost").eq("company_id", companyId).gt("unit_cost", 0).limit(5000);
  if (error) throw error;
  const out: Record<string, PastPrice> = {};
  for (const r of (data ?? []) as { name: string; unit_of_measure: string | null; unit_cost: number | string }[]) {
    const key = itemKey(r.name);
    if (!out[key]) out[key] = { unit: r.unit_of_measure ?? "", cost: Number(r.unit_cost) };
  }
  return out;
}
