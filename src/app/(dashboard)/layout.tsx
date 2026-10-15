import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { MobileNavProvider } from "@/components/layout/MobileNavContext";
import { canAccessModule } from "@/lib/modules";
import { countPendingSubmissions } from "@/lib/catering/pending";
import { LanguageBootstrap } from "@/components/i18n/LanguageBootstrap";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, legal_name")
    .order("legal_name", { ascending: true });

  const { data: profile } = await supabase.from("profiles").select("language").eq("id", session.userId).maybeSingle();

  // sales-agent forms waiting for review show as a number on the Catering menu item, on every page
  const pendingCatering = canAccessModule(session.allowedModules, "catering") ? await countPendingSubmissions(supabase) : 0;

  return (
    <MobileNavProvider>
      <LanguageBootstrap profileLanguage={profile?.language ?? null} />
      <div className="flex h-screen overflow-hidden bg-bg print:block print:h-auto print:overflow-visible">
        <Sidebar companies={companies ?? []} allowedModules={session.allowedModules} badges={{ catering: pendingCatering }} />
        <div className="flex min-w-0 flex-1 flex-col print:block">
          <Topbar session={session} companies={companies ?? []} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-7 print:overflow-visible print:p-0">{children}</main>
        </div>
        {canAccessModule(session.allowedModules, "ai-assistant") && <AssistantWidget />}
      </div>
    </MobileNavProvider>
  );
}
