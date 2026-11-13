import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { MenuSelector } from "@/components/kitchenPurchase/MenuSelector";
import { getPlanEvent, listPlanEvents } from "@/lib/kitchenPlan/queries";
import { dayText, myMoment } from "@/lib/kitchenPlan/schedule";
import { loadRecipeRefs } from "@/lib/kitchenAi/data";
import { autoMatch } from "@/lib/kitchenAi/match";
import { isBoughtIn, untyped } from "@/lib/kitchenPurchase/shared";

/** Step 1: choose the event. Step 2: choose its menus (matched to approved recipes) and make the ingredient list. */
export default async function PurchaseRequestEventPage({ searchParams }: { searchParams: Promise<{ company?: string; event?: string; day?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId, event: eventId, day } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  let body: React.ReactNode;
  if (eventId) {
    const event = await getPlanEvent(supabase, eventId, day ?? null);
    if (!event) return <EmptyRow text="This event was not found." />;
    // only approved recipes are used for purchasing; a recipe still in draft is not offered
    const { data: approved } = await untyped(supabase).from("recipes").select("id, name").eq("company_id", event.companyId).neq("status", "draft").order("name").limit(2000);
    const approvedRefs = (approved ?? []) as { id: string; name: string }[];
    const refs = (await loadRecipeRefs(supabase, event.companyId)).filter((r) => approvedRefs.some((a) => a.id === r.id));
    // fruit, kuih and other dishes bought ready-made need no recipe and no ingredients
    const dishes = event.dishes.map((menu) => (isBoughtIn(menu) ? { menu, recipeId: null, boughtIn: true } : { menu, recipeId: autoMatch(menu, refs)?.recipeId ?? null, boughtIn: false }));
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-[20px] font-extrabold text-text">{event.eventName}</div>
          <div className="text-[14px] text-text-secondary">
            {dayText(myMoment(event.date, "12:00"))} · {event.pax || "—"} pax
          </div>
        </div>
        <MenuSelector eventId={event.eventId} dayId={event.dayId} dishes={dishes} recipes={approvedRefs} />
      </div>
    );
  } else {
    const events = await listPlanEvents(supabase, targetCompanyIds);
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[20px] font-extrabold text-text">Which event is the purchase request for?</h2>
          <p className="mt-0.5 text-[14px] text-text-secondary">The menu comes from the Event Order.</p>
        </div>
        {events.length === 0 ? (
          <EmptyRow text="There is no confirmed event coming up." />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {events.map((e) => (
              <li key={`${e.eventId}:${e.dayId ?? ""}`}>
                <Link
                  href={`/kitchen/purchase-requests/event?event=${e.eventId}${e.dayId ? `&day=${e.dayId}` : ""}${requestedId ? `&company=${requestedId}` : ""}`}
                  className="block rounded-xl border border-border bg-surface px-4 py-3.5 hover:border-primary"
                >
                  <div className="text-[16px] font-bold text-text">
                    {e.eventName}
                    {e.dayNumber ? <span className="ml-2 text-[12.5px] font-semibold text-text-muted">Day {e.dayNumber}/{e.dayCount}</span> : null}
                  </div>
                  <div className="text-[13.5px] text-text-secondary">
                    {dayText(myMoment(e.date, "12:00"))} · {e.pax || "—"} pax · {e.dishes.length} menu{e.dishes.length === 1 ? "" : "s"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
      <KitchenSubNav />
      <Link href={`/kitchen/purchase-requests${query}`} className="text-[13.5px] font-semibold text-text-secondary hover:underline">
        ← Back to Purchase Requests
      </Link>
      {body}
    </div>
  );
}
