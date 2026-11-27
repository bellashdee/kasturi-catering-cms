import type { SupabaseClient } from "@supabase/supabase-js";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";
import { summariseFund, type FundAllocation, type FundSummary } from "@/lib/snack/constants";

export type SnackItemRow = {
  id: string;
  sort_order: number;
  name: string;
  requested_qty: number | null;
  unit: string | null;
  remarks: string | null;
  item_status: string;
  substitute: string | null;
};

export type SnackRequestRow = {
  id: string;
  request_code: string | null;
  team: string;
  training_date: string | null;
  date_text: string | null;
  date_needs_check: boolean;
  delivery_time: string | null;
  delivery_location: string | null;
  remarks: string | null;
  status: string;
  delivered_at: string | null;
  whatsapp_import_id: string | null;
  created_at: string;
  jdt_snack_items: SnackItemRow[];
};

export type SnackPurchaseRow = {
  id: string;
  request_id: string | null;
  item_id: string | null;
  purchase_date: string;
  training_date: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  supplier: string | null;
  unit_price: number | null;
  total_price: number;
  payment_method: string | null;
  receipt_path: string | null;
  receipt_name: string | null;
  remarks: string | null;
  created_at: string;
};

const REQUEST_SELECT = "id, request_code, team, training_date, date_text, date_needs_check, delivery_time, delivery_location, remarks, status, delivered_at, whatsapp_import_id, created_at, jdt_snack_items(id, sort_order, name, requested_qty, unit, remarks, item_status, substitute)";

/** Whether the signed-in person may handle snack requests and see their money (Purchasing, Admin & Finance, Admin / Management). */
export async function canHandleSnacks(supabase: SupabaseClient | unknown): Promise<boolean> {
  const { data } = await untyped(supabase).rpc("user_can_handle_snacks", { target_company_id: SIGNATURE_COMPANY_ID });
  return data === true;
}

export async function listSnackRequests(supabase: unknown, limit = 200): Promise<SnackRequestRow[]> {
  const { data, error } = await untyped(supabase)
    .from("jdt_snack_requests")
    .select(REQUEST_SELECT)
    .eq("company_id", SIGNATURE_COMPANY_ID)
    .order("training_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as SnackRequestRow[]).map((r) => ({ ...r, jdt_snack_items: [...(r.jdt_snack_items ?? [])].sort((a, b) => a.sort_order - b.sort_order) }));
}

export async function loadSnackRequest(supabase: unknown, id: string): Promise<SnackRequestRow | null> {
  const { data } = await untyped(supabase).from("jdt_snack_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as SnackRequestRow;
  return { ...r, jdt_snack_items: [...(r.jdt_snack_items ?? [])].sort((a, b) => a.sort_order - b.sort_order) };
}

/** Purchases (money): only readable by the people allowed to (the database checks it too). */
export async function listSnackPurchases(supabase: unknown, requestId?: string): Promise<SnackPurchaseRow[]> {
  let q = untyped(supabase).from("jdt_snack_purchases").select("*").eq("company_id", SIGNATURE_COMPANY_ID).order("purchase_date", { ascending: false }).order("created_at", { ascending: false });
  if (requestId) q = q.eq("request_id", requestId);
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  return (data ?? []) as SnackPurchaseRow[];
}

export async function loadSnackFund(supabase: unknown): Promise<FundSummary> {
  const db = untyped(supabase);
  const [{ data: allocations }, { data: purchases }] = await Promise.all([
    db.from("jdt_snack_fund_allocations").select("id, kind, amount, received, received_date, received_reference, approval_status, remarks, created_at, approved_at, verified_at").eq("company_id", SIGNATURE_COMPANY_ID).order("created_at"),
    db.from("jdt_snack_purchases").select("total_price, purchase_date").eq("company_id", SIGNATURE_COMPANY_ID),
  ]);
  return summariseFund((allocations ?? []) as FundAllocation[], (purchases ?? []) as { total_price: number; purchase_date: string }[]);
}
