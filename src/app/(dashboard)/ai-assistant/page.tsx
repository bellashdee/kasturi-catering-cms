import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { KNOWLEDGE_BASE } from "@/lib/assistant/knowledge";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { resolveCompanyScope } from "@/lib/companyScope";
import { isRestaurantOnly } from "@/lib/restaurantView";

/** Getting-started tutorials about catering events, event kitchen orders and delivery drivers: left out for O2 Life (the restaurant). */
const CATERING_TUTORIALS = new Set(["gs-04-catering-event", "gs-05-kitchen-production", "gs-06-assign-driver"]);

export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { company } = await searchParams;
  const { data: companies } = await (await createClient()).from("companies").select("id, name");
  const restaurant = isRestaurantOnly(companies ?? [], resolveCompanyScope(session, companies ?? [], company).accessibleIds, company);
  const gettingStarted = KNOWLEDGE_BASE.filter((e) => e.type === "getting-started" && !(restaurant && CATERING_TUTORIALS.has(e.id))).sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">🤖 AI Assistant</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Ask how to use any part of the system, get step-by-step tutorials, or check data you&apos;re authorized to see.
          The assistant only guides you — it never submits, approves, or deletes anything on its own.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        <SectionCard title="Getting Started">
          <ol className="flex flex-col gap-1">
            {gettingStarted.map((entry, i) => (
              <li key={entry.id}>
                <details className="group rounded-lg">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-semibold text-text hover:bg-bg">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10.5px] font-bold text-white">
                      {i + 1}
                    </span>
                    {entry.title}
                  </summary>
                  <div className="whitespace-pre-wrap px-2 pb-3 pt-1 text-[12.5px] leading-relaxed text-text-secondary">
                    {entry.content}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </SectionCard>

        <div className="rounded-xl border border-border bg-white">
          <AssistantChat variant="page" />
        </div>
      </div>
    </div>
  );
}
