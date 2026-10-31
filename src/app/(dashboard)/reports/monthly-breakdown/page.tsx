import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { formatCurrency } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import {
  BARA_COMPANY, BARA_CONTRIBUTION, BARA_LABOUR, BARA_LIMITS, BARA_RAW, BARA_SALES, BARA_TITLE, BARA_UTILITIES, BARA_YEAR,
  netOf, totalOf, type BaraItem,
} from "@/lib/monthlyBreakdown/restoranBara";
import { MonthlyBreakdownChart } from "@/components/reports/MonthlyBreakdownChart";
import { PrintButton } from "@/components/reports/PrintButton";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { SoftPage } from "@/components/ui/Soft";

type Months = (number | null)[];

const sum = (v: number[]) => v.reduce((t, x) => t + x, 0);
const pctText = (n: number) => `${(n * 100).toFixed(1)}%`;

/** A month's figure in RM and, under it, its share of that month's total sales; red when a cost is over its limit (net profit: under it). */
function Cell({ amount, sales, limit, profit }: { amount: number | null; sales: number | null; limit?: number; profit?: boolean }) {
  if (amount === null) return <td className="px-2 py-2 text-right text-text-secondary">—</td>;
  const pct = sales && sales > 0 ? amount / sales : null;
  const bad = limit !== undefined && pct !== null && (profit ? pct < limit : pct > limit);
  return (
    <td className="px-2 py-2 text-right tabular-nums">
      <div className={`font-semibold ${amount < 0 ? "text-danger" : "text-text"}`}>{formatCurrency(amount)}</div>
      {limit !== undefined && <div className={`text-[11.5px] ${bad ? "font-bold text-danger" : "text-text-secondary"}`}>{pct === null ? "—" : pctText(pct)}</div>}
    </td>
  );
}

function Detail({ title, items, total }: { title: string; items: BaraItem[]; total: Months }) {
  const budget = items.reduce((t, i) => t + (i.budget ?? 0), 0);
  const money = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  return (
    <SectionCard title={title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2 text-right">Amount (avg/mth)</th>
              {MONTH_LABEL.map((m) => <th key={m} className="px-2 py-2 text-right">{m.slice(0, 3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.label} className="border-b border-border">
                <td className="px-2 py-2 font-semibold text-text">{i.label}{i.note && <span className="ml-1 font-normal text-text-secondary">({i.note})</span>}</td>
                <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{i.budget === null ? "—" : money(i.budget)}</td>
                {i.values.map((v, m) => <td key={m} className={`px-2 py-2 text-right tabular-nums ${v === null ? "text-text-secondary" : "text-text"}`}>{money(v)}</td>)}
              </tr>
            ))}
            <tr className="bg-info-bg/40 font-bold">
              <td className="px-2 py-2 text-text">Total</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{money(budget)}</td>
              {total.map((v, m) => <td key={m} className="px-2 py-2 text-right tabular-nums text-text">{money(v)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/**
 * Monthly Breakdown of Restoran Bara (Senibong), O2 Life: for every month the total sales and how they are spent — raw item cost, labour /
 * salary, utilities, contribution — in RM and as a % of sales against each limit, then net profit. Finance / Admin only.
 */
export default async function MonthlyBreakdownPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const back = <Link href="/reports" className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>;
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name");
  const o2 = (companies ?? []).find((c) => c.name === BARA_COMPANY);
  const admins = o2 ? await adminCompanyIds(supabase, [o2.id]) : [];
  if (admins.length === 0) {
    return (
      <SoftPage>
        {back}
        <EmptyRow text="The monthly breakdown holds the restaurant's sales and costs and is only available to Finance / Admin users of O2 Life." />
      </SoftPage>
    );
  }

  const utilities = totalOf(BARA_UTILITIES);
  const contribution = totalOf(BARA_CONTRIBUTION);
  const net = netOf(BARA_SALES, [BARA_RAW, BARA_LABOUR, utilities, contribution]);
  const L = BARA_LIMITS;

  const lines: { key: string; label: string; limit: number; values: Months; color: string }[] = [
    { key: "raw", label: "Raw item cost", limit: L.raw, values: BARA_RAW, color: "#1e3a5f" },
    { key: "labour", label: "Labour / salary", limit: L.labour, values: BARA_LABOUR, color: "#2f7fc1" },
    { key: "utilities", label: "Utilities", limit: L.utilities, values: utilities, color: "#7fb8e6" },
    { key: "contribution", label: "Contribution", limit: L.contribution, values: contribution, color: "#e0a030" },
  ];

  // to date: each line over the months in which it was entered, against the sales of those same months
  const toDate = (v: Months) => {
    const ms = v.map((x, m) => (x !== null && BARA_SALES[m] !== null ? m : -1)).filter((m) => m >= 0);
    const amount = sum(ms.map((m) => v[m] as number));
    const sales = sum(ms.map((m) => BARA_SALES[m] as number));
    return { amount, pct: sales > 0 ? amount / sales : null, months: ms.length };
  };
  const salesToDate = sum(BARA_SALES.filter((s): s is number => s !== null));
  const netDone = toDate(net);

  return (
    <SoftPage>
      <div>
        {back}
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Monthly Breakdown — {BARA_TITLE}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {BARA_COMPANY} Sdn Bhd · {BARA_YEAR} · from the Sales &amp; Costing workbooks. RM and % of each month&apos;s total sales; red means over the limit. A dash is a month not entered yet.
        </p>
      </div>

      <div className="flex justify-end print:hidden"><PrintButton /></div>

      <SectionCard title={`Summary — ${BARA_YEAR} to date`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">Total sales</div>
            <div className="mt-1 text-[20px] font-extrabold text-text">{formatCurrency(salesToDate)}</div>
            <div className="text-[12px] text-text-secondary">{BARA_SALES.filter((s) => s !== null).length} months of sales</div>
          </div>
          {lines.map((l) => {
            const t = toDate(l.values);
            return (
              <div key={l.key} className="rounded-2xl border border-border bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">{l.label}</div>
                <div className="mt-1 text-[20px] font-extrabold text-text">{formatCurrency(t.amount)}</div>
                <div className={`text-[12px] ${t.pct !== null && t.pct > l.limit ? "font-bold text-danger" : "text-text-secondary"}`}>
                  {t.pct === null ? "—" : pctText(t.pct)} · limit {pctText(l.limit)} · {t.months} month{t.months === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">Net profit</div>
            <div className={`mt-1 text-[20px] font-extrabold ${netDone.amount < 0 ? "text-danger" : "text-text"}`}>{formatCurrency(netDone.amount)}</div>
            <div className={`text-[12px] ${netDone.pct !== null && netDone.pct < L.net ? "font-bold text-danger" : "text-text-secondary"}`}>
              {netDone.pct === null ? "—" : pctText(netDone.pct)} · target {pctText(L.net)} · {netDone.months} complete month{netDone.months === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-text-secondary">Each line is added over the months where it was entered, against the sales of those same months. Net profit counts only months where every cost line is entered.</p>
      </SectionCard>

      <MonthlyBreakdownChart
        title={`Where the Sales Went — ${BARA_YEAR} (% of sales)`}
        sales={BARA_SALES}
        segments={[...lines.map((l) => ({ key: l.key, label: l.label, color: l.color, values: l.values })), { key: "net", label: "Net profit", color: "#2e9e6b", values: net }]}
      />

      <SectionCard title={`By Month — ${BARA_YEAR}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">
                <th className="px-2 py-2">Limit</th>
                <th className="px-2 py-2">Month</th>
                {MONTH_LABEL.map((m) => <th key={m} className="px-2 py-2 text-right">{m.slice(0, 3)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-info-bg/40">
                <td className="px-2 py-2 text-text-secondary">100%</td>
                <td className="px-2 py-2 font-bold text-text">Total sales</td>
                {BARA_SALES.map((s, m) => <Cell key={m} amount={s} sales={s} />)}
              </tr>
              {lines.map((l) => (
                <tr key={l.key} className="border-b border-border">
                  <td className="px-2 py-2 text-text-secondary">{pctText(l.limit)}</td>
                  <td className="px-2 py-2 font-semibold text-text">{l.label}</td>
                  {l.values.map((v, m) => <Cell key={m} amount={v} sales={BARA_SALES[m]} limit={l.limit} />)}
                </tr>
              ))}
              <tr className="bg-info-bg/40">
                <td className="px-2 py-2 text-text-secondary">{pctText(L.net)}</td>
                <td className="px-2 py-2 font-bold text-text">Net profit</td>
                {net.map((v, m) => <Cell key={m} amount={v} sales={BARA_SALES[m]} limit={L.net} profit />)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-text-secondary">
          Raw item cost = the actual cost of the month in the costing report. Net profit is shown only when sales and all four cost lines are entered for the month.
        </p>
      </SectionCard>

      <Detail title="Basic — Utilities (rental, hostels, TNB, SAJ, wifi)" items={BARA_UTILITIES} total={utilities} />
      <Detail title="Contribution" items={BARA_CONTRIBUTION} total={contribution} />
    </SoftPage>
  );
}
