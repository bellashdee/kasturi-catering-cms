import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { canAccessModule } from "@/lib/modules";

/** Company Spending opens on the Company Expenses; a person without Admin & Finance access (a petty cash holder) lands on the petty cash. */
export default async function SpendingPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { company } = await searchParams;
  const query = company ? `?company=${company}` : "";
  redirect(canAccessModule(session.allowedModules, "finance-admin") ? `/spending/expenses${query}` : `/spending/petty-cash${query}`);
}
