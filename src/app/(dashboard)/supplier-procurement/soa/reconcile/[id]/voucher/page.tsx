import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { SoaTabs } from "@/components/procurement/SoaTabs";
import { PvDraftEditor, type PvAllocation, type PvDraftView, type PvInvoice } from "@/components/procurement/PvDraftEditor";
import { loadOutstandingInvoices } from "@/lib/procurement/soaReconcileData";
import { RECON_STATUS_LABEL } from "@/lib/procurement/soaReconcileLabels";

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Prepare Payment Voucher: only for a reconciliation completed and approved for payment. The outstanding invoices of the supplier in this
 * company; some or all, in part or in full; one voucher over several invoices. Fits the existing PV numbering and supplier payment.
 */
export default async function PrepareVoucherPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { id } = await params;
  const { company } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: recon } = await supabase.from("supplier_soa_reconciliations").select("id, company_id, supplier_id, period_start, period_end, status, our_closing, suppliers(name), companies(name)").eq("id", id).maybeSingle();
  if (!recon) notFound();
  const supplierName = (recon.suppliers as unknown as { name: string } | null)?.name ?? "";
  const companyName = (recon.companies as unknown as { name: string } | null)?.name ?? "";
  const back = `/supplier-procurement/soa/reconcile/${id}${company ? `?company=${company}` : ""}`;

  const [manage, approve, { data: drafts }, { data: soaLines }] = await Promise.all([
    supabase.rpc("user_can_manage_payments", { target_company_id: recon.company_id, target_category: "supplier" }),
    supabase.rpc("user_can_approve_supplier_payments"),
    supabase.from("supplier_pv_drafts").select("*").eq("reconciliation_id", id).in("status", ["draft", "submitted", "approved", "paid"]).order("prepared_at", { ascending: false }).limit(1),
    supabase.from("supplier_soa_recon_lines").select("matched_id").eq("reconciliation_id", id).eq("source", "supplier").eq("matched_table", "supplier_invoices"),
  ]);
  const ready = ["approved_for_payment", "pv_issued", "paid"].includes(recon.status);
  const draftRow = drafts?.[0] ?? null;

  const header = (
    <>
      <div>
        <Link href={back} className="text-[12.5px] font-semibold text-text-secondary">
          ← Back to the reconciliation
        </Link>
        <h1 className="mt-1.5 text-[20px] font-extrabold text-text">Prepare Payment Voucher</h1>
        <p className="text-[13px] text-text-secondary">
          {supplierName} · {companyName} · {`SOA period ${dmy(recon.period_start)} – ${dmy(recon.period_end)}`} · <span>{RECON_STATUS_LABEL[recon.status] ?? recon.status}</span>
        </p>
      </div>
      <SupplierProcurementSubNav />
      <SoaTabs />
    </>
  );

  if (!ready) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[13px] text-warning">A payment voucher can be prepared only after the reconciliation is completed and approved for payment by Finance.</div>
      </div>
    );
  }

  const [invoices, allocRows] = await Promise.all([
    loadOutstandingInvoices(supabase, {
      companyId: recon.company_id,
      supplierId: recon.supplier_id,
      supplierName,
      excludeDraftId: draftRow?.id,
      soaInvoiceIds: new Set((soaLines ?? []).map((l) => l.matched_id as string)),
    }),
    draftRow
      ? supabase.from("supplier_pv_allocations").select("supplier_invoice_id, amount, over_reason, supplier_payment_id, supplier_invoices(invoice_number, invoice_date, amount)").eq("pv_draft_id", draftRow.id).then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);
  const allocations: PvAllocation[] = allocRows.map((a) => {
    const inv = a.supplier_invoices as unknown as { invoice_number: string; invoice_date: string } | null;
    return { invoiceId: a.supplier_invoice_id, number: inv?.invoice_number ?? "", date: inv?.invoice_date ?? "", amount: Number(a.amount), overReason: a.over_reason, posted: !!a.supplier_payment_id };
  });
  // invoices already on the voucher stay listed even when nothing is left on them (fully held by this voucher, or paid by it)
  const listed: PvInvoice[] = [...invoices];
  for (const a of allocRows) {
    if (listed.some((i) => i.id === a.supplier_invoice_id)) continue;
    const inv = a.supplier_invoices as unknown as { invoice_number: string; invoice_date: string; amount: number } | null;
    listed.push({ id: a.supplier_invoice_id, number: inv?.invoice_number ?? "", date: inv?.invoice_date ?? "", amount: Number(inv?.amount ?? 0), paid: 0, heldElsewhere: 0, outstanding: 0, onSoa: false, monthPv: null });
  }
  const ids = [draftRow?.prepared_by, draftRow?.approved_by].filter((x): x is string => !!x);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const who = (uid: string | null | undefined) => (uid ? (profiles ?? []).find((p) => p.id === uid)?.full_name ?? "—" : "—");
  const draft: PvDraftView | null = draftRow
    ? {
        id: draftRow.id,
        status: draftRow.status,
        total: Number(draftRow.total),
        remarks: draftRow.remarks,
        voucherNumber: draftRow.voucher_number,
        financePaymentId: draftRow.finance_payment_id,
        rejectionNote: draftRow.rejection_note,
        paidDate: draftRow.paid_date,
        paymentReference: draftRow.payment_reference,
        preparedBy: who(draftRow.prepared_by),
        approvedBy: who(draftRow.approved_by),
        approvedAt: draftRow.approved_at,
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      {header}
      <p className="text-[12.5px] text-text-secondary">
        Choose the invoices to pay (some or all; a part of an invoice; one payment over several invoices). An invoice amount can be held by one voucher only; paying more than an invoice&apos;s balance needs Finance and a reason. When Finance approves, the voucher takes the next PV number of the month and appears in Admin &amp; Finance → Supplier Payment. The invoices are marked paid only when the payment is recorded.
      </p>
      <PvDraftEditor
        reconId={id}
        companyId={recon.company_id}
        companyName={companyName}
        supplierName={supplierName}
        period={`${dmy(recon.period_start)} - ${dmy(recon.period_end)}`}
        reconStatus={recon.status}
        canManage={manage.data === true}
        canApprove={approve.data === true}
        draft={draft}
        invoices={listed}
        allocations={allocations}
        ledgerClosing={Number(recon.our_closing ?? 0)}
      />
      {draft?.financePaymentId && (
        <Link href={`/finance/payments/${draft.financePaymentId}`} className="text-[13px] font-semibold text-primary hover:underline">
          {`Open ${draft.voucherNumber} in Admin & Finance →`}
        </Link>
      )}
    </div>
  );
}
