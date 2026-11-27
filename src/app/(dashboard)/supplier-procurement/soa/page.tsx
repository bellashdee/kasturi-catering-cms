import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatCurrency, todayInMalaysia } from "@/lib/format";
import { AGING_LABELS, loadSoaStatements, type UnmatchedPayment } from "@/lib/procurement/soa";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { SoaPrintButtons } from "@/components/procurement/SoaPrintButtons";
import { SoaDateFilter } from "@/components/procurement/SoaDateFilter";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";

const money2 = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** SOA: the statement of account (creditor statement) of every supplier, with the balance and the ageing; one PDF for all of them or one each. */
export default async function SupplierSoaPage({ searchParams }: { searchParams: Promise<{ company?: string; date?: string; q?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const { company: requestedId, date: dateParam, q } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const statementDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayInMalaysia();
  const out = { unmatchedPayments: [] as UnmatchedPayment[] };
  const all = await loadSoaStatements(supabase, targetCompanyIds, statementDate, undefined, out);
  const search = q?.trim().toLowerCase();
  const statements = all
    .filter((s) => s.lines.length > 0 && (!search || s.supplierName.toLowerCase().includes(search) || (s.accountCode ?? "").toLowerCase().includes(search)))
    .sort((a, b) => b.balance - a.balance || a.supplierName.localeCompare(b.supplierName));
  const owing = statements.filter((s) => Math.abs(s.balance) >= 0.005);
  const noActivity = all.filter((s) => s.lines.length === 0).length;
  const total = statements.reduce((t, s) => t + s.balance, 0);
  const totalAging = AGING_LABELS.map((_, i) => statements.reduce((t, s) => t + s.aging[i], 0));
  // month by month for the suppliers listed: what was keyed in (invoices / DN), returned (CN) and paid (PV)
  const allMonths = Array.from(new Set(statements.flatMap((st) => st.monthly.map((m) => m.month)))).sort();
  const monthMap = new Map<string, { purchases: number; returns: number; pvIssued: number; closing: number }>();
  for (const m of allMonths) monthMap.set(m, { purchases: 0, returns: 0, pvIssued: 0, closing: 0 });
  for (const st of statements) {
    let last: number | null = null;
    const byMonth = new Map(st.monthly.map((x) => [x.month, x]));
    for (const m of allMonths) {
      const row = monthMap.get(m)!;
      const own = byMonth.get(m);
      if (own) {
        row.purchases += own.purchases;
        row.returns += own.returns;
        row.pvIssued += own.pvIssued;
        last = own.closing;
      }
      if (last !== null) row.closing += last;
    }
  }
  const monthly = Array.from(monthMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const unmatched = out.unmatchedPayments.filter((u) => !search || u.payee_name.toLowerCase().includes(search));
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "";
  const showCompany = targetCompanyIds.length > 1;
  const base = (sid: string) => {
    const p = new URLSearchParams();
    if (requestedId) p.set("company", requestedId);
    if (dateParam) p.set("date", statementDate);
    const s = p.toString();
    return `/supplier-procurement/soa/${sid}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Statement of Account (SOA) as at {statementDate.split("-").reverse().join("/")} · {statements.length} supplier{statements.length === 1 ? "" : "s"} · {formatCurrency(total)} owed
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ExportButtons
            table={{
              title: "Supplier SOA Summary",
              subtitle: `As at ${statementDate.split("-").reverse().join("/")} · ${statements.length} suppliers`,
              columns: ["A/C No.", "Supplier", ...(showCompany ? ["Company"] : []), "Balance (RM)", "PV issued (RM)", ...AGING_LABELS.map((l) => l.charAt(0) + l.slice(1).toLowerCase())],
              rows: statements.map((s) => [s.accountCode ?? "", s.supplierName, ...(showCompany ? [companyName(s.companyId)] : []), money2(s.balance), money2(s.pvIssuedTotal), ...s.aging.map(money2)]),
              landscape: true,
              summary: [{ label: "Total owed", value: `RM ${money2(total)}`, bold: true }],
            }}
          />
          <SoaPrintButtons statements={owing} filename={`SOA-all-suppliers-${statementDate}.pdf`} viewLabel="View all SOA" downloadLabel={`Download all SOA (${owing.length})`} />
        </div>
      </div>

      <SupplierProcurementSubNav />

      <SoaDateFilter date={statementDate} withSearch />

      <p className="text-[12.5px] text-text-secondary">
        Each supplier&apos;s statement lists the purchase invoices (IN) and debit notes (DN) keyed in, the credit notes / purchase returns (CN) and the supplier payments recorded, like the AutoCount creditor statement. The monthly tally puts the invoices keyed in beside the PVs issued (paid) in Admin &amp; Finance → Supplier Payment; the PVs are not taken off the balance.
        &quot;Download all SOA&quot; makes one PDF with every supplier that still has a balance, each on its own pages.
        {noActivity > 0 ? ` ${noActivity} supplier${noActivity === 1 ? " has" : "s have"} no invoices yet and ${noActivity === 1 ? "is" : "are"} not listed.` : ""}
      </p>

      {monthly.length > 0 && (
        <details open className="rounded-xl border border-border bg-surface shadow-sm">
          <summary className="cursor-pointer px-5 py-3.5 text-[14px] font-bold text-text">
            Monthly tally: invoices keyed in vs PV issued
            <span className="ml-2 text-[12.5px] font-normal text-text-secondary">{search ? "suppliers matching the search" : "all suppliers listed"} · latest 12 months</span>
          </summary>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[720px] text-[13.5px]">
              <thead>
                <tr className="bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-2.5">Month</th>
                  <th className="px-3 py-2.5 text-right">Invoices keyed in (RM)</th>
                  <th className="px-3 py-2.5 text-right">Returns / CN (RM)</th>
                  <th className="px-3 py-2.5 text-right">PV issued (RM)</th>
                  <th className="px-3 py-2.5 text-right">Difference (RM)</th>
                  <th className="px-5 py-2.5 text-right">SOA balance at month end (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthly.map(([m, r]) => (
                  <tr key={m}>
                    <td className="px-5 py-2.5 font-semibold text-text">{monthName(m)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money2(r.purchases)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.returns ? money2(r.returns) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.pvIssued ? money2(r.pvIssued) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{money2(r.purchases - r.returns - r.pvIssued)}</td>
                    <td className="px-5 py-2.5 text-right font-bold tabular-nums">{money2(r.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {unmatched.length > 0 && (
        <details className="rounded-xl border border-warning/40 bg-warning-bg shadow-sm">
          <summary className="cursor-pointer px-5 py-3 text-[13.5px] font-bold text-warning">
            {unmatched.length} paid PV{unmatched.length === 1 ? "" : "s"} (RM {money2(unmatched.reduce((t, u) => t + u.amount, 0))}) not matched to a supplier yet — tap to see why
          </summary>
          <div className="border-t border-warning/30 px-5 py-3 text-[12.5px] text-text-secondary">
            The payee name in Admin &amp; Finance → Supplier Payment does not match one supplier of that company (spelling, a different company, or no paid date). Correct the payee name, or the supplier name, and it is counted.
            <ul className="mt-2 space-y-1">
              {unmatched.slice(0, 50).map((u, i) => (
                <li key={i} className="text-text">
                  <b>{u.payee_name || "—"}</b> · {companyName(u.company_id)} · RM {money2(u.amount)} · {u.paid_date ? u.paid_date.split("-").reverse().join("/") : "no paid date"}
                  {u.reference ? ` · ${u.reference}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {statements.length === 0 ? (
        <EmptyRow text={search ? "No supplier matches this search." : "No supplier invoices yet, so there is no statement to show."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[1080px] text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3">A/C No.</th>
                <th className="px-3 py-3">Supplier</th>
                {showCompany && <th className="px-3 py-3">Company</th>}
                <th className="px-3 py-3 text-right">Balance (RM)</th>
                <th className="px-3 py-3 text-right">PV issued (RM)</th>
                {AGING_LABELS.map((l) => (
                  <th key={l} className="px-3 py-3 text-right">{l}</th>
                ))}
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {statements.map((s) => (
                <tr key={s.supplierId}>
                  <td className="px-5 py-3 text-text-secondary">{s.accountCode ?? "—"}</td>
                  <td className="px-3 py-3">
                    <Link href={base(s.supplierId)} className="font-semibold text-text hover:underline">{s.supplierName}</Link>
                    <div className="text-[12px] text-text-muted">{s.lines.length} transaction{s.lines.length === 1 ? "" : "s"}</div>
                  </td>
                  {showCompany && <td className="px-3 py-3 text-text-secondary">{companyName(s.companyId)}</td>}
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-text">{money2(s.balance)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{s.pvIssuedTotal ? money2(s.pvIssuedTotal) : "—"}</td>
                  {s.aging.map((v, i) => (
                    <td key={i} className={`px-3 py-3 text-right tabular-nums ${v === 0 ? "text-text-muted" : i >= 3 ? "font-semibold text-danger" : "text-text"}`}>{v === 0 ? "—" : money2(v)}</td>
                  ))}
                  <td className="px-5 py-3 text-right">
                    <Link href={base(s.supplierId)} className="text-[13px] font-semibold text-primary hover:underline">View SOA →</Link>
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-alt font-bold">
                <td className="px-5 py-3" />
                <td className="px-3 py-3 text-text">TOTAL</td>
                {showCompany && <td />}
                <td className="px-3 py-3 text-right tabular-nums text-text">{money2(total)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-text">{money2(statements.reduce((t, x) => t + x.pvIssuedTotal, 0))}</td>
                {totalAging.map((v, i) => (
                  <td key={i} className="px-3 py-3 text-right tabular-nums text-text">{money2(v)}</td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
