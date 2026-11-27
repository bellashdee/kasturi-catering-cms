import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { SoaTabs } from "@/components/procurement/SoaTabs";
import { SoaAttachDocument, SoaLinesBoard, SoaReconcileActions, type WorkspaceLine } from "@/components/procurement/SoaReconcileWorkspace";
import { SoaReconcileReportExport, type ReconReportData } from "@/components/procurement/SoaReconcileReportExport";
import { LINE_STATUS_LABEL, LINE_TYPE_LABEL, PV_STATUS_LABEL, RECON_STATUS_LABEL, reconTone } from "@/lib/procurement/soaReconcileLabels";
import { balanceSides, differenceBreakdown } from "@/lib/procurement/soaReconcileData";
import type { Suggestion } from "@/lib/procurement/soaMatch";

const money = (n: number | null) => (n === null ? "—" : Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dmy = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const FLOW = ["not_reconciled", "in_progress", "discrepancy_found", "reconciled", "approved_for_payment", "pv_issued", "paid"];

export default async function SoaReconcilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { id } = await params;
  const { company } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: recon } = await supabase.from("supplier_soa_reconciliations").select("*, suppliers(name, account_code), companies(name)").eq("id", id).maybeSingle();
  if (!recon) notFound();

  const [{ data: lineRows }, { data: docs }, { data: drafts }, manage, approve] = await Promise.all([
    supabase.from("supplier_soa_recon_lines").select("*").eq("reconciliation_id", id).order("source", { ascending: false }).order("line_no"),
    supabase.from("documents").select("id, original_filename, uploaded_at, uploaded_by").eq("related_table", "supplier_soa_reconciliations").eq("related_id", id).order("uploaded_at"),
    supabase.from("supplier_pv_drafts").select("id, status, total, voucher_number, prepared_at, approved_at, paid_date, payment_reference").eq("reconciliation_id", id).order("prepared_at"),
    supabase.rpc("user_can_manage_payments", { target_company_id: recon.company_id, target_category: "supplier" }),
    supabase.rpc("user_can_approve_supplier_payments"),
  ]);
  const canManage = manage.data === true;
  const canApprove = approve.data === true;
  const rows = lineRows ?? [];
  const relatedIds = [id, ...(drafts ?? []).map((d) => d.id)];
  const { data: auditRows } = await supabase.from("task_audit_log").select("id, related_table, action, performed_by, previous_value, new_value, reason, created_at").in("related_id", relatedIds).order("created_at");
  const people = new Set<string>(
    [recon.uploaded_by, recon.reconciled_by, recon.verified_by, recon.approved_by, recon.exception_approved_by, ...rows.map((r) => r.resolved_by), ...(auditRows ?? []).map((a) => a.performed_by)].filter((x): x is string => !!x),
  );
  const { data: profiles } = people.size ? await supabase.from("profiles").select("id, full_name").in("id", [...people]) : { data: [] };
  const who = (uid: string | null) => (uid ? (profiles ?? []).find((p) => p.id === uid)?.full_name ?? "—" : "—");

  const supplierName = (recon.suppliers as unknown as { name: string } | null)?.name ?? "";
  const companyName = (recon.companies as unknown as { name: string } | null)?.name ?? "";
  const { supplier, ours } = balanceSides(recon);
  const breakdown = differenceBreakdown(recon, rows);
  const open = ["not_reconciled", "in_progress", "discrepancy_found"].includes(recon.status);
  const editable = canManage && open;
  const lines: WorkspaceLine[] = rows.map((r) => ({
    id: r.id,
    source: r.source as "supplier" | "ours",
    lineNo: r.line_no,
    date: r.line_date,
    dateText: r.date_text,
    type: r.line_type,
    reference: r.reference,
    description: r.description,
    amount: Number(r.amount),
    balance: r.balance === null ? null : Number(r.balance),
    status: r.status,
    method: r.match_method,
    confirmed: r.match_confirmed,
    matchedTable: r.matched_table,
    matchedId: r.matched_id,
    matchedRef: r.matched_ref,
    matchedDate: r.matched_date,
    matchedAmount: r.matched_amount === null ? null : Number(r.matched_amount),
    suggestions: (Array.isArray(r.suggestions) ? r.suggestions : []) as unknown as Suggestion[],
    likelyCause: r.likely_cause,
    resolution: r.resolution,
    resolvedBy: r.resolved_by ? who(r.resolved_by) : null,
    resolvedAt: r.resolved_at,
  }));
  const balanceRows: [string, number, number][] = [
    ["Opening balance", supplier.opening, ours.opening],
    ["Invoices", supplier.invoices, ours.invoices],
    ["Debit notes", supplier.debitNotes, ours.debitNotes],
    ["Credit notes", supplier.creditNotes, ours.creditNotes],
    ["Payments", supplier.payments, ours.payments],
    ["Closing balance", supplier.closing, ours.closing],
  ];
  const activePv = (drafts ?? []).find((d) => ["draft", "submitted", "approved", "paid"].includes(d.status));
  const back = `/supplier-procurement/soa/reconcile${company ? `?company=${company}` : ""}`;
  const pvHref = `/supplier-procurement/soa/reconcile/${id}/voucher${company ? `?company=${company}` : ""}`;
  const soaDoc = recon.soa_document_id;
  const others = (docs ?? []).filter((d) => d.id !== soaDoc);

  const report: ReconReportData = {
    title: `${supplierName} — ${companyName}`,
    filename: `soa-reconciliation-${supplierName.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${recon.period_start}`,
    info: [
      { label: "Supplier", value: supplierName },
      { label: "Company", value: companyName },
      { label: "SOA period", value: `${dmy(recon.period_start)} - ${dmy(recon.period_end)}` },
      { label: "Supplier closing balance", value: `RM ${money(supplier.closing)}` },
      { label: "Our closing balance", value: `RM ${money(ours.closing)}` },
      { label: "Difference", value: `RM ${money(breakdown.difference)}` },
      { label: "Status", value: RECON_STATUS_LABEL[recon.status] ?? recon.status },
      { label: "Uploaded by", value: `${who(recon.uploaded_by)} · ${when(recon.uploaded_at)}` },
      { label: "Reconciled by", value: recon.reconciled_by ? `${who(recon.reconciled_by)} · ${when(recon.reconciled_at)}` : "—" },
      { label: "Verification officer", value: recon.verified_by ? `${who(recon.verified_by)} · ${when(recon.verified_at)}` : "—" },
      { label: "Approval status", value: recon.approved_by ? `Approved for payment by ${who(recon.approved_by)} · ${when(recon.approved_at)}` : "Not approved yet" },
      { label: "Exception", value: recon.exception_approved_by ? `${who(recon.exception_approved_by)}: ${recon.exception_note ?? ""}` : "—" },
      { label: "Payment voucher", value: activePv?.voucher_number ? `${activePv.voucher_number} (${PV_STATUS_LABEL[activePv.status] ?? activePv.status})` : "—" },
      { label: "Remarks", value: recon.remarks ?? "—" },
    ],
    balances: balanceRows.map(([label, s, o]) => [label, money(s), money(o), money(Math.round((s - o) * 100) / 100)]),
    causes: breakdown.causes,
    unexplained: breakdown.unexplained,
    lines: lines.map((l) => [
      l.source === "supplier" ? `SOA line ${l.lineNo ?? ""}` : "Our record",
      dmy(l.date),
      LINE_TYPE_LABEL[l.type] ?? l.type,
      l.reference ?? "",
      money(l.amount),
      l.type === "opening" ? "Opening" : (LINE_STATUS_LABEL[l.status] ?? l.status),
      l.source === "supplier" && l.matchedRef ? `${l.matchedRef} RM ${money(l.matchedAmount)}` : "",
      [l.likelyCause, l.resolution ? `Resolved: ${l.resolution}` : ""].filter(Boolean).join(" · "),
    ]),
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={back} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to SOA Reconciliation
          </Link>
          <div className="mt-1.5 text-[20px] font-extrabold text-text">{supplierName}</div>
          <div className="text-[13px] text-text-secondary">
            {companyName} · {`SOA period ${dmy(recon.period_start)} – ${dmy(recon.period_end)}`}
            {recon.soa_statement_date ? ` · statement dated ${dmy(recon.soa_statement_date)}` : ""}
          </div>
          <div className="mt-1.5">
            <StatusBadge tone={reconTone(recon.status)}>{RECON_STATUS_LABEL[recon.status] ?? recon.status}</StatusBadge>
          </div>
        </div>
        <SoaReconcileReportExport data={report} />
      </div>

      <SupplierProcurementSubNav />
      <SoaTabs />

      <ol className="flex flex-wrap gap-1 text-[11.5px] font-semibold">
        {FLOW.map((s) => {
          const reached = recon.status !== "cancelled" && FLOW.indexOf(recon.status) >= FLOW.indexOf(s);
          return (
            <li key={s} className={`rounded-full border px-2.5 py-1 ${recon.status === s ? "border-primary bg-primary text-white" : reached ? "border-primary/40 text-primary" : "border-border text-text-muted"}`}>
              {RECON_STATUS_LABEL[s]}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <div className="px-4 pt-3 text-[14px] font-bold text-text">Balance reconciliation</div>
          <table className="mt-2 w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-y border-border bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-2" />
                <th className="px-3 py-2 text-right">Supplier&apos;s SOA (RM)</th>
                <th className="px-3 py-2 text-right">Our records (RM)</th>
                <th className="px-4 py-2 text-right">Difference (RM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {balanceRows.map(([label, s, o]) => {
                const d = Math.round((s - o) * 100) / 100;
                const last = label === "Closing balance";
                return (
                  <tr key={label} className={last ? "bg-surface-alt font-bold" : ""}>
                    <td className="px-4 py-2 text-text">{label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(s)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(o)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${Math.abs(d) >= 0.01 ? "font-semibold text-danger" : "text-success"}`}>{money(d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 text-[12.5px]">
            <div className="font-bold text-text">{`Likely causes of the difference (RM ${money(breakdown.difference)})`}</div>
            {breakdown.causes.length === 0 && Math.abs(breakdown.unexplained) < 0.01 ? (
              <div className="mt-1 text-success">No difference: the balances agree.</div>
            ) : (
              <ul className="mt-1 space-y-0.5 text-text">
                {breakdown.causes.map((c) => (
                  <li key={c.label} className="flex justify-between gap-3">
                    <span>{c.label}</span>
                    <span className="tabular-nums">{money(c.amount)}</span>
                  </li>
                ))}
                <li className={`flex justify-between gap-3 border-t border-border pt-0.5 ${Math.abs(breakdown.unexplained) >= 0.01 ? "font-semibold text-danger" : "text-text-secondary"}`}>
                  <span>Not explained by the lines (check the supplier&apos;s opening / closing as printed)</span>
                  <span className="tabular-nums">{money(breakdown.unexplained)}</span>
                </li>
              </ul>
            )}
            <p className="mt-2 text-[11.5px] text-text-muted">{`Our figures come from the supplier ledger of ${companyName} only (the same as the SOA Report). The supplier's statement never changes our records.`}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SoaReconcileActions
            reconId={id}
            status={recon.status}
            canManage={canManage}
            canApprove={canApprove}
            verified={!!recon.verified_by}
            exception={!!recon.exception_approved_by}
            documentId={soaDoc}
            statedOpening={recon.supplier_stated_opening === null ? null : Number(recon.supplier_stated_opening)}
            statedClosing={recon.supplier_stated_closing === null ? null : Number(recon.supplier_stated_closing)}
          />
          <div className="rounded-xl border border-border bg-surface p-4 text-[12.5px] shadow-sm">
            <div className="text-[14px] font-bold text-text">Payment voucher</div>
            {["approved_for_payment", "pv_issued", "paid"].includes(recon.status) ? (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {activePv ? (
                  <div className="text-text">
                    {activePv.voucher_number ?? "Draft voucher"} · RM {money(Number(activePv.total))} · <b>{PV_STATUS_LABEL[activePv.status] ?? activePv.status}</b>
                    {activePv.paid_date ? ` · paid ${dmy(activePv.paid_date)} (ref ${activePv.payment_reference})` : ""}
                  </div>
                ) : (
                  <div className="text-text-secondary">No payment voucher prepared yet.</div>
                )}
                {(canManage || canApprove) && (
                  <Link href={pvHref} className="inline-flex h-9 w-fit items-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white">
                    {activePv ? "Open payment voucher" : "Prepare Payment Voucher"}
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-1 text-text-secondary">The Prepare Payment Voucher button appears once the reconciliation is completed and approved for payment by Finance.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 text-[12.5px] shadow-sm">
        <div className="text-[14px] font-bold text-text">Supplier&apos;s SOA and supporting documents</div>
        <div className="mt-1.5 flex flex-col gap-1">
          {soaDoc ? (
            <div>
              Original SOA (kept as uploaded): <DocumentViewLink documentId={soaDoc} label="View SOA file" className="font-semibold text-primary hover:underline" />
              <span className="text-text-muted">{` · read: ${recon.extraction_status}`}</span>
            </div>
          ) : (
            <div className="text-text-muted">No SOA file.</div>
          )}
          {recon.extraction_note && <div className="text-text-secondary">Reader notes: {recon.extraction_note}</div>}
          {others.map((d) => (
            <div key={d.id}>
              <DocumentViewLink documentId={d.id} label={d.original_filename} className="font-semibold text-primary hover:underline" /> <span className="text-text-muted">· {who(d.uploaded_by)} · {when(d.uploaded_at)}</span>
            </div>
          ))}
          {canManage && <SoaAttachDocument reconId={id} companyId={recon.company_id} />}
        </div>
      </div>

      <SoaLinesBoard reconId={id} lines={lines} editable={editable} />

      <div className="rounded-xl border border-border bg-surface p-4 text-[12.5px] shadow-sm">
        <div className="text-[14px] font-bold text-text">Audit trail</div>
        <ul className="mt-1.5 space-y-1">
          {(auditRows ?? []).map((a) => (
            <li key={a.id} className="text-text">
              <span className="tabular-nums text-text-muted">{when(a.created_at)}</span> · <b>{who(a.performed_by)}</b> · {a.action.replace(/_/g, " ")}
              {a.related_table === "supplier_pv_drafts" ? " (payment voucher)" : ""}
              {a.new_value ? ` · ${a.new_value}` : ""}
              {a.previous_value ? <span className="text-text-muted"> (was {a.previous_value})</span> : null}
              {a.reason ? <span className="text-text-secondary"> — {a.reason}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
