import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { canAccessModule } from "@/lib/modules";
import { formatCurrency, formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { channelLabel, paymentLabel } from "@/lib/restaurant/constants";
import {
  RANGE_LABEL,
  addDays,
  fetchCashSessions,
  fetchFoodPurchases,
  fetchMonthlyTotal,
  fetchSalesLines,
  groupNet,
  missingDays,
  resolveRange,
  totalsOf,
  type RangeKey,
} from "@/lib/restaurant/dashboard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { SPEND_INPUT, SPEND_LABEL } from "@/components/spending/formStyles";

const dayText = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

export default async function RestaurantDashboardPage({ searchParams }: { searchParams: Promise<{ company?: string; range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;

  const today = todayInMalaysia();
  const { key, from, to } = resolveRange(sp.range, sp.from, sp.to, today);
  const monthKey = to.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const monthEnd = addDays(`${addDays(monthStart, 40).slice(0, 7)}-01`, -1);
  const canSeeCosts = canAccessModule(ctx.session.allowedModules, "finance-admin");

  const [rangeLines, monthLines, cash, foodPurchases, monthlyTotal] = await Promise.all([
    fetchSalesLines(ctx.db, ctx.company.id, from, to),
    fetchSalesLines(ctx.db, ctx.company.id, monthStart, monthEnd),
    fetchCashSessions(ctx.db, ctx.company.id, from, to),
    canSeeCosts ? fetchFoodPurchases(ctx.db, ctx.company.id, from, to) : Promise.resolve(null),
    canSeeCosts ? fetchMonthlyTotal(ctx.db, ctx.company.id, monthKey) : Promise.resolve(null),
  ]);

  const confirmed = rangeLines.filter((l) => l.status === "confirmed");
  const drafts = rangeLines.filter((l) => l.status === "draft");
  const t = totalsOf(confirmed);
  const byChannel = groupNet(confirmed, (l) => l.channel);
  const byPayment = groupNet(confirmed, (l) => l.payment_method);
  const byDay = groupNet(confirmed, (l) => l.sales_date).sort((a, b) => b.key.localeCompare(a.key));
  const missing = missingDays(from, to, rangeLines, today);
  const closedSessions = cash.filter((s) => s.status === "closed");
  const cashVariance = closedSessions.reduce((sum, s) => sum + (s.variance ?? 0), 0);
  const openSessions = cash.filter((s) => s.status === "open");
  const noSales = confirmed.length === 0;

  const monthConfirmed = monthLines.filter((l) => l.status === "confirmed");
  const monthDaily = totalsOf(monthConfirmed).net;
  const monthDays = new Set(monthConfirmed.map((l) => l.sales_date)).size;

  const q = ctx.requestedCompany ? `&company=${ctx.requestedCompany}` : "";
  const salesLink = (extra: string) => `/restaurant/sales?from=${from}&to=${to}${extra}${q}`;
  const aov = t.orders > 0 ? t.ordersNet / t.orders : null;
  const profitLike = foodPurchases === null ? null : t.net - foodPurchases;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Restaurant Dashboard</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {ctx.company.name} · {from === to ? dayText(from) : `${dayText(from)} to ${dayText(to)}`} · only confirmed sales are counted
        </p>
      </div>

      <RestaurantSubNav isAdmin={ctx.can.roles} />

      <div className="flex flex-wrap items-end gap-2">
        {(["today", "yesterday", "week", "month"] as RangeKey[]).map((r) => (
          <Link key={r} href={`/restaurant?range=${r}${q}`} className={`rounded-lg border px-3.5 py-2 text-[13px] font-semibold ${key === r ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
            {RANGE_LABEL[r]}
          </Link>
        ))}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="range" value="custom" />
          {ctx.requestedCompany && <input type="hidden" name="company" value={ctx.requestedCompany} />}
          <div>
            <label className={SPEND_LABEL}>From</label>
            <input type="date" name="from" defaultValue={from} className={`${SPEND_INPUT} w-40`} />
          </div>
          <div>
            <label className={SPEND_LABEL}>To</label>
            <input type="date" name="to" defaultValue={to} className={`${SPEND_INPUT} w-40`} />
          </div>
          <button type="submit" className={`h-9 rounded-lg border px-3.5 text-[13px] font-semibold ${key === "custom" ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
            Show
          </button>
        </form>
      </div>

      {noSales && (
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-[13.5px] text-text-secondary">
          <span>No confirmed sales for this period yet, so every figure below is RM0.</span>{" "}
          {drafts.length > 0 && <span>{drafts.length === 1 ? "1 draft line is waiting to be confirmed." : `${drafts.length} draft lines are waiting to be confirmed.`}</span>}{" "}
          <Link href={`/restaurant/sales${ctx.query}`} className="font-semibold text-primary">Enter the daily sales</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon="sales" label="Net sales" value={formatCurrency(t.net)} hint={`Gross ${formatCurrency(t.gross)}`} />
        <KpiCard icon="invoice" label="Orders" value={t.orders > 0 ? String(t.orders) : "—"} hint={t.orders > 0 ? "From the lines that have an order count" : "Order count not entered"} />
        <KpiCard icon="payments" label="Average order value" value={aov === null ? "—" : formatCurrency(Math.round(aov * 100) / 100)} hint={aov === null ? "Insufficient data (no order counts)" : "Net sales ÷ orders"} />
        <KpiCard icon="approvals" label="Discounts and refunds" value={formatCurrency(t.discount + t.refund)} hint={`Discounts ${formatCurrency(t.discount)} · refunds ${formatCurrency(t.refund)}`} tone={t.refund > 0 ? "warning" : "neutral"} />
        <KpiCard icon="supplier" label="Food purchases" value={foodPurchases === null ? "—" : formatCurrency(foodPurchases)} hint={foodPurchases === null ? "No access to Company Expenses" : "Food categories of Company Expenses, when bought"} />
        <KpiCard icon="costing" label="Food purchases % of net sales" value={foodPurchases === null ? "—" : pct(foodPurchases, t.net)} hint="The Bara limit for raw items is 38%" tone={foodPurchases !== null && t.net > 0 && foodPurchases / t.net > 0.38 ? "danger" : "neutral"} />
        <KpiCard icon="expenses" label="Sales less food purchases" value={profitLike === null ? "—" : formatCurrency(Math.round(profitLike * 100) / 100)} hint="Estimate: before labour, utilities and other costs" />
        <KpiCard icon="calendar" label="Cash difference" value={closedSessions.length === 0 ? "—" : formatCurrency(Math.round(cashVariance * 100) / 100)} hint={closedSessions.length === 0 ? "No closed cash session" : closedSessions.length === 1 ? "1 closed session" : `${closedSessions.length} closed sessions`} tone={Math.abs(cashVariance) >= 0.005 ? "danger" : "success"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="By channel">
          {byChannel.length === 0 ? (
            <EmptyRow text="No sales for this period." />
          ) : (
            <table className="w-full text-[13.5px]">
              <tbody>
                {byChannel.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0">
                    <td className="py-2"><Link className="text-primary hover:underline" href={salesLink(`&channel=${r.key}`)}>{channelLabel(r.key)}</Link></td>
                    <td className="py-2 text-right text-text-secondary">{pct(r.net, t.net)}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
        <SectionCard title="By payment method">
          {byPayment.length === 0 ? (
            <EmptyRow text="No sales for this period." />
          ) : (
            <table className="w-full text-[13.5px]">
              <tbody>
                {byPayment.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0">
                    <td className="py-2"><Link className="text-primary hover:underline" href={salesLink(`&method=${r.key}`)}>{paymentLabel(r.key)}</Link></td>
                    <td className="py-2 text-right text-text-secondary">{pct(r.net, t.net)}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Day by day">
        {byDay.length === 0 ? (
          <EmptyRow text="No sales for this period." />
        ) : (
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-muted">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 text-right font-semibold">Orders</th>
                <th className="py-2 text-right font-semibold">Net sales</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((r) => (
                <tr key={r.key} className="border-b border-border last:border-0">
                  <td className="py-2"><Link className="text-primary hover:underline" href={`/restaurant/sales?date=${r.key}${q}`}>{dayText(r.key)}</Link></td>
                  <td className="py-2 text-right text-text-secondary">{r.orders > 0 ? r.orders : "—"}</td>
                  <td className="py-2 text-right font-semibold">{formatCurrency(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Needs your attention">
          <div className="flex flex-col gap-2 text-[13.5px]">
            <div className="flex items-center justify-between">
              <span>Draft sales lines not confirmed</span>
              <StatusBadge tone={drafts.length > 0 ? "warning" : "success"}>{drafts.length}</StatusBadge>
            </div>
            <div className="flex items-center justify-between">
              <span>Cash sessions still open</span>
              <StatusBadge tone={openSessions.length > 0 ? "warning" : "success"}>{openSessions.length}</StatusBadge>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Past days with no sales entered</span>
              <StatusBadge tone={missing.length > 0 ? "danger" : "success"}>{missing.length}</StatusBadge>
            </div>
            {missing.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-[12px]">
                {missing.slice(0, 14).map((d) => (
                  <Link key={d} href={`/restaurant/sales?date=${d}${q}`} className="rounded-md border border-border-strong px-2 py-0.5 text-primary">{dayText(d)}</Link>
                ))}
                {missing.length > 14 && <span className="text-text-muted">{`and ${missing.length - 14} more`}</span>}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Daily entries and the AutoCount monthly total">
          {!canSeeCosts ? (
            <EmptyRow text="The monthly total is shown to people with Admin & Finance access." />
          ) : (
            <div className="flex flex-col gap-2 text-[13.5px]">
              <div className="text-[12.5px] text-text-muted">{dayText(monthStart)} to {dayText(monthEnd)}</div>
              <div className="flex items-center justify-between"><span>{`Daily entries (confirmed, ${monthDays} ${monthDays === 1 ? "day" : "days"})`}</span><span className="font-semibold">{formatCurrency(monthDaily)}</span></div>
              <div className="flex items-center justify-between"><span>AutoCount monthly total</span><span className="font-semibold">{monthlyTotal === null ? "not keyed in yet" : formatCurrency(monthlyTotal)}</span></div>
              {monthlyTotal !== null && (
                <div className="flex items-center justify-between border-t border-border pt-2"><span>Difference</span><span className="font-semibold">{formatCurrency(Math.round((monthDaily - monthlyTotal) * 100) / 100)}</span></div>
              )}
              <p className="text-[12px] text-text-muted">The two are shown side by side to be checked. They are never added together, and the monthly reports still use the AutoCount total.</p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
