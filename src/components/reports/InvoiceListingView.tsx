import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { buildReportRows } from "@/lib/reports/buildRows";
import type { InvoiceListingRow } from "@/lib/invoiceListing/data";
import { Select } from "@/components/ui/Select";
import { PrintButton } from "@/components/reports/PrintButton";
import { ReportTable } from "@/components/reports/ReportTable";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { SoftPage } from "@/components/ui/Soft";

const ENTITIES = {
  kasturi: { label: "Kasturi Indah Sdn Bhd", note: "Kasturi Indah Sdn Bhd", withTax: false },
  "ss-catering": { label: "Signature Solution Catering", note: "Food supply for JDT game match events (Signature Solution Sdn Bhd)", withTax: false },
  ss: { label: "Signature Solution Sdn Bhd", note: "Signature Solution Sdn Bhd (invoices with tax)", withTax: true },
} as const;
type EntityKey = keyof typeof ENTITIES;

const YEAR = malaysiaYearMonth().year;
const sum = (rows: InvoiceListingRow[], i: 4 | 5 | 6) => rows.reduce((t, r) => t + r[i], 0);
const monthOf = (r: InvoiceListingRow) => Number(r[1].slice(5, 7));
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * The invoices issued in the year, from the invoices in the system (so this view, the Performance Dashboard, the Monthly Costing sales and the
 * AutoCount listings all give the same total): drafts and quotation requests waiting for review are not issued. Signature Solution has two parts:
 * its Catering invoices (JDT game match, named so in the invoice description) and the rest.
 */
async function loadRows(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Record<EntityKey, InvoiceListingRow[]>> {
  const { data, error } = await supabase
    .from("customer_invoices")
    .select("invoice_number, invoice_date, amount, tax_amount, description, companies(name), customers(name, account_code)")
    .not("status", "in", "(draft,pending_review)")
    .gte("invoice_date", `${YEAR}-01-01`)
    .lte("invoice_date", `${YEAR}-12-31`)
    .order("invoice_date")
    .order("invoice_number")
    .range(0, 4999);
  if (error) throw error;
  const out: Record<EntityKey, InvoiceListingRow[]> = { kasturi: [], "ss-catering": [], ss: [] };
  for (const i of data ?? []) {
    const company = i.companies?.name;
    const sub = Number(i.amount);
    const tax = Number(i.tax_amount ?? 0);
    const row: InvoiceListingRow = [i.invoice_number, i.invoice_date, (i.customers?.account_code ?? "—").replace(/\s*\(.*$/, ""), i.customers?.name ?? "—", sub, tax, sub + tax];
    if (company === "Kasturi Indah") out.kasturi.push(row);
    else if (company === "Signature Solution") (((i.description ?? "").includes("Signature Solution Catering")) ? out["ss-catering"] : out.ss).push(row);
  }
  return out;
}

/** Invoices of the year, month by month: the exact amount is the tooltip. Plain SVG, so it prints as it looks. */
function MonthBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);
  const W = 720;
  const H = 200;
  const group = W / 12;
  const bw = group * 0.62;
  return (
    <svg viewBox={`0 0 ${W} ${H + 40}`} role="img" aria-label={`Invoiced by month ${YEAR}`} className="w-full [print-color-adjust:exact]">
      {values.map((v, i) => {
        const h = max > 0 ? Math.max((v / max) * H, v > 0 ? 2 : 0) : 0;
        const x = i * group + (group - bw) / 2;
        return (
          <g key={i}>
            <rect x={x} y={22 + H - h} width={bw} height={h} rx="2" style={{ fill: "var(--color-navy-700)" }}>
              <title>{`${MONTH_LABEL[i]} ${YEAR}: ${formatCurrency(v)}`}</title>
            </rect>
            {v > 0 && (
              <text x={x + bw / 2} y={18 + H - h} textAnchor="middle" fontSize="9" style={{ fill: "var(--color-text-secondary)" }}>
                {v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : `${Math.round(v / 1000)}k`}
              </text>
            )}
            <text x={x + bw / 2} y={22 + H + 15} textAnchor="middle" fontSize="10" fontWeight="600" style={{ fill: "var(--color-text)" }}>
              {MONTH_LABEL[i].slice(0, 3)}
            </text>
          </g>
        );
      })}
      <line x1="0" x2={W} y1={22 + H} y2={22 + H} style={{ stroke: "var(--color-border)" }} strokeWidth="1" />
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="mt-1 text-[22px] font-extrabold leading-tight text-text">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-text-secondary">{sub}</div>}
    </div>
  );
}

/** The two views of the Revenue Report: what was invoiced (the AutoCount invoice listings) and what was received (customer payments). */
export function RevenueViewTabs({ active }: { active: "received" | "invoiced" }) {
  const tab = (on: boolean) => `rounded-lg px-4 py-2 text-[13px] font-semibold transition ${on ? "bg-primary text-white" : "border border-border-strong bg-surface text-text hover:border-primary"}`;
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Link href="/reports/revenue" className={tab(active === "received")}>Payments received</Link>
      <Link href="/reports/revenue?view=invoiced" className={tab(active === "invoiced")}>Invoices issued</Link>
    </div>
  );
}

/**
 * Invoices issued (the Invoice Listing view of the Revenue Report): the AutoCount invoice listings of Kasturi Indah Sdn Bhd and Signature Solution
 * Sdn Bhd, which has two parts — Signature Solution Catering (food for the JDT game match events) and Signature Solution Sdn Bhd. Finance / Admin only.
 */
export async function InvoiceListingView({ entity: entityParam, month: monthParam }: { entity?: string; month?: string }) {
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id");
  const admins = await adminCompanyIds(supabase, (companies ?? []).map((c) => c.id));

  const back = (
    <Link href="/reports" className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
  );
  if (admins.length === 0) {
    return (
      <SoftPage>
        {back}
        <RevenueViewTabs active="invoiced" />
        <EmptyRow text="The invoice listing holds every customer invoice and is only available to Finance / Admin users." />
      </SoftPage>
    );
  }

  const data = await loadRows(supabase);
  const entityKey: EntityKey = entityParam && entityParam in ENTITIES ? (entityParam as EntityKey) : "kasturi";
  const entity = { ...ENTITIES[entityKey], rows: data[entityKey] };
  const month = Math.min(Math.max(Number(monthParam) || 0, 0), 12); // 0 = the whole year so far

  const byMonth = Array.from({ length: 12 }, (_, i) => sum(entity.rows.filter((r) => monthOf(r) === i + 1), 6));
  const rows = month === 0 ? entity.rows : entity.rows.filter((r) => monthOf(r) === month);
  const total = sum(rows, 6);
  const lastMonthWithInvoices = Math.max(0, ...entity.rows.map(monthOf));
  const periodLabel = month === 0 ? `Jan – ${MONTH_LABEL[Math.max(lastMonthWithInvoices, 1) - 1].slice(0, 3)} ${YEAR}` : `${MONTH_LABEL[month - 1]} ${YEAR}`;

  const debtors = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const d = debtors.get(r[3]) ?? { count: 0, total: 0 };
    d.count += 1;
    d.total += r[6];
    debtors.set(r[3], d);
  }
  const topDebtors = Array.from(debtors.entries()).sort((a, b) => b[1].total - a[1].total);
  const maxDebtor = topDebtors[0]?.[1].total ?? 0;
  const monthsWithInvoices = byMonth.filter((v) => v > 0).length;

  const columns = [
    { key: "doc", label: "Invoice No", exportValue: (r: InvoiceListingRow) => r[0] },
    { key: "date", label: "Date", exportValue: (r: InvoiceListingRow) => dmy(r[1]) },
    { key: "code", label: "Debtor Code", exportValue: (r: InvoiceListingRow) => r[2] },
    { key: "debtor", label: "Debtor Name", exportValue: (r: InvoiceListingRow) => r[3] },
    ...(entity.withTax
      ? [
          { key: "sub", label: "Sub Total (Ex Tax)", exportValue: (r: InvoiceListingRow) => r[4], display: (r: InvoiceListingRow) => formatCurrency(r[4]) },
          { key: "tax", label: "Tax", exportValue: (r: InvoiceListingRow) => r[5], display: (r: InvoiceListingRow) => formatCurrency(r[5]) },
        ]
      : []),
    { key: "total", label: "Total (MYR)", exportValue: (r: InvoiceListingRow) => r[6], display: (r: InvoiceListingRow) => formatCurrency(r[6]) },
  ];
  const { headers, tableRows } = buildReportRows(rows, columns, (r) => r[0]);

  const grand = (list: InvoiceListingRow[]) => sum(list, 6);
  const ssGroup = grand(data.ss) + grand(data["ss-catering"]);

  return (
    <SoftPage>
      <div>
        {back}
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Invoice Listing — {entity.label}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{periodLabel} · {entity.note} · from the invoices in the system (the same figures as the AutoCount invoice listings)</p>
      </div>

      <RevenueViewTabs active="invoiced" />

      {/* the two companies; Signature Solution is shown with its two parts */}
      <div className="grid gap-3 print:hidden lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
          <div className="px-1 pb-2 text-[12px] font-bold uppercase tracking-wider text-text-secondary">Kasturi Indah Sdn Bhd</div>
          <EntityTab k="kasturi" active={entityKey} month={month} total={grand(data.kasturi)} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
          <div className="flex items-baseline justify-between px-1 pb-2 text-[12px] font-bold uppercase tracking-wider text-text-secondary">
            <span>Signature Solution Sdn Bhd</span>
            <span className="tabular-nums">{formatCurrency(ssGroup)} both parts</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <EntityTab k="ss-catering" active={entityKey} month={month} total={grand(data["ss-catering"])} />
            <EntityTab k="ss" active={entityKey} month={month} total={grand(data.ss)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <form method="get" className="flex items-end gap-3">
          <input type="hidden" name="view" value="invoiced" />
          <input type="hidden" name="entity" value={entityKey} />
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Month</label>
            <Select name="month" defaultValue={month} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
              <option value={0}>Whole year ({YEAR})</option>
              {MONTH_LABEL.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </Select>
          </div>
          <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply</button>
        </form>
        <PrintButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Invoiced · ${periodLabel}`} value={formatCurrency(total)} sub={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`} />
        {entity.withTax ? (
          <>
            <Stat label="Sub total (ex tax)" value={formatCurrency(sum(rows, 4))} />
            <Stat label="Tax" value={formatCurrency(sum(rows, 5))} />
          </>
        ) : (
          <>
            <Stat label="Average per invoice" value={formatCurrency(rows.length ? total / rows.length : 0)} />
            <Stat label="Debtors" value={String(debtors.size)} />
          </>
        )}
        <Stat label="Average per month" value={formatCurrency(monthsWithInvoices ? sum(entity.rows, 6) / monthsWithInvoices : 0)} sub={`Whole year, ${monthsWithInvoices} months with invoices`} />
      </div>

      <SectionCard title={`Invoiced by Month — ${entity.label} ${YEAR}`}>
        <MonthBars values={byMonth} />
      </SectionCard>

      <SectionCard title={`Debtors — ${periodLabel}`}>
        {topDebtors.length === 0 ? (
          <EmptyRow text="No invoices in this period." />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {topDebtors.map(([name, d]) => (
              <li key={name}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 break-words font-semibold text-text">{name} <span className="font-normal text-text-secondary">· {d.count} invoice{d.count === 1 ? "" : "s"}</span></span>
                  <span className="shrink-0 font-bold tabular-nums text-text">{formatCurrency(d.total)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full" style={{ background: "var(--color-info-bg)" }}>
                  <div className="h-2 rounded-full" style={{ width: `${maxDebtor > 0 ? Math.max((d.total / maxDebtor) * 100, 1.5) : 0}%`, background: "var(--color-navy-700)" }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ReportTable
        filenameBase={`invoice-listing-${entityKey}-${month === 0 ? YEAR : `${YEAR}-${month}`}`}
        headers={headers}
        rows={tableRows}
        emptyText="No invoices in this period."
      />
    </SoftPage>
  );
}

function EntityTab({ k, active, month, total }: { k: EntityKey; active: EntityKey; month: number; total: number }) {
  const e = ENTITIES[k];
  const on = k === active;
  return (
    <Link
      href={`/reports/revenue?view=invoiced&entity=${k}${month ? `&month=${month}` : ""}`}
      className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 transition ${on ? "border-primary bg-info-bg" : "border-border hover:border-primary"}`}
    >
      <span className="text-[13.5px] font-bold text-text">{e.label}</span>
      <span className="text-[11.5px] text-text-secondary">{k === "ss-catering" ? "Food for JDT game match events" : `${YEAR}`}</span>
      <span className="mt-1 text-[16px] font-extrabold tabular-nums text-text">{formatCurrency(total)}</span>
    </Link>
  );
}
