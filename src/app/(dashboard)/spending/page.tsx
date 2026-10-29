import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAccessModule } from "@/lib/modules";
import { pettyCashAccess } from "@/lib/pettyCash/access";

/** Company Spending opens on the Company Expenses; a person without Admin & Finance access (a petty cash holder) lands on the petty cash. */
export default async function SpendingPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { company } = await searchParams;
  const query = company ? `?company=${company}` : "";
  const { isHolder } = await pettyCashAccess(await createClient(), session.userId);
  // the first tab is the Petty Cash (for a petty cash holder and for Admin & Finance); every other staff member lands on their own claims
  redirect(isHolder || canAccessModule(session.allowedModules, "finance-admin") ? `/spending/petty-cash${query}` : `/spending/my-claims${query}`);
}
