import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { listPurchaseLines } from "@/lib/procurement/purchaseLines";
import { addDays } from "@/lib/catering/calendar";
import { optionKey, type SupplierItemOption } from "./shared";

type DB = SupabaseClient<Database>;

export type PlannerEvent = { id: string; name: string; date: string; status: string; pax: number | null };

/** The events a purchase can be planned for: not cancelled, from a month ago on (newest dates last, so the next events come first). */
export async function listPlannerEvents(supabase: DB, companyId: string, today: string): Promise<PlannerEvent[]> {
  const { data, error } = await supabase
    .from("catering_events")
    .select("id, event_name, event_date, status, pax_count")
    .eq("company_id", companyId)
    .neq("status", "cancelled")
    .gte("event_date", addDays(today, -30))
    .order("event_date")
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((e) => ({ id: e.id, name: e.event_name, date: e.event_date, status: e.status, pax: e.pax_count }));
}

/** Every item every supplier of the company sold, with the latest price and unit of measure (from the purchase listings). */
export async function loadSupplierItemOptions(supabase: DB, companyId: string): Promise<SupplierItemOption[]> {
  const lines = await listPurchaseLines(supabase, [companyId]);
  const map = new Map<string, SupplierItemOption>();
  for (const l of lines) {
    if (!l.description.trim() || !l.supplierId) continue;
    const key = optionKey(l.supplierId, l.description, l.uom);
    const cur = map.get(key);
    if (!cur || l.docDate > cur.date) map.set(key, { key, supplierId: l.supplierId, supplierName: l.supplierName, description: l.description.trim(), uom: l.uom, price: l.unitPrice, date: l.docDate });
  }
  return Array.from(map.values()).sort((a, b) => a.description.localeCompare(b.description) || a.supplierName.localeCompare(b.supplierName));
}
