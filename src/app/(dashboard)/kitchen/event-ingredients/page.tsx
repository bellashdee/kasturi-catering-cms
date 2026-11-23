import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { EventIngredientGenerator } from "@/components/kitchen/EventIngredientGenerator";
import { getPlanEvent, listPlanEvents } from "@/lib/kitchenPlan/queries";
import { dayText, myMoment } from "@/lib/kitchenPlan/schedule";
import { loadRecipeRefs } from "@/lib/kitchenAi/data";
import { parseEoText } from "@/lib/kitchenAi/eoMenu";
import { untyped } from "@/lib/kitchenPurchase/shared";

/**
 * Kitchen → Generate Ingredient List. The menu comes from the Event Order (the menu saved on the event) or from an uploaded Word / PDF
 * Event Order. Each dish is matched to a company recipe and the ingredients are worked out from the pax.
 */
export default async function EventIngredientsPage({ searchParams }: { searchParams: Promise<{ company?: string; event?: string; day?: string; upload?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { company: requestedId, event: eventId, day, upload } = await searchParams;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  if (selectable.length === 0) return <EmptyRow text="You don't have access to any company yet." />;
  const query = requestedId ? `?company=${requestedId}` : "";
  const companyParam = requestedId ? `&company=${requestedId}` : "";

  const header = (
    <>
      <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
      <KitchenSubNav />
      <Link href={`/kitchen${query}`} className="text-[13.5px] font-semibold text-text-secondary hover:underline">
        ← Back to Production Schedule
      </Link>
    </>
  );

  async function approvedRecipes(companyId: string) {
    // only approved recipes are used for ingredient lists; a recipe still in draft is not offered
    const { data } = await untyped(supabase).from("recipes").select("id").eq("company_id", companyId).neq("status", "draft").limit(5000);
    const ok = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
    return (await loadRecipeRefs(supabase, companyId)).filter((r) => ok.has(r.id));
  }

  // 1) an event was chosen
  if (eventId) {
    const planEvent = await getPlanEvent(supabase, eventId, day ?? null);
    if (!planEvent) return <EmptyRow text="This event was not found." />;
    const { data: raw } = await supabase.from("catering_events").select("id, menu_description, catering_event_days(id, menu_details)").eq("id", eventId).maybeSingle();
    const dayMenu = raw?.catering_event_days?.find((d) => d.id === (day ?? null))?.menu_details ?? null;
    const sessions = parseEoText(dayMenu || raw?.menu_description, { fallbackPax: planEvent.pax || null });
    const recipes = await approvedRecipes(planEvent.companyId);
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div>
          <div className="text-[20px] font-extrabold text-text">{planEvent.eventName}</div>
          <div className="text-[14px] text-text-secondary">
            {dayText(myMoment(planEvent.date, "12:00"))} · {planEvent.pax || "—"} pax · {planEvent.companyName}
          </div>
        </div>
        <EventIngredientGenerator
          companyId={planEvent.companyId}
          companyName={planEvent.companyName}
          event={{ id: planEvent.eventId, name: planEvent.eventName, date: planEvent.date, pax: planEvent.pax }}
          initialSessions={sessions}
          recipes={recipes}
        />
      </div>
    );
  }

  // 2) only an uploaded file: the recipes of one company are used
  if (upload) {
    const company = targetCompanyIds.length === 1 ? selectable.find((c) => c.id === targetCompanyIds[0]) : selectable.length === 1 ? selectable[0] : undefined;
    if (!company) {
      return (
        <div className="flex flex-col gap-5">
          {header}
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="text-[14px] font-bold text-text">Which company is this Event Order for?</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectable.map((c) => (
                <Link key={c.id} href={`/kitchen/event-ingredients?upload=1&company=${c.id}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface-alt">
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-5">
        {header}
        <h2 className="text-[20px] font-extrabold text-text">Ingredient list from an Event Order file</h2>
        <EventIngredientGenerator companyId={company.id} companyName={company.name} event={null} initialSessions={[]} recipes={await approvedRecipes(company.id)} />
      </div>
    );
  }

  // 3) choose the event
  const events = await listPlanEvents(supabase, targetCompanyIds);
  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-extrabold text-text">Generate ingredient list</h2>
          <p className="mt-0.5 text-[14px] text-text-secondary">Choose the event. The menu comes from its Event Order. Or upload a Word / PDF Event Order.</p>
        </div>
        <Link href={`/kitchen/event-ingredients?upload=1${companyParam}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          Upload an Event Order file
        </Link>
      </div>
      {events.length === 0 ? (
        <EmptyRow text="There is no confirmed event coming up. You can still upload an Event Order file." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {events.map((e) => (
            <li key={`${e.eventId}:${e.dayId ?? ""}`}>
              <Link
                href={`/kitchen/event-ingredients?event=${e.eventId}${e.dayId ? `&day=${e.dayId}` : ""}${companyParam}`}
                className="block rounded-xl border border-border bg-surface px-4 py-3.5 hover:border-primary"
              >
                <div className="text-[16px] font-bold text-text">
                  {e.eventName}
                  {e.dayNumber ? <span className="ml-2 text-[12.5px] font-semibold text-text-muted">Day {e.dayNumber}/{e.dayCount}</span> : null}
                </div>
                <div className="text-[13.5px] text-text-secondary">
                  {dayText(myMoment(e.date, "12:00"))} · {e.pax || "—"} pax · {e.companyName}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
