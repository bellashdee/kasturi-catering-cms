import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { MobileNavProvider } from "@/components/layout/MobileNavContext";
import { canUsePayrollCentre } from "@/lib/hr/payrollAccess";
import { canAccessModule } from "@/lib/modules";
import { countPendingSubmissions } from "@/lib/catering/pending";
import { LanguageBootstrap } from "@/components/i18n/LanguageBootstrap";
import { CompanyTheme, CompanyThemeScript } from "@/components/layout/CompanyTheme";
import { Suspense } from "react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // everything the side bar and the top bar need is asked at the same time (not one after another), so every page opens faster
  const [{ data: companies }, { data: profile }, pendingCatering, showPayroll] = await Promise.all([
    supabase.from("companies").select("id, name, legal_name").order("legal_name", { ascending: true }),
    supabase.from("profiles").select("language").eq("id", session.userId).maybeSingle(),
    // sales-agent forms waiting for review show as a number on the Catering menu item, on every page
    canAccessModule(session.allowedModules, "catering") ? countPendingSubmissions(supabase) : Promise.resolve(0),
    canUsePayrollCentre(supabase),
  ]);

  // everyone has their own task list; Super Admins and Company Admins also get Madam Penny's Priority Centre (payments and approvals)
  const isAdmin = session.role === "super_admin" || session.role === "company_admin";
  const taskLabel = isAdmin ? "Priority Centre" : "My Tasks";

  return (
    <MobileNavProvider>
      <LanguageBootstrap profileLanguage={profile?.language ?? null} />
      <CompanyThemeScript companies={companies ?? []} />
      <Suspense fallback={null}>
        <CompanyTheme companies={companies ?? []} />
      </Suspense>
      <div className="flex h-screen overflow-hidden bg-bg print:block print:h-auto print:overflow-visible">
        <Sidebar companies={companies ?? []} allowedModules={session.allowedModules} badges={{ catering: pendingCatering }} taskLinkLabel={taskLabel} showPayroll={showPayroll} scopedToOwnCompanies={!session.hasAllCompaniesAccess} />
        <div className="flex min-w-0 flex-1 flex-col print:block">
          <Topbar session={session} companies={companies ?? []} priorityTitle={taskLabel} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-7 print:overflow-visible print:p-0">{children}</main>
        </div>
        <AssistantWidget />
      </div>
    </MobileNavProvider>
  );
}
