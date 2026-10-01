import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";

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

  return (
    <div className="flex h-screen overflow-hidden bg-bg print:block print:h-auto print:overflow-visible">
      <Sidebar companies={companies ?? []} />
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <Topbar session={session} />
        <main className="flex-1 overflow-y-auto p-7 print:overflow-visible print:p-0">{children}</main>
      </div>
      <AssistantWidget />
    </div>
  );
}
