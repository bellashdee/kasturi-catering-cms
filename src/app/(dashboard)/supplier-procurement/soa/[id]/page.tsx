import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { todayInMalaysia } from "@/lib/format";
import { AGING_LABELS, loadSoaStatements } from "@/lib/procurement/soa";
import { amountInWords } from "@/lib/documents/printDocument";
import { SoaPrintButtons } from "@/components/procurement/SoaPrintButtons";
import { SoaDateFilter } from "@/components/procurement/SoaDateFilter";

const money2 = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** One supplier's Statement of Account, on screen as it is printed, with View / Download PDF. */
export default async function SupplierSoaDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string; date?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId, date: dateParam } = await searchParams;
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { accessibleIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const statementDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayInMalaysia();

  const [s] = accessibleIds.length > 0 && /^[0-9a-f-]{36}$/.test(id) ? await loadSoaStatements(supabase, accessibleIds, statementDate, id) : [];
  if (!s) notFound();

  const back = new URLSearchParams();
  if (requestedId) back.set("company", requestedId);
  if (dateParam) back.set("date", statementDate);
  const backHref = `/supplier-procurement/soa${back.size ? `?${back.toString()}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={backHref} className="text-[12.5px] font-semibold text-text-secondary">← Back to SOA</Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{s.supplierName}</div>
          <div className="text-[13px] text-text-secondary">
            Statement of Account · A/C {s.accountCode ?? "—"} · as at {dmy(statementDate)}
          </div>
        </div>
        <SoaPrintButtons statements={[s]} filename={`SOA-${(s.accountCode || s.supplierName).replace(/[^A-Za-z0-9]+/g, "-")}-${statementDate}.pdf`} />
      </div>

      <SoaDateFilter date={statementDate} />

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="text-center">
          <div className="text-[15px] font-extrabold text-text">{s.company.name.toUpperCase()}</div>
          {s.company.registrationNo && <div className="text-[12px] text-text-secondary">{s.company.registrationNo}</div>}
          {s.company.addressLines.map((l) => (
            <div key={l} className="text-[12px] text-text-secondary">{l}</div>
          ))}
          {s.company.phone && <div className="text-[12px] text-text-secondary">Tel: {s.company.phone}</div>}
          <div className="mt-3 text-[14px] font-bold tracking-wide text-text">CREDITOR STATEMENT</div>
        </div>

        <div className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
          <div className="space-y-1">
            <div><span className="inline-block w-20 text-text-secondary">A/C No.:</span> {s.accountCode ?? "—"}</div>
            <div><span className="inline-block w-20 text-text-secondary">Creditor:</span> <span className="font-bold">{s.supplierName.toUpperCase()}</span></div>
            <div className="flex"><span className="inline-block w-20 shrink-0 text-text-secondary">Address:</span><span>{s.addressLines.length ? s.addressLines.map((l) => <span key={l} className="block">{l.toUpperCase()}</span>) : "—"}</span></div>
          </div>
          <div className="space-y-1 sm:text-right">
            <div><span className="text-text-secondary">Statement Date:</span> {dmy(statementDate)}</div>
            <div><span className="text-text-secondary">Terms:</span> {s.terms}</div>
          </div>
        </div>

        <div className="-mx-5 mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-y border-border-strong text-left text-[12px] font-bold uppercase text-text">
                <th className="px-5 py-2">Date</th>
                <th className="px-2 py-2" />
                <th className="px-2 py-2">Ref.</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 text-right">DR</th>
                <th className="px-2 py-2 text-right">CR</th>
                <th className="px-5 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-6 text-center text-text-muted">No transaction up to this date.</td></tr>
              ) : (
                s.lines.map((l, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="px-5 py-1.5 tabular-nums">{dmy(l.date)}</td>
                    <td className="px-2 py-1.5 font-semibold text-text-secondary">{l.type}</td>
                    <td className="px-2 py-1.5">{l.ref}</td>
                    <td className="px-2 py-1.5 text-text-secondary">{l.description}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.dr ? money2(l.dr) : ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.cr ? money2(l.cr) : ""}</td>
                    <td className="px-5 py-1.5 text-right font-semibold tabular-nums">{money2(l.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-border-strong pt-3">
          <div className="max-w-xl text-[12.5px] font-bold text-text">{s.balance < 0 ? `(CREDIT) ${amountInWords(-s.balance)}` : amountInWords(s.balance)}</div>
          <div className="text-[15px] font-extrabold text-text">RM : {money2(s.balance)}</div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12.5px] sm:grid-cols-6">
          {AGING_LABELS.map((label, i) => (
            <div key={label} className="rounded-lg bg-surface-alt px-2 py-2">
              <div className="text-[11px] font-semibold text-text-secondary">{label}</div>
              <div className={`mt-0.5 font-bold tabular-nums ${s.aging[i] !== 0 && i >= 3 ? "text-danger" : "text-text"}`}>{money2(s.aging[i])}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[12px] text-text-secondary">Any discrepancy in this statement must be reported to us in writing within 10 days.</div>
      </div>
    </div>
  );
}
