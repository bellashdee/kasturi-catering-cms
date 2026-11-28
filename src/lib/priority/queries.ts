import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchAll, fetchAllByIds } from "@/lib/supabase/fetchAll";
import {
  computePayable,
  sortPayables,
  type Control,
  type LedgerEntry,
  type LedgerStatus,
  type OpsAlertType,
  type PayableType,
  type PayableView,
  type PriorityLevel,
  type RawPayable,
} from "@/lib/priority/payables";

type DB = SupabaseClient<Database>;
type ControlRow = Database["public"]["Tables"]["supplier_payment_controls"]["Row"];

function toControl(c: ControlRow): Control {
  return {
    isUrgent: c.is_urgent,
    urgentReason: c.urgent_reason,
    priorityOverride: c.priority_override as PriorityLevel | null,
    overrideReason: c.override_reason,
    holdStatus: c.hold_status as Control["holdStatus"],
    holdReason: c.hold_reason,
    verifiedAmount: c.verified_amount === null ? null : Number(c.verified_amount),
    verifiedAt: c.verified_at,
    opsAlertType: c.ops_alert_type as OpsAlertType | null,
    opsAlertNote: c.ops_alert_note,
    opsAlertEventId: c.ops_alert_event_id,
    opsAlertAt: c.ops_alert_at,
    notes: c.notes,
  };
}

const key = (type: string, id: string) => `${type}:${id}`;

/**
 * Every supplier payable of the given companies, worked out with the Priority Centre rules: Finance supplier payments
 * (finance_payments, category "supplier") and supplier invoices (draft invoices are not recorded yet, so they are left out;
 * cancelled payments are left out). Only call this for companies where the person is an admin (the tables enforce it too).
 */
export async function loadPayables(supabase: DB, companyIds: string[], today: string, only?: { type: PayableType; id: string }): Promise<PayableView[]> {
  if (companyIds.length === 0) return [];
  // read page by page: the supplier invoices alone are close to the 1,000 rows one read returns
  const [finance, invoices] = await Promise.all([
    fetchAll((from, to) => supabase.from("finance_payments").select("*, companies(name)").in("company_id", companyIds).eq("category", "supplier").neq("status", "cancelled").order("id").range(from, to)),
    fetchAll((from, to) => supabase.from("supplier_invoices").select("*, suppliers(name), companies(name)").in("company_id", companyIds).neq("status", "draft").order("id").range(from, to)),
  ]);

  let raws: RawPayable[] = [
    ...(finance ?? []).map<RawPayable>((p) => ({
      type: "finance_payment",
      id: p.id,
      companyId: p.company_id,
      companyName: p.companies?.name ?? "—",
      supplierName: p.payee_name,
      reference: p.invoice_number?.trim() || null,
      invoiceDate: p.invoice_date,
      dueDate: p.due_date,
      amount: Number(p.amount),
      settled: p.status === "paid",
      inProgress: p.status === "in_progress",
      disputed: false,
      remarks: p.remarks,
      documents: [
        p.document_id ? { id: p.document_id, label: "Invoice" } : null,
        p.voucher_document_id ? { id: p.voucher_document_id, label: "Voucher" } : null,
        p.proof_document_id ? { id: p.proof_document_id, label: "Proof of payment" } : null,
      ].filter((d): d is { id: string; label: string } => d !== null),
    })),
    ...(invoices ?? []).map<RawPayable>((i) => ({
      type: "supplier_invoice",
      id: i.id,
      companyId: i.company_id,
      companyName: i.companies?.name ?? "—",
      supplierName: i.suppliers?.name ?? "—",
      reference: i.invoice_number?.trim() || null,
      invoiceDate: i.invoice_date,
      dueDate: i.due_date,
      amount: Number(i.amount),
      settled: i.status === "paid",
      inProgress: false,
      disputed: i.status === "disputed",
      remarks: null,
      documents: i.document_id ? [{ id: i.document_id, label: "Invoice" }] : [],
    })),
  ];
  if (only) raws = raws.filter((r) => r.type === only.type && r.id === only.id);
  if (raws.length === 0) return [];

  const financeIds = raws.filter((r) => r.type === "finance_payment").map((r) => r.id);
  const invoiceIds = raws.filter((r) => r.type === "supplier_invoice").map((r) => r.id);
  const allIds = raws.map((r) => r.id);

  // over a thousand payables: their ids are sent in batches (one long list made the web address too long and the page failed)
  const [ledgerFinanceRows, ledgerInvoiceRows, controlRows, proofRows] = await Promise.all([
    fetchAllByIds(financeIds, (ids, from, to) => supabase.from("supplier_payments").select("*").in("finance_payment_id", ids).order("id").range(from, to)),
    fetchAllByIds(invoiceIds, (ids, from, to) => supabase.from("supplier_payments").select("*").in("supplier_invoice_id", ids).order("id").range(from, to)),
    fetchAllByIds(allIds, (ids, from, to) => supabase.from("supplier_payment_controls").select("*").in("payable_id", ids).order("id").range(from, to)),
    fetchAllByIds(allIds, (ids, from, to) =>
      supabase.from("task_proofs").select("related_table, related_id, document_id, proof_type, documents(original_filename)").in("related_table", ["finance_payments", "supplier_invoices"]).in("related_id", ids).order("id").range(from, to),
    ),
  ]);
  const proofBy = new Map<string, { id: string; label: string }[]>();
  for (const pr of proofRows) {
    const k = key(pr.related_table === "finance_payments" ? "finance_payment" : "supplier_invoice", pr.related_id);
    proofBy.set(k, [...(proofBy.get(k) ?? []), { id: pr.document_id, label: pr.documents?.original_filename ?? "Document" }]);
  }

  const ledgerBy = new Map<string, LedgerEntry[]>();
  for (const l of [...ledgerFinanceRows, ...ledgerInvoiceRows]) {
    const k = l.finance_payment_id ? key("finance_payment", l.finance_payment_id) : key("supplier_invoice", l.supplier_invoice_id ?? "");
    const entry: LedgerEntry = {
      id: l.id,
      status: l.status as LedgerStatus,
      amount: Number(l.amount),
      paymentDate: l.payment_date,
      referenceNumber: l.reference_number,
      createdAt: l.created_at,
      requestedBy: l.requested_by,
      decidedAt: l.decided_at,
      decisionNote: l.decision_note,
      notes: l.notes,
      receiptDocumentId: l.receipt_document_id,
    };
    ledgerBy.set(k, [...(ledgerBy.get(k) ?? []), entry]);
  }
  const controlBy = new Map(controlRows.map((c) => [key(c.payable_type, c.payable_id), toControl(c)]));

  return sortPayables(
    raws.map((r) =>
      computePayable({ ...r, documents: [...r.documents, ...(proofBy.get(key(r.type, r.id)) ?? [])] }, ledgerBy.get(key(r.type, r.id)) ?? [], controlBy.get(key(r.type, r.id)) ?? null, today),
    ),
  );
}

export type PriorityTask = Database["public"]["Tables"]["priority_tasks"]["Row"] & { companies: { name: string } | null; document: { id: string; original_filename: string } | null };

/** The tasks of one person: given to them, or made by them and not given to anybody. A task is private to that person (also an admin does not see another person's). */
export async function loadTasks(supabase: DB, companyIds: string[], userId: string): Promise<PriorityTask[]> {
  if (companyIds.length === 0) return [];
  const { data, error } = await supabase
    .from("priority_tasks")
    .select("*, companies(name), document:documents(id, original_filename)")
    .in("company_id", companyIds)
    .or(`responsible_id.eq.${userId},and(responsible_id.is.null,created_by.eq.${userId})`)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(1000);
  if (error) throw error;
  return data as PriorityTask[];
}

/** People who can be named as responsible (everyone with an active profile). */
export async function loadPeople(supabase: DB): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name");
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name.trim() }));
}

/** Approvals other than supplier payments that are still waiting (leave, OT, purchase requests ...). */
export async function loadOtherPendingApprovals(supabase: DB, companyIds: string[]) {
  if (companyIds.length === 0) return [];
  const { data, error } = await supabase
    .from("approvals")
    .select("id, module, related_table, company_id, created_at")
    .in("company_id", companyIds)
    .eq("status", "pending")
    .neq("related_table", "supplier_payments")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Events in the next days that are still only an enquiry or a quotation: the kind of event that needs a decision. */
export async function loadEventsNeedingDecision(supabase: DB, companyIds: string[], today: string, withinDays = 7) {
  if (companyIds.length === 0) return [];
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + withinDays * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("catering_events")
    .select("id, event_name, event_date, status, company_id, pax_count")
    .in("company_id", companyIds)
    .in("status", ["enquiry", "quoted"])
    .gte("event_date", today)
    .lte("event_date", until)
    .order("event_date");
  if (error) throw error;
  return data ?? [];
}

export async function loadHistory(supabase: DB, relatedTable: string, relatedId: string) {
  const { data, error } = await supabase
    .from("task_audit_log")
    .select("*")
    .eq("related_table", relatedTable)
    .eq("related_id", relatedId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const ids = Array.from(new Set((data ?? []).map((r) => r.performed_by).filter((x): x is string => !!x)));
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name.trim()]));
  return (data ?? []).map((r) => ({ ...r, performerName: r.performed_by ? (names.get(r.performed_by) ?? "—") : "System" }));
}
