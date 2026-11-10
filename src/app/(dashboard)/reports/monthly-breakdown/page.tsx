import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSpending, sameLabel } from "@/lib/finance/queries";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import {
  BARA_COMPANY, BARA_LIMITS, BARA_TITLE, RAW_ITEM_CATEGORIES, netOf, totalOf,
  type BreakdownItem, type BreakdownLine, type Months,
} from "@/lib/monthlyBreakdown/restoranBara";
import { BreakdownEditor } from "@/components/reports/BreakdownEditor";
import { MonthlyBreakdownChart } from "@/components/reports/MonthlyBreakdownChart";
import { Select } from "@/components/ui/Select";
import { PrintButton } from "@/components/reports/PrintButton";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { SoftPage } from "@/components/ui/Soft";

const sum = (v: number[]) => v.reduce((t, x) => t + x, 0);
const pctText = (n: number) => `${(n * 100).toFixed(1)}%`;
const noMonths = (): Months => Array(12).fill(null);

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

/** A heading that leads straight to the place where its figures are saved and can be edited. */
const Heading = ({ to, children, className = "" }: { to: string; children: React.ReactNode; className?: string }) => (
  <a href={to} className={`underline decoration-dotted underline-offset-2 hover:text-primary ${className}`}>{children}</a>
);

/**
 * Monthly Breakdown of Restoran Bara (Senibong), O2 Life: for every month the total sales and how they are spent — raw item cost, labour /
 * salary, utilities, contribution — in RM and as a % of sales against each limit, then net profit. Every figure is saved in the database and
 * can be edited, saved, cancelled or deleted below; a heading leads to where its figures are saved. Finance / Admin only.
 */
export default async function MonthlyBreakdownPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string; company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { year: yearParam, month: monthParam, company: requestedId } = await searchParams;
  const back = <Link href={requestedId ? `/reports?company=${requestedId}` : "/reports"} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>;
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name");
  const o2 = (companies ?? []).find((c) => c.name === BARA_COMPANY);

  // this report is for O2 Life only: never shown for Kasturi Indah, Signature Solution or all companies together
  const { targetCompanyIds } = resolveCompanyScope(session, companies ?? [], requestedId);
  if (!o2 || targetCompanyIds.length !== 1 || targetCompanyIds[0] !== o2.id) {
    return (
      <SoftPage>
        {back}
        <EmptyRow text="The Monthly Breakdown is for O2 Life (Restoran Bara) only. Choose O2 Life in the company selector at the top to open it." />
      </SoftPage>
    );
  }

  const admins = await adminCompanyIds(supabase, [o2.id]);
  if (admins.length === 0) {
    return (
      <SoftPage>
        {back}
        <EmptyRow text="The monthly breakdown holds the restaurant's sales and costs and is only available to Finance / Admin users of O2 Life." />
      </SoftPage>
    );
  }

  const year = Number(yearParam) || malaysiaYearMonth().year;
  // one month chosen: the By Month table shows only that month; nothing chosen = every month
  const month = Math.min(Math.max(Number(monthParam) || 0, 0), 12);
  const shown = (m: number) => !month || m === month - 1;

  const [salesRes, itemsRes, spending] = await Promise.all([
    supabase.from("monthly_sales").select("month, sales_amount").eq("company_id", o2.id).eq("year", year).eq("sales_type", "total"),
    supabase.from("breakdown_items").select("id, line, label, budget, note, amounts, sort_order").eq("company_id", o2.id).eq("year", year).order("sort_order"),
    listSpending(supabase, [o2.id], `${year}-01-01`, `${year}-12-31`),
  ]);

  const sales: Months = noMonths();
  for (const s of salesRes.data ?? []) sales[s.month - 1] = Number(s.sales_amount);

  const items: Record<BreakdownLine, BreakdownItem[]> = { raw: [], labour: [], utilities: [], contribution: [] };
  for (const r of itemsRes.data ?? []) {
    if (r.line in items) items[r.line as BreakdownLine].push({ id: r.id, label: r.label, budget: r.budget === null ? null : Number(r.budget), note: r.note, values: r.amounts.map((v) => (v === null ? null : Number(v))) });
  }

  // food bought and recorded in Company Expenses: the raw item cost of a month with no costing-report figure entered above
  const fromExpenses: Months = noMonths();
  for (const c of spending) {
    const m = Number(c.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12 && RAW_ITEM_CATEGORIES.some((f) => sameLabel(c.category, f))) fromExpenses[m] = (fromExpenses[m] ?? 0) + c.amount;
  }
  const rawManual = totalOf(items.raw);
  const raw: Months = rawManual.map((v, m) => v ?? fromExpenses[m]);
  const labour = totalOf(items.labour);
  const utilities = totalOf(items.utilities);
  const contribution = totalOf(items.contribution);
  const net = netOf(sales, [raw, labour, utilities, contribution]);
  const L = BARA_LIMITS;

  const lines: { key: BreakdownLine; label: string; limit: number; values: Months; color: string }[] = [
    { key: "raw", label: "Raw item cost", limit: L.raw, values: raw, color: "#1e3a5f" },
    { key: "labour", label: "Labour / salary", limit: L.labour, values: labour, color: "#2f7fc1" },
    { key: "utilities", label: "Utilities", limit: L.utilities, values: utilities, color: "#7fb8e6" },
    { key: "contribution", label: "Contribution", limit: L.contribution, values: contribution, color: "#e0a030" },
  ];

  // to date: each line over the months in which it was entered, against the sales of those same months
  const toDate = (v: Months) => {
    const ms = v.map((x, m) => (x !== null && sales[m] !== null ? m : -1)).filter((m) => m >= 0);
    const amount = sum(ms.map((m) => v[m] as number));
    const s = sum(ms.map((m) => sales[m] as number));
    return { amount, pct: s > 0 ? amount / s : null, months: ms.length };
  };
  const salesMonths = sales.filter((s) => s !== null).length;
  const salesToDate = sum(sales.filter((s): s is number => s !== null));
  const netDone = toDate(net);

  return (
    <SoftPage>
      <div>
        {back}
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Monthly Breakdown — {BARA_TITLE}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {BARA_COMPANY} Sdn Bhd · {year}. RM and % of each month&apos;s total sales; red means over the limit; a dash is a month not entered yet. Click a heading to go to where its figures are saved and edit them.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <form method="get" className="flex items-end gap-3">
          {requestedId && <input type="hidden" name="company" value={requestedId} />}
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Year</label>
            <input type="number" name="year" defaultValue={year} className="mt-1 h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Month</label>
            <Select name="month" defaultValue={month} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
              <option value={0}>All months</option>
              {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </div>
          <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply</button>
        </form>
        <PrintButton />
      </div>

      <SectionCard title={`Summary — ${year} to date`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary"><Heading to="#sales">Total sales</Heading></div>
            <div className="mt-1 text-[20px] font-extrabold text-text">{formatCurrency(salesToDate)}</div>
            <div className="text-[12px] text-text-secondary">{salesMonths} month{salesMonths === 1 ? "" : "s"} of sales</div>
          </div>
          {lines.map((l) => {
            const t = toDate(l.values);
            return (
              <div key={l.key} className="rounded-2xl border border-border bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary"><Heading to={`#${l.key}`}>{l.label}</Heading></div>
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
        title={`Where the Sales Went — ${year} (% of sales)`}
        sales={sales}
        segments={[...lines.map((l) => ({ key: l.key, label: l.label, color: l.color, values: l.values })), { key: "net", label: "Net profit", color: "#2e9e6b", values: net }]}
      />

      <SectionCard title={`By Month — ${year}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">
                <th className="px-2 py-2">Limit</th>
                <th className="px-2 py-2">Month</th>
                {MONTH_LABEL.map((m, i) => shown(i) && <th key={m} className="px-2 py-2 text-right">{m.slice(0, 3)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-info-bg/40">
                <td className="px-2 py-2 text-text-secondary">100%</td>
                <td className="px-2 py-2 font-bold text-text"><Heading to="#sales">Total sales</Heading></td>
                {sales.map((s, m) => shown(m) && <Cell key={m} amount={s} sales={s} />)}
              </tr>
              {lines.map((l) => (
                <tr key={l.key} className="border-b border-border">
                  <td className="px-2 py-2 text-text-secondary">{pctText(l.limit)}</td>
                  <td className="px-2 py-2 font-semibold text-text"><Heading to={`#${l.key}`}>{l.label}</Heading></td>
                  {l.values.map((v, m) => shown(m) && <Cell key={m} amount={v} sales={sales[m]} limit={l.limit} />)}
                </tr>
              ))}
              <tr className="bg-info-bg/40">
                <td className="px-2 py-2 text-text-secondary">{pctText(L.net)}</td>
                <td className="px-2 py-2 font-bold text-text">Net profit</td>
                {net.map((v, m) => shown(m) && <Cell key={m} amount={v} sales={sales[m]} limit={L.net} profit />)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-text-secondary">
          Raw item cost = the costing-report figure entered below; a month without one uses the food bought in Company Expenses. Net profit is shown only when sales and all four cost lines are entered for the month.
        </p>
      </SectionCard>

      <BreakdownEditor id="sales" title="Total Sales" source="monthly_sales" kind="sales" companyId={o2.id} year={year} canEdit
        rows={[{ id: "sales", label: "Total sales (RM)", budget: null, note: null, values: sales }]} />

      <BreakdownEditor id="raw" title="Raw Item Cost" source="breakdown_items (line: raw)" kind="raw" companyId={o2.id} year={year} canEdit rows={items.raw}>
        <div className="mt-4 rounded-xl border border-border p-3 text-[12.5px]">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-text">Food bought, from Company Expenses (used for a month with no figure above)</span>
            <Link href={`/spending/expenses?company=${o2.id}`} className="font-semibold text-primary underline">Open Company Expenses →</Link>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-6 lg:grid-cols-12">
            {MONTH_LABEL.map((m, i) => (
              <div key={m}><div className="text-[11px] font-bold uppercase text-text-secondary">{m.slice(0, 3)}</div><div className="tabular-nums text-text">{fromExpenses[i] === null ? "—" : formatCurrency(fromExpenses[i] as number)}</div></div>
            ))}
          </div>
        </div>
      </BreakdownEditor>

      <BreakdownEditor id="labour" title="Labour / Salary" source="breakdown_items (line: labour)" kind="labour" companyId={o2.id} year={year} canEdit rows={items.labour} />
      <BreakdownEditor id="utilities" title="Utilities (rental, hostels, TNB, SAJ, wifi)" source="breakdown_items (line: utilities)" kind="utilities" companyId={o2.id} year={year} canEdit rows={items.utilities} />
      <BreakdownEditor id="contribution" title="Contribution" source="breakdown_items (line: contribution)" kind="contribution" companyId={o2.id} year={year} canEdit rows={items.contribution} />
    </SoftPage>
  );
}
