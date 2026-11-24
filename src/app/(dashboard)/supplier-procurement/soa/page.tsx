import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatCurrency, todayInMalaysia } from "@/lib/format";
import { AGING_LABELS, loadSoaStatements } from "@/lib/procurement/soa";
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
  const all = await loadSoaStatements(supabase, targetCompanyIds, statementDate);
  const search = q?.trim().toLowerCase();
  const statements = all
    .filter((s) => s.lines.length > 0 && (!search || s.supplierName.toLowerCase().includes(search) || (s.accountCode ?? "").toLowerCase().includes(search)))
    .sort((a, b) => b.balance - a.balance || a.supplierName.localeCompare(b.supplierName));
  const owing = statements.filter((s) => Math.abs(s.balance) >= 0.005);
  const noActivity = all.filter((s) => s.lines.length === 0).length;
  const total = statements.reduce((t, s) => t + s.balance, 0);
  const totalAging = AGING_LABELS.map((_, i) => statements.reduce((t, s) => t + s.aging[i], 0));
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
              columns: ["A/C No.", "Supplier", ...(showCompany ? ["Company"] : []), "Balance (RM)", ...AGING_LABELS.map((l) => l.charAt(0) + l.slice(1).toLowerCase())],
              rows: statements.map((s) => [s.accountCode ?? "", s.supplierName, ...(showCompany ? [companyName(s.companyId)] : []), money2(s.balance), ...s.aging.map(money2)]),
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
        Each supplier&apos;s statement lists its purchase invoices (IN), debit notes (DN), credit notes / purchase returns (CN) and recorded payments (PV) up to the statement date, like the AutoCount creditor statement.
        &quot;Download all SOA&quot; makes one PDF with every supplier that still has a balance, each on its own pages.
        {noActivity > 0 ? ` ${noActivity} supplier${noActivity === 1 ? " has" : "s have"} no invoices yet and ${noActivity === 1 ? "is" : "are"} not listed.` : ""}
      </p>

      {statements.length === 0 ? (
        <EmptyRow text={search ? "No supplier matches this search." : "No supplier invoices yet, so there is no statement to show."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[980px] text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3">A/C No.</th>
                <th className="px-3 py-3">Supplier</th>
                {showCompany && <th className="px-3 py-3">Company</th>}
                <th className="px-3 py-3 text-right">Balance (RM)</th>
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
