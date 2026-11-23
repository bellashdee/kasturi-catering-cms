import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { addDays, fetchDayTotals, fetchSalesLines } from "@/lib/restaurant/dashboard";
import { formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { CHANNELS, PAYMENT_METHODS } from "@/lib/restaurant/constants";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { SalesDay } from "@/components/restaurant/SalesDay";
import { DayTotalsList } from "@/components/restaurant/DayTotalsList";
import { SPEND_INPUT } from "@/components/spending/formStyles";

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export default async function DailySalesPage({ searchParams }: { searchParams: Promise<{ company?: string; date?: string; from?: string; to?: string; channel?: string; method?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;

  const today = todayInMalaysia();
  // a range (opened from the dashboard) is read-only and can be filtered; one day can be edited
  const isRange = isDate(sp.from) && isDate(sp.to) && sp.from !== sp.to;
  const date = isDate(sp.date) ? (sp.date as string) : isDate(sp.from) && sp.from === sp.to ? (sp.from as string) : today;
  const from = isRange ? (sp.from as string) : date;
  const to = isRange ? (sp.to as string) : date;
  const [rangeFrom, rangeTo] = from <= to ? [from, to] : [to, from];
  const [fetchedLines, dayTotals] = await Promise.all([fetchSalesLines(ctx.db, ctx.company.id, rangeFrom, rangeTo), fetchDayTotals(ctx.db, ctx.company.id, rangeFrom, rangeTo)]);
  let lines = fetchedLines;
  if (sp.channel && CHANNELS.some((c) => c.key === sp.channel)) lines = lines.filter((l) => l.channel === sp.channel);
  if (sp.method && PAYMENT_METHODS.some((p) => p.key === sp.method)) lines = lines.filter((l) => l.payment_method === sp.method);

  const q = ctx.requestedCompany ? `&company=${ctx.requestedCompany}` : "";
  const dayLink = (d: string) => `/restaurant/sales?date=${d}${q}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Daily Sales</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {ctx.company.name} · {isRange ? `${formatMalaysiaDate(`${from}T12:00:00+08:00`)} to ${formatMalaysiaDate(`${to}T12:00:00+08:00`)}` : formatMalaysiaDate(`${date}T12:00:00+08:00`)}
        </p>
      </div>

      <RestaurantSubNav isAdmin={ctx.can.roles} />

      {isRange ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-text-secondary">Showing a period (read only).</span>
          <Link href={`/restaurant/sales?date=${to}${q}`} className="font-semibold text-primary">Open the last day to enter or change sales</Link>
        </div>
      ) : (
        <form method="get" className="flex flex-wrap items-center gap-2">
          {ctx.requestedCompany && <input type="hidden" name="company" value={ctx.requestedCompany} />}
          <Link href={dayLink(addDays(date, -1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-semibold">← Previous day</Link>
          <input type="date" name="date" defaultValue={date} max={today} className={`${SPEND_INPUT} !mt-0 w-44`} />
          <button type="submit" className="h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold">Go</button>
          <Link href={dayLink(addDays(date, 1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-semibold">Next day →</Link>
          {date !== today && <Link href={dayLink(today)} className="text-[13px] font-semibold text-primary">Today</Link>}
        </form>
      )}

      <DayTotalsList rows={dayTotals} canSell={ctx.can.sell && !isRange} canManage={ctx.can.manage && !isRange} />

      <SalesDay key={`${from}-${to}-${sp.channel ?? ""}-${sp.method ?? ""}`} companyId={ctx.company.id} date={date} lines={lines} canSell={ctx.can.sell} canManage={ctx.can.manage} readOnly={isRange} extraDrafts={dayTotals.filter((d) => d.status === "draft").length} />
    </div>
  );
}
