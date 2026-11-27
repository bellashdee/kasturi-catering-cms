import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { SoaTabs } from "@/components/procurement/SoaTabs";
import { SoaReconcileStart } from "@/components/procurement/SoaReconcileStart";
import { RECON_STATUS_LABEL, reconTone } from "@/lib/procurement/soaReconcileLabels";

const money = (n: number | null) => (n === null ? "—" : Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** SOA Reconciliation: the supplier statements uploaded, their status from Not Reconciled to Paid, and a new upload. */
export default async function SoaReconcileListPage({ searchParams }: { searchParams: Promise<{ company?: string; status?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const rights = await Promise.all(targetCompanyIds.map(async (id) => [id, (await supabase.rpc("user_can_manage_payments", { target_company_id: id, target_category: "supplier" })).data === true] as const));
  const manageable = rights.filter(([, ok]) => ok).map(([id]) => id);

  let q = supabase
    .from("supplier_soa_reconciliations")
    .select("id, company_id, supplier_id, period_start, period_end, status, supplier_closing, our_closing, difference, uploaded_at, suppliers(name)")
    .in("company_id", targetCompanyIds)
    .order("uploaded_at", { ascending: false })
    .limit(300);
  if (sp.status && sp.status in RECON_STATUS_LABEL) q = q.eq("status", sp.status);
  const [{ data: recons }, { data: suppliers }] = await Promise.all([q, supabase.from("suppliers").select("id, name, company_id").in("company_id", manageable.length ? manageable : ["00000000-0000-0000-0000-000000000000"]).order("name")]);
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "";
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (sp.company) p.set("company", sp.company);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">SOA Reconciliation · compare the supplier&apos;s own statement with our records before the monthly payment voucher</p>
      </div>
      <SupplierProcurementSubNav />
      <SoaTabs />

      <ol className="grid gap-2 text-[12.5px] text-text-secondary sm:grid-cols-4">
        {[
          "Request the SOA from the supplier and upload it here.",
          "Check every line: matched, missing, amount differences, payments not reflected. Confirm suggestions; explain each discrepancy.",
          "Complete, verify, and Finance approves for payment.",
          "Prepare the payment voucher from the outstanding invoices; record the payment once it is made.",
        ].map((t, i) => (
          <li key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
            <b className="text-text">{i + 1}.</b> {t}
          </li>
        ))}
      </ol>

      {manageable.length > 0 ? (
        <SoaReconcileStart
          companies={companies.filter((c) => manageable.includes(c.id))}
          suppliers={(suppliers ?? []).map((s) => ({ id: s.id, name: s.name, companyId: s.company_id }))}
          defaultCompanyId={manageable[0]}
          defaultStart="2026-11-01"
          defaultEnd="2026-11-30"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-alt px-4 py-3 text-[12.5px] text-text-secondary">Only Finance / Admin (or the supplier payment editors) can upload and reconcile supplier statements. You can view the reconciliations below.</div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[12.5px]">
        <Link href={`/supplier-procurement/soa/reconcile${qs({})}`} className={`rounded-full border px-3 py-1 font-semibold ${!sp.status ? "border-primary text-primary" : "border-border text-text-secondary"}`}>
          All
        </Link>
        {Object.entries(RECON_STATUS_LABEL).map(([k, v]) => (
          <Link key={k} href={`/supplier-procurement/soa/reconcile${qs({ status: k })}`} className={`rounded-full border px-3 py-1 font-semibold ${sp.status === k ? "border-primary text-primary" : "border-border text-text-secondary"}`}>
            {v}
          </Link>
        ))}
      </div>

      {(recons ?? []).length === 0 ? (
        <EmptyRow text="No supplier SOA has been uploaded for reconciliation yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">SOA period</th>
                <th className="px-3 py-2.5 text-right">Supplier closing (RM)</th>
                <th className="px-3 py-2.5 text-right">Our closing (RM)</th>
                <th className="px-3 py-2.5 text-right">Difference (RM)</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(recons ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-semibold text-text">{(r.suppliers as unknown as { name: string } | null)?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-text-secondary">{companyName(r.company_id)}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {dmy(r.period_start)} – {dmy(r.period_end)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(r.supplier_closing)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(r.our_closing)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${Math.abs(Number(r.difference ?? 0)) >= 0.01 ? "text-danger" : "text-success"}`}>{money(r.difference)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={reconTone(r.status)}>{RECON_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/supplier-procurement/soa/reconcile/${r.id}${qs({})}`} className="text-[13px] font-semibold text-primary hover:underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
