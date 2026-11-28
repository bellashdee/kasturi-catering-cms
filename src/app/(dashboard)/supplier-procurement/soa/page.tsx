import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { FILTER_FIELD, FILTER_INPUT } from "@/components/shared/ListFilters";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { SoaTabs } from "@/components/procurement/SoaTabs";
import { SoaReportExport } from "@/components/procurement/SoaReportExport";
import { loadSupplierLedgers, monthBounds, type LedgerSort, type LedgerTotals } from "@/lib/finance/supplierLedger";

/** The first view of the report: November 2026, every company and supplier, by supplier name A–Z. Any filter can be changed. */
const DEFAULT_YEAR = 2026;
const DEFAULT_MONTH = 11;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SORTS: Record<LedgerSort, string> = { name_asc: "Supplier name A–Z", name_desc: "Supplier name Z–A", closing_desc: "Closing balance (highest first)", closing_asc: "Closing balance (lowest first)" };
const KIND_LABEL: Record<string, string> = { IN: "Invoice", DN: "Debit note", CN: "Credit note", PV: "Payment voucher", PAY: "Payment", ALLOC: "Allocation" };

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const hasActivity = (t: LedgerTotals) => [t.opening, t.invoices, t.debitNotes, t.creditNotes, t.payments, t.allocated, t.closing].some((v) => Math.abs(v) >= 0.005);

function TotalsCells({ t, bold = false }: { t: LedgerTotals; bold?: boolean }) {
  const cls = `px-3 py-2 text-right tabular-nums ${bold ? "font-bold text-text" : "text-text"}`;
  return (
    <>
      <td className={cls}>{money(t.opening)}</td>
      <td className={cls}>{money(t.invoices)}</td>
      <td className={cls}>{money(t.debitNotes)}</td>
      <td className={cls}>{money(t.creditNotes)}</td>
      <td className={cls}>{money(t.payments)}</td>
      <td className={`${cls} font-bold`}>{money(t.closing)}</td>
    </>
  );
}

const TOTAL_HEADERS = ["Opening (RM)", "Invoices (RM)", "Debit notes (RM)", "Credit notes (RM)", "Payments (RM)", "Closing (RM)"];

/**
 * Supplier SOA Report: for the month chosen, every registered supplier of each company, with the opening balance carried forward,
 * the posted invoices, debit notes, credit notes, payment vouchers, payments and allocations of the month, and the closing balance.
 * Each company is its own ledger, even for a supplier with the same name in two companies.
 */
export default async function SupplierSoaReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; supplier?: string; month?: string; year?: string; sort?: string; active?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  if (accessibleIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const year = Number(sp.year) >= 2020 && Number(sp.year) <= 2100 ? Number(sp.year) : DEFAULT_YEAR;
  const month = Number(sp.month) >= 1 && Number(sp.month) <= 12 ? Number(sp.month) : DEFAULT_MONTH;
  const sort: LedgerSort = sp.sort && sp.sort in SORTS ? (sp.sort as LedgerSort) : "name_asc";
  const onlyActive = sp.active === "1";
  const { start, end } = monthBounds(year, month);

  const { data: supplierOptions } = await supabase.from("suppliers").select("id, name, company_id").in("company_id", targetCompanyIds).order("name");
  const supplierId = sp.supplier && (supplierOptions ?? []).some((s) => s.id === sp.supplier) ? sp.supplier : null;

  const report = await loadSupplierLedgers(supabase, { companyIds: targetCompanyIds, supplierId, periodStart: start, periodEnd: end, sort });
  const shown = {
    ...report,
    companies: report.companies.map((c) => ({ ...c, suppliers: onlyActive ? c.suppliers.filter((s) => hasActivity(s.totals) || s.lines.length > 0) : c.suppliers })),
  };
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "";
  const supplierCount = report.companies.reduce((n, c) => n + c.suppliers.length, 0);
  const periodLabel = `${MONTHS[month - 1]} ${year}`;
  const scopeCompany = sp.company && targetCompanyIds.length === 1 ? companyName(targetCompanyIds[0]) : "All Companies";
  const scopeSupplier = supplierId ? ((supplierOptions ?? []).find((s) => s.id === supplierId)?.name ?? "") : "All Suppliers";
  const scopeLabel = `${scopeCompany} · ${scopeSupplier}`;
  const subtitle = `${periodLabel} (${dmy(start)} – ${dmy(end)}) · ${scopeLabel} · ${SORTS[sort]}`;
  const hiddenPayments = report.companies.filter((c) => !c.canSeePayments);
  const years = Array.from({ length: 6 }, (_, i) => DEFAULT_YEAR - 3 + i);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            <span>Supplier SOA Report</span> · <span>{periodLabel}</span> ({dmy(start)} – {dmy(end)}) · <span>{scopeCompany}</span> · <span>{scopeSupplier}</span> · <span>{SORTS[sort]}</span> · <span>{`${supplierCount} supplier(s)`}</span>
          </p>
        </div>
        <SoaReportExport
          filters={{ company: sp.company && targetCompanyIds.length === 1 ? sp.company : null, supplierId, year, month, sort, onlyActive }}
          empty={shown.companies.every((c) => c.suppliers.length === 0)}
          subtitle={subtitle}
          filename={`supplier-soa-${year}-${String(month).padStart(2, "0")}`}
        />
      </div>

      <SupplierProcurementSubNav />
      <SoaTabs />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm print:hidden">
        <label className={FILTER_FIELD}>
          <span className="leading-4">Company</span>
          <select name="company" defaultValue={sp.company && targetCompanyIds.length === 1 ? sp.company : ""} className={FILTER_INPUT}>
            <option value="">All Companies</option>
            {companies
              .filter((c) => accessibleIds.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className={FILTER_FIELD}>
          <span className="leading-4">Supplier</span>
          <select name="supplier" defaultValue={supplierId ?? ""} className={`${FILTER_INPUT} max-w-[22rem]`}>
            <option value="">All Suppliers</option>
            {(supplierOptions ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {targetCompanyIds.length > 1 ? ` (${companyName(s.company_id)})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={FILTER_FIELD}>
          <span className="leading-4">Month</span>
          <select name="month" defaultValue={String(month)} className={FILTER_INPUT}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className={FILTER_FIELD}>
          <span className="leading-4">Year</span>
          <select name="year" defaultValue={String(year)} className={FILTER_INPUT}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className={FILTER_FIELD}>
          <span className="leading-4">Sort by</span>
          <select name="sort" defaultValue={sort} className={FILTER_INPUT}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 text-[13px] font-semibold text-text-secondary">
          <input type="checkbox" name="active" value="1" defaultChecked={onlyActive} className="h-4 w-4" />
          Only suppliers with a balance or activity
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">
          Apply
        </button>
        <Link href="/supplier-procurement/soa" className="h-9 rounded-lg border border-border-strong px-3.5 text-[13px] font-semibold leading-9 text-text-secondary">
          Reset
        </Link>
      </form>

      <p className="text-[12.5px] text-text-secondary">
        {`Only posted records are used: purchase invoices and debit notes keyed in, credit notes, the payment vouchers paid in Admin & Finance → Supplier Payment, payments recorded against an invoice and how a paid voucher was allocated. The opening balance is everything posted before ${dmy(start)}; the closing balance is at ${dmy(end)}. Each company keeps its own ledger, so the same supplier in two companies appears twice.`}
      </p>

      {hiddenPayments.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[12.5px] text-warning">
          {`The payment vouchers of ${hiddenPayments.map((c) => c.companyName).join(", ")} can only be seen by Finance / Admin, so the balances shown here do not take them off. Ask Finance for the full report.`}
        </div>
      )}

      {/* consolidated summary: one line per company, never merged into one ledger */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <div className="px-5 pt-3.5 text-[14px] font-bold text-text">{`Consolidated summary · ${periodLabel}`}</div>
        <table className="mt-2 w-full min-w-[820px] text-[13.5px]">
          <thead>
            <tr className="border-y border-border bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
              <th className="px-5 py-2.5">Company</th>
              <th className="px-3 py-2.5 text-right">Suppliers</th>
              {TOTAL_HEADERS.map((h) => (
                <th key={h} className="px-3 py-2.5 text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.companies.map((c) => (
              <tr key={c.companyId}>
                <td className="px-5 py-2 font-semibold text-text">
                  <a href={`#co-${c.companyId}`} className="hover:underline">
                    {c.companyName}
                  </a>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{c.suppliers.length}</td>
                <TotalsCells t={c.totals} />
              </tr>
            ))}
            <tr className="bg-surface-alt">
              <td className="px-5 py-2 font-bold text-text">All companies (each ledger kept separate)</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold">{supplierCount}</td>
              <TotalsCells t={report.consolidated} bold />
            </tr>
          </tbody>
        </table>
      </div>

      {report.unmatchedVouchers.length > 0 && (
        <details className="rounded-xl border border-warning/40 bg-warning-bg shadow-sm">
          <summary className="cursor-pointer px-5 py-3 text-[13.5px] font-bold text-warning">
            {`${report.unmatchedVouchers.length} paid payment voucher(s) (RM ${money(report.unmatchedVouchers.reduce((t, u) => t + u.amount, 0))}) not in any supplier's ledger — tap to see why`}
          </summary>
          <ul className="space-y-1 border-t border-warning/30 px-5 py-3 text-[12.5px] text-text">
            {report.unmatchedVouchers.slice(0, 80).map((u, i) => (
              <li key={i}>
                <b>{u.payee || "—"}</b> · {companyName(u.companyId)} · RM {money(u.amount)} · <span>{u.paidDate ? dmy(u.paidDate) : "no paid date"}</span>
                {u.reference ? ` · ${u.reference}` : ""} — <span className="text-text-secondary">{u.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {shown.companies.map((c) => (
        <section key={c.companyId} id={`co-${c.companyId}`} className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-primary/40 pb-1.5">
            <h2 className="text-[17px] font-extrabold text-text">{c.companyName}</h2>
            <span className="text-[13px] text-text-secondary">
              {`Company subtotal · opening RM ${money(c.totals.opening)} · closing RM ${money(c.totals.closing)}`}
            </span>
          </div>
          {c.suppliers.length === 0 ? (
            <EmptyRow text={onlyActive ? "No supplier of this company has a balance or activity in this period." : "No registered supplier for this company."} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-secondary">
                    <th className="px-4 py-2.5">Supplier</th>
                    {TOTAL_HEADERS.map((h) => (
                      <th key={h} className="px-3 py-2.5 text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {c.suppliers.map((s) => (
                    <tr key={s.supplierId} className="align-top">
                      <td className="px-4 py-2" colSpan={1}>
                        <details>
                          <summary className="cursor-pointer font-semibold text-text">
                            {s.supplierName}
                            {s.accountCode ? <span className="ml-1.5 text-[11.5px] font-normal text-text-muted">{s.accountCode}</span> : null}
                            {!s.isActive && <span className="ml-1.5 text-[11.5px] font-normal text-text-muted">(inactive)</span>}
                            <span className="ml-1.5 text-[11.5px] font-normal text-text-muted">{`· ${s.lines.length} transaction(s)`}</span>
                          </summary>
                          <div className="mt-2 w-[min(860px,85vw)] overflow-x-auto">
                            <table className="w-full text-[12.5px]">
                              <thead>
                                <tr className="text-left text-[11px] font-bold uppercase text-text-muted">
                                  <th className="py-1 pr-2">Date</th>
                                  <th className="py-1 pr-2">Type</th>
                                  <th className="py-1 pr-2">Reference</th>
                                  <th className="py-1 pr-2">Description</th>
                                  <th className="py-1 pr-2 text-right">Invoice / DN</th>
                                  <th className="py-1 pr-2 text-right">Payment / CN</th>
                                  <th className="py-1 text-right">Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="text-text-secondary">
                                  <td className="py-1 pr-2">{dmy(start)}</td>
                                  <td className="py-1 pr-2" colSpan={3}>
                                    Opening balance brought forward
                                  </td>
                                  <td />
                                  <td />
                                  <td className="py-1 text-right font-semibold tabular-nums">{money(s.totals.opening)}</td>
                                </tr>
                                {s.lines.length === 0 && (
                                  <tr>
                                    <td colSpan={7} className="py-1.5 text-text-muted">
                                      {`No posted transaction in ${periodLabel}.`}
                                    </td>
                                  </tr>
                                )}
                                {s.lines.map((l, i) => (
                                  <tr key={i} className={l.memo ? "text-text-muted italic" : "text-text"}>
                                    <td className="py-1 pr-2 tabular-nums">{dmy(l.date)}</td>
                                    <td className="py-1 pr-2">{KIND_LABEL[l.kind]}</td>
                                    <td className="py-1 pr-2">{l.ref || "—"}</td>
                                    <td className="py-1 pr-2">{l.description}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{l.cr ? money(l.cr) : ""}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{l.dr ? money(l.dr) : ""}</td>
                                    <td className="py-1 text-right tabular-nums">{l.memo ? "memo" : money(l.balance)}</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-border font-semibold text-text">
                                  <td className="py-1 pr-2">{dmy(end)}</td>
                                  <td className="py-1 pr-2" colSpan={3}>
                                    Closing balance
                                  </td>
                                  <td className="py-1 pr-2 text-right tabular-nums">{money(s.totals.invoices + s.totals.debitNotes)}</td>
                                  <td className="py-1 pr-2 text-right tabular-nums">{money(s.totals.payments + s.totals.creditNotes)}</td>
                                  <td className="py-1 text-right tabular-nums">{money(s.totals.closing)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </td>
                      <TotalsCells t={s.totals} />
                    </tr>
                  ))}
                  <tr className="bg-surface-alt">
                    <td className="px-4 py-2 font-bold text-text">{`Subtotal · ${c.companyName}`}</td>
                    <TotalsCells t={c.totals} bold />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
