import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type PendingSubmission = {
  kind: "customer" | "quotation";
  id: string;
  title: string;
  detail: string;
  agent: string;
  createdAt: string;
  companyId: string;
};

/** Everything sales agents sent through the public forms that is still waiting for the office to review. */
export async function getPendingSubmissions(supabase: DB, companyIds: string[]) {
  const [customers, quotations] = await Promise.all([
    supabase
      .from("customer_intake_submissions")
      .select("id, name, sales_agent, created_at, company_id", { count: "exact" })
      .in("company_id", companyIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("quotation_requests")
      .select("id, event_name, customer_name, sales_agent, created_at, company_id", { count: "exact" })
      .in("company_id", companyIds)
      .eq("tracking_status", "new_request")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const items: PendingSubmission[] = [
    ...(customers.data ?? []).map((c) => ({
      kind: "customer" as const,
      id: c.id,
      title: c.name,
      detail: "Customer details",
      agent: c.sales_agent,
      createdAt: c.created_at,
      companyId: c.company_id,
    })),
    ...(quotations.data ?? []).map((q) => ({
      kind: "quotation" as const,
      id: q.id,
      title: q.event_name,
      detail: `Quotation request · ${q.customer_name}`,
      agent: q.sales_agent,
      createdAt: q.created_at,
      companyId: q.company_id,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  return { customerCount: customers.count ?? 0, quotationCount: quotations.count ?? 0, items };
}

/** Just the total, for the badge on the Catering menu item (limited to the companies the user can see). */
export async function countPendingSubmissions(supabase: DB): Promise<number> {
  const [customers, quotations] = await Promise.all([
    supabase.from("customer_intake_submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // only the inbox people can read requests at all (row level security), so for everyone else this counts 0
    supabase.from("quotation_requests").select("id", { count: "exact", head: true }).eq("tracking_status", "new_request"),
  ]);
  return (customers.count ?? 0) + (quotations.count ?? 0);
}
