import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { canAccessModule } from "@/lib/modules";

/**
 * The Main Dashboard is gone: the figures live in Reports (kept up to date from what is keyed in). The start page is Reports for the people
 * who can open it, and the Bulletin Board for everyone else. The company chosen stays.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { company } = await searchParams;
  const query = company ? `?company=${company}` : "";
  redirect(canAccessModule(session.allowedModules, "reports") ? `/reports${query}` : `/bulletin${query}`);
}
