"use server";

import { createClient } from "@/lib/supabase/server";

export type DescriptionOption = { text: string; hint: string };

const PAGE = 1000;
const MAX_PAGES = 6;
const MAX_OPTIONS = 2500;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * The choices of every Description box: the items on the supplier purchase listings and in the kitchen stock, and the descriptions
 * already used in expenses, petty cash and event costs (only what is really in the system, filtered by the person's access).
 * One line per name, A to Z. Typing something that is not listed is always allowed.
 */
export async function listDescriptionOptions(companyId: string | null): Promise<DescriptionOption[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const seen = new Map<string, DescriptionOption>();
    const add = (value: string | null | undefined, hint: string) => {
      const text = (value ?? "").trim().replace(/\s+/g, " ");
      if (text.length < 2 || text.length > 200) return;
      const k = norm(text);
      if (!seen.has(k)) seen.set(k, { text, hint });
    };
    const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T) => (companyId ? q.eq("company_id", companyId) : q);

    // the purchase listings (many rows: read the pages, the names repeat)
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await scoped(supabase.from("supplier_purchase_lines").select("description").order("description")).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error || !data) break;
      for (const r of data) add(r.description, "Supplier item");
      if (data.length < PAGE) break;
    }

    const [stock, expenses, marketing, petty, operation, costs] = await Promise.all([
      scoped(supabase.from("ingredients").select("name").order("name").limit(3000)),
      scoped(supabase.from("expenses").select("notes").not("notes", "is", null).limit(3000)),
      scoped(supabase.from("marketing_expenses").select("description").limit(2000)),
      scoped(supabase.from("petty_cash_transactions").select("description").limit(2000)),
      scoped(supabase.from("operation_petty_cash").select("description").limit(2000)),
      scoped(supabase.from("event_cost_entries").select("description").limit(2000)),
    ]);
    for (const r of stock.data ?? []) add(r.name, "Stock item");
    for (const r of expenses.data ?? []) add(r.notes, "Used before");
    for (const r of marketing.data ?? []) add(r.description, "Used before");
    for (const r of petty.data ?? []) add(r.description, "Used before");
    for (const r of operation.data ?? []) add(r.description, "Used before");
    for (const r of costs.data ?? []) add(r.description, "Used before");

    return Array.from(seen.values())
      .sort((a, b) => a.text.localeCompare(b.text))
      .slice(0, MAX_OPTIONS);
  } catch {
    return [];
  }
}
