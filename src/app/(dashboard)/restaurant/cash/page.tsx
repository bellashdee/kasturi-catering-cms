import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { addDays, closeUpCash, expectedCash, fetchCashSessions, fetchCloseUps, fetchDayTotals, fetchSalesLines } from "@/lib/restaurant/dashboard";
import { formatCurrency, formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { CashPanel, type CashView } from "@/components/restaurant/CashPanel";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_INPUT } from "@/components/spending/formStyles";

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const dayText = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);

export default async function CashSessionsPage({ searchParams }: { searchParams: Promise<{ company?: string; date?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;

  const today = todayInMalaysia();
  const date = isDate(sp.date) ? (sp.date as string) : today;
  const historyFrom = addDays(today, -30);

  const [daySessions, dayLines, history, dayTotals, closeUps] = await Promise.all([
    fetchCashSessions(ctx.db, ctx.company.id, date, date),
    fetchSalesLines(ctx.db, ctx.company.id, date, date),
    fetchCashSessions(ctx.db, ctx.company.id, historyFrom, today),
    fetchDayTotals(ctx.db, ctx.company.id, date, date),
    fetchCloseUps(ctx.db, ctx.company.id, date, date),
  ]);

  // the cash sales of the day from a confirmed FeedMe Close up (the CASH total); a draft one must be confirmed first
  const confirmedIds = new Set(dayTotals.filter((d) => d.status === "confirmed").map((d) => d.id));
  const draftIds = new Set(dayTotals.filter((d) => d.status === "draft").map((d) => d.id));
  const closeUp = {
    confirmedCash: closeUpCash(closeUps.splits.filter((sp) => confirmedIds.has(sp.day_total_id)), date),
    draftWaiting: closeUps.closeups.some((c) => draftIds.has(c.day_total_id)),
    sessionsToday: daySessions.length,
  };

  const views: CashView[] = daySessions.map((s) => {
    const e = expectedCash(s, dayLines, closeUp);
    return {
      id: s.id,
      date: s.session_date,
      shift: s.shift_no,
      opening: s.opening_cash,
      cashExpenses: s.cash_expenses,
      withdrawals: s.withdrawals,
      status: s.status,
      cashIn: e.cashIn,
      // a closed session shows the figures it was closed with
      expected: s.status === "closed" && s.expected_closing !== null ? s.expected_closing : e.expected,
      drafts: e.drafts,
      counted: s.counted_closing,
      variance: s.variance,
      note: s.variance_note,
      reopenReason: s.reopen_reason,
      source: e.source,
      closeUpCash: e.closeUpCashOfDay,
      waiting: e.waiting,
      // a closed session is never changed: when the figures known now give another expected cash, it is flagged
      changedExpected: s.status === "closed" && s.expected_closing !== null && Math.abs(e.expected - s.expected_closing) >= 0.005 ? e.expected : null,
    };
  });

  const q = ctx.requestedCompany ? `&company=${ctx.requestedCompany}` : "";
  const dayLink = (d: string) => `/restaurant/cash?date=${d}${q}`;
  const withDifference = history.filter((s) => s.status === "closed" && Math.abs(s.variance ?? 0) >= 0.005);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Cash Sessions</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · {dayText(date)} · expected cash = opening cash + cash sales − cash expenses − withdrawals</p>
      </div>

      <RestaurantSubNav isAdmin={ctx.can.roles} />

      <form method="get" className="flex flex-wrap items-center gap-2">
        {ctx.requestedCompany && <input type="hidden" name="company" value={ctx.requestedCompany} />}
        <Link href={dayLink(addDays(date, -1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-semibold">← Previous day</Link>
        <input type="date" name="date" defaultValue={date} max={today} className={`${SPEND_INPUT} !mt-0 w-44`} />
        <button type="submit" className="h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold">Go</button>
        <Link href={dayLink(addDays(date, 1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-semibold">Next day →</Link>
        {date !== today && <Link href={dayLink(today)} className="text-[13px] font-semibold text-primary">Today</Link>}
      </form>

      <CashPanel companyId={ctx.company.id} date={date} sessions={views} canSell={ctx.can.sell} canManage={ctx.can.manage} />

      <SectionCard title="Cash differences in the last 30 days">
        {withDifference.length === 0 ? (
          <EmptyRow text={history.some((s) => s.status === "closed") ? "No difference: every closed session matched." : "No closed cash session in the last 30 days."} />
        ) : (
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-muted">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Shift</th>
                <th className="py-2 text-right font-semibold">Expected</th>
                <th className="py-2 text-right font-semibold">Counted</th>
                <th className="py-2 text-right font-semibold">Difference</th>
                <th className="py-2 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {withDifference.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="py-2"><Link className="text-primary hover:underline" href={dayLink(s.session_date)}>{dayText(s.session_date)}</Link></td>
                  <td className="py-2">{s.shift_no}</td>
                  <td className="py-2 text-right">{s.expected_closing === null ? "—" : formatCurrency(s.expected_closing)}</td>
                  <td className="py-2 text-right">{s.counted_closing === null ? "—" : formatCurrency(s.counted_closing)}</td>
                  <td className="py-2 text-right"><StatusBadge tone="danger">{formatCurrency(s.variance ?? 0)}</StatusBadge></td>
                  <td className="py-2">{s.variance_note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
