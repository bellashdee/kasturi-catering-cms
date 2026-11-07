import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getServerLanguage } from "@/lib/i18n/server";
import { listPlanEvents, planKey, planProgress } from "@/lib/kitchenPlan/queries";
import { clockText, dayText, myMoment } from "@/lib/kitchenPlan/schedule";
import { kitchenPlanText } from "@/lib/kitchenPlan/text";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { PlanSteps } from "@/components/kitchenPlan/PlanSteps";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";

/** Step 1: choose the event. Nothing is typed: everything is read from the Event Order. */
export default async function CookingPlanPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const lang = (await getServerLanguage()) === "ms" ? "ms" : "en";
  const t = kitchenPlanText(lang);

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId, month } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const events = filterByMonth(await listPlanEvents(supabase, targetCompanyIds), month, (e) => e.date);
  const monthLabel = monthLabelOf(month);
  const progress = await planProgress(supabase, Array.from(new Set(events.map((e) => e.eventId))));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
        <PlanSteps current={1} lang={lang} />
      </div>
      <KitchenSubNav />

      <div>
        <h2 className="text-[20px] font-extrabold text-text">{t.pickTitle}</h2>
        <p className="mt-0.5 text-[14px] text-text-secondary">{t.pickHint}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
      </div>

      <MonthFilter />

      {events.length === 0 ? (
        <EmptyRow text={monthLabel ? (lang === "ms" ? "Tiada acara dalam bulan ini." : "No events in this month.") : t.noEvents} />
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => {
            const p = progress.get(planKey(e.eventId, e.dayId));
            const href = `/kitchen/plan/${e.eventId}${e.dayId ? `?day=${e.dayId}${requestedId ? `&company=${requestedId}` : ""}` : query}`;
            return (
              <li key={`${e.eventId}:${e.dayId ?? ""}`}>
                <Link href={href} className="block rounded-xl border border-border bg-surface px-5 py-4 shadow-sm hover:border-primary">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[17px] font-extrabold text-text">
                        {e.eventName}
                        {e.dayNumber ? <span className="ml-2 text-[13px] font-semibold text-text-muted">{t.day} {e.dayNumber}/{e.dayCount}</span> : null}
                      </div>
                      <div className="mt-0.5 text-[14px] text-text-secondary">
                        {dayText(myMoment(e.date, "12:00"))} · {e.pax || "—"} {t.pax} · {t.foodReady}: <b className="text-text">{e.readyTime ? clockText(myMoment(e.date, e.readyTime)) : t.noTime}</b>
                      </div>
                      {e.companyName && targetCompanyIds.length > 1 && <div className="mt-0.5 text-[12.5px] text-text-muted">{e.companyName}</div>}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${p ? "bg-success-bg text-success" : "bg-surface-alt text-text-secondary"}`}>
                      {p ? `${t.planReady} · ${t.dishesDone(p.done, p.total)}` : t.noPlan}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
