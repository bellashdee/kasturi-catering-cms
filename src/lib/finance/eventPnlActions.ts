"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { ADDITIONAL_COST_TYPE_LABEL, ANY_DIRECT_COST_TYPE_LABEL, DUPLICATE_ENTRY_MESSAGE, EVENT_PNL_COMPANY_NAMES, REVENUE_TYPE_LABEL, round2 } from "@/lib/finance/eventPnl";
import { runAction, type ActionResult } from "@/lib/actionResult";

type DB = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/** The signed-in user must be Finance / Admin of the event's company (or one of the inbox people), and the company must be one the module covers. */
async function loadEventForFinance(supabase: DB, eventId: string) {
  const { data: event } = await supabase.from("catering_events").select("id, company_id, event_name, event_date, companies(name)").eq("id", eventId).maybeSingle();
  if (!event) throw new Error("Event not found.");
  if (!(EVENT_PNL_COMPANY_NAMES as readonly string[]).includes(event.companies?.name ?? "")) {
    throw new Error("Event P&L is only for Signature Solution and Kasturi Indah events.");
  }
  const { data: ok } = await supabase.rpc("user_can_manage_event_pnl", { target_company_id: event.company_id });
  if (ok !== true) throw new Error("Only Finance / Admin users of this company, Ms. Nabilah, Mr. Adlan and Ms. Penny can record event revenue and costs.");
  return event;
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isAmount = (n: number) => Number.isFinite(n) && n > 0;
const rm = (n: number) => `RM ${n.toFixed(2)}`;
const paths = (eventId: string) => {
  revalidatePath("/finance/event-pnl");
  revalidatePath(`/finance/event-pnl/${eventId}`);
};

// ---------------------------------------------------------------- revenue

export type RevenueEntryInput = {
  eventId: string;
  entryType: string;
  description?: string;
  amount: number;
  entryDate: string;
  documentId?: string;
  notes?: string;
  confirmDuplicate?: boolean;
};

function validateRevenue(input: RevenueEntryInput) {
  if (!REVENUE_TYPE_LABEL[input.entryType]) throw new Error("Select the revenue type.");
  if (!isAmount(input.amount)) throw new Error("Enter an amount greater than 0.");
  if (!isDate(input.entryDate)) throw new Error("Enter the date.");
}

export async function addRevenueEntry(input: RevenueEntryInput) {
  const { supabase, userId } = await requireUser();
  const event = await loadEventForFinance(supabase, input.eventId);
  validateRevenue(input);

  if (!input.confirmDuplicate) {
    const { data: same } = await supabase.from("event_revenue_entries").select("id").eq("catering_event_id", input.eventId).eq("entry_type", input.entryType).eq("amount", input.amount).eq("entry_date", input.entryDate).limit(1);
    if ((same ?? []).length > 0) throw new Error(DUPLICATE_ENTRY_MESSAGE);
  }

  const { data, error } = await supabase
    .from("event_revenue_entries")
    .insert({
      company_id: event.company_id,
      catering_event_id: input.eventId,
      entry_type: input.entryType,
      description: input.description?.trim() || null,
      amount: input.amount,
      entry_date: input.entryDate,
      document_id: input.documentId || null,
      notes: input.notes?.trim() || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  await logTaskAudit({ companyId: event.company_id, relatedTable: "event_pnl", relatedId: event.id, action: "revenue_added", newValue: `${event.event_name} · ${REVENUE_TYPE_LABEL[input.entryType]} · ${rm(input.amount)}` });
  paths(input.eventId);
  return { id: data.id };
}

export async function updateRevenueEntry(entryId: string, input: Omit<RevenueEntryInput, "eventId" | "confirmDuplicate">) {
  const { supabase, userId } = await requireUser();
  const { data: before } = await supabase.from("event_revenue_entries").select("*").eq("id", entryId).maybeSingle();
  if (!before) throw new Error("Entry not found.");
  const event = await loadEventForFinance(supabase, before.catering_event_id);
  validateRevenue({ ...input, eventId: before.catering_event_id });
  if (before.customer_invoice_id && input.entryType !== before.entry_type) throw new Error("An entry created from an invoice keeps its type. Remove it and add a new entry if it is wrong.");

  const { error } = await supabase
    .from("event_revenue_entries")
    .update({ entry_type: input.entryType, description: input.description?.trim() || null, amount: input.amount, entry_date: input.entryDate, document_id: input.documentId ?? before.document_id, notes: input.notes?.trim() || null, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw error;
  await logTaskAudit({
    companyId: event.company_id,
    relatedTable: "event_pnl",
    relatedId: event.id,
    action: "revenue_edited",
    previousValue: `${REVENUE_TYPE_LABEL[before.entry_type]} · ${rm(Number(before.amount))} · ${before.entry_date}`,
    newValue: `${REVENUE_TYPE_LABEL[input.entryType]} · ${rm(input.amount)} · ${input.entryDate}`,
  });
  paths(before.catering_event_id);
}

/** Turns an invoice already issued for this event into revenue — once only (a database rule also stops a second time). */
export async function addInvoiceAsRevenue(eventId: string, invoiceId: string) {
  const { supabase, userId } = await requireUser();
  const event = await loadEventForFinance(supabase, eventId);
  const { data: invoice } = await supabase.from("customer_invoices").select("id, company_id, catering_event_id, invoice_number, invoice_date, amount, description, document_id").eq("id", invoiceId).maybeSingle();
  if (!invoice || invoice.catering_event_id !== eventId) throw new Error("This invoice is not linked to the event.");
  const { data: used } = await supabase.from("event_revenue_entries").select("id").eq("customer_invoice_id", invoiceId).limit(1);
  if ((used ?? []).length > 0) throw new Error("This invoice is already counted as revenue.");

  // revenue is the amount before tax: SST / tax collected is not the company's revenue
  const { error } = await supabase
    .from("event_revenue_entries")
    .insert({
      company_id: event.company_id,
      catering_event_id: eventId,
      entry_type: "sales",
      description: `Invoice ${invoice.invoice_number}${invoice.description ? ` - ${invoice.description}` : ""}`,
      amount: Number(invoice.amount),
      entry_date: invoice.invoice_date,
      customer_invoice_id: invoice.id,
      document_id: invoice.document_id,
      created_by: userId,
    });
  if (error) throw error;
  await logTaskAudit({ companyId: event.company_id, relatedTable: "event_pnl", relatedId: event.id, action: "revenue_added", newValue: `${event.event_name} · invoice ${invoice.invoice_number} · ${rm(Number(invoice.amount))}` });
  paths(eventId);
}

export async function deleteRevenueEntry(entryId: string, reason: string) {
  const { supabase } = await requireUser();
  const { data: entry } = await supabase.from("event_revenue_entries").select("id, catering_event_id, entry_type, amount, description").eq("id", entryId).maybeSingle();
  if (!entry) throw new Error("Entry not found.");
  const event = await loadEventForFinance(supabase, entry.catering_event_id);
  if (!reason.trim()) throw new Error("Enter the reason for removing this entry.");
  const { error } = await supabase.from("event_revenue_entries").delete().eq("id", entryId);
  if (error) throw error;
  await logTaskAudit({ companyId: event.company_id, relatedTable: "event_pnl", relatedId: event.id, action: "revenue_removed", previousValue: `${REVENUE_TYPE_LABEL[entry.entry_type]} · ${rm(Number(entry.amount))}${entry.description ? ` · ${entry.description}` : ""}`, reason: reason.trim() });
  paths(entry.catering_event_id);
}

// ------------------------------------------------------------------ costs

export type CostEntryInput = {
  eventId: string;
  costClass: "direct" | "additional";
  costType: string;
  /** "actual" counts in the P&L; "estimated" is recorded but never counted. */
  costBasis: "actual" | "estimated";
  description?: string;
  supplierName?: string;
  referenceNo?: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  /** Total cost. When quantity and unit cost are both given and no total is typed, the total is quantity × unit cost. */
  amount: number;
  costDate: string;
  /** Not asked on the form any more: a new cost is "unpaid", an edited cost keeps the status it has. */
  paymentStatus?: "unpaid" | "paid";
  supplierInvoiceId?: string;
  documentId?: string;
  notes?: string;
  confirmDuplicate?: boolean;
};

function validateCost(input: CostEntryInput) {
  const labels = input.costClass === "direct" ? ANY_DIRECT_COST_TYPE_LABEL : ADDITIONAL_COST_TYPE_LABEL;
  if (!labels[input.costType]) throw new Error("Select the category.");
  if (input.costBasis !== "actual" && input.costBasis !== "estimated") throw new Error("Choose whether this is an actual or estimated cost.");
  if (!isAmount(input.amount)) throw new Error("Enter the total cost (it must be more than 0).");
  if (!isDate(input.costDate)) throw new Error("Enter the cost date.");
  if (input.quantity !== undefined && !isAmount(input.quantity)) throw new Error("Quantity must be more than 0.");
  if (input.unitCost !== undefined && (!Number.isFinite(input.unitCost) || input.unitCost < 0)) throw new Error("Unit cost cannot be negative.");
  return labels;
}

export async function addCostEntry(input: CostEntryInput) {
  const { supabase, userId } = await requireUser();
  const event = await loadEventForFinance(supabase, input.eventId);
  const labels = validateCost(input);

  if (input.supplierInvoiceId) {
    const { data: used } = await supabase.from("event_cost_entries").select("id").eq("supplier_invoice_id", input.supplierInvoiceId).limit(1);
    if ((used ?? []).length > 0) throw new Error("This supplier invoice is already counted as an event cost.");
  }
  if (!input.confirmDuplicate) {
    let q = supabase.from("event_cost_entries").select("id").eq("catering_event_id", input.eventId).eq("cost_type", input.costType).eq("amount", input.amount).eq("cost_date", input.costDate).eq("cost_basis", input.costBasis);
    if (input.referenceNo?.trim()) q = q.eq("reference_no", input.referenceNo.trim());
    if (input.supplierName?.trim()) q = q.ilike("supplier_name", input.supplierName.trim());
    const { data: same } = await q.limit(1);
    if ((same ?? []).length > 0) throw new Error(DUPLICATE_ENTRY_MESSAGE);
  }

  const { data, error } = await supabase
    .from("event_cost_entries")
    .insert({
      company_id: event.company_id,
      catering_event_id: input.eventId,
      cost_class: input.costClass,
      cost_type: input.costType,
      cost_basis: input.costBasis,
      description: input.description?.trim() || null,
      supplier_name: input.supplierName?.trim() || null,
      reference_no: input.referenceNo?.trim() || null,
      quantity: input.quantity ?? null,
      unit: input.unit?.trim() || null,
      unit_cost: input.unitCost ?? null,
      amount: input.amount,
      cost_date: input.costDate,
      payment_status: input.paymentStatus ?? "unpaid",
      supplier_invoice_id: input.supplierInvoiceId || null,
      document_id: input.documentId || null,
      notes: input.notes?.trim() || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  await logTaskAudit({ companyId: event.company_id, relatedTable: "event_pnl", relatedId: event.id, action: "cost_added", newValue: `${event.event_name} · ${input.costBasis} · ${labels[input.costType]} · ${rm(input.amount)}` });
  paths(input.eventId);
  return { id: data.id };
}

export type CategoryCostInput = {
  eventId: string;
  /** "direct" when left out. */
  costClass?: "direct" | "additional";
  costBasis: "actual" | "estimated";
  supplierName?: string;
  referenceNo?: string;
  costDate: string;
  paymentStatus?: "unpaid" | "paid";
  supplierInvoiceId?: string;
  documentId?: string;
  notes?: string;
  /** One cost per category: the items of the invoice in that category and their total. */
  groups: { costType: string; amount: number; description: string }[];
};

/** A supplier invoice recorded as several direct costs, one per category, all saved together. */
export async function addCostEntriesByCategory(input: CategoryCostInput): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const event = await loadEventForFinance(supabase, input.eventId);
    if (input.costBasis !== "actual" && input.costBasis !== "estimated") throw new Error("Choose whether this is an actual or estimated cost.");
    if (!isDate(input.costDate)) throw new Error("Enter the cost date.");
    const groups = input.groups.filter((g) => g.amount !== 0);
    if (groups.length === 0) throw new Error("There is no item with an amount to record.");
    const costClass = input.costClass ?? "direct";
    const labelsOf = costClass === "direct" ? ANY_DIRECT_COST_TYPE_LABEL : ADDITIONAL_COST_TYPE_LABEL;
    for (const g of groups) {
      if (!labelsOf[g.costType]) throw new Error("Choose the category of every item.");
      if (!isAmount(g.amount)) throw new Error(`The total for ${labelsOf[g.costType]} must be more than 0.`);
    }
    if (new Set(groups.map((g) => g.costType)).size !== groups.length) throw new Error("Each category can be listed once.");

    if (input.supplierInvoiceId) {
      const { data: used } = await supabase.from("event_cost_entries").select("id").eq("supplier_invoice_id", input.supplierInvoiceId).limit(1);
      if ((used ?? []).length > 0) throw new Error("This supplier invoice is already counted as an event cost.");
    }
    if (input.referenceNo?.trim()) {
      let q = supabase.from("event_cost_entries").select("id").eq("catering_event_id", input.eventId).eq("reference_no", input.referenceNo.trim());
      if (input.supplierName?.trim()) q = q.ilike("supplier_name", input.supplierName.trim());
      const { data: same } = await q.limit(1);
      if ((same ?? []).length > 0) throw new Error(`Invoice ${input.referenceNo.trim()} is already recorded as a cost of this event. Remove the earlier entry first if it should be split by category.`);
    }

    const { error } = await supabase.from("event_cost_entries").insert(
      groups.map((g) => ({
        company_id: event.company_id,
        catering_event_id: input.eventId,
        cost_class: costClass,
        cost_type: g.costType,
        cost_basis: input.costBasis,
        description: g.description.trim() || null,
        supplier_name: input.supplierName?.trim() || null,
        reference_no: input.referenceNo?.trim() || null,
        amount: round2(g.amount),
        cost_date: input.costDate,
        payment_status: input.paymentStatus ?? "unpaid",
        supplier_invoice_id: input.supplierInvoiceId || null,
        document_id: input.documentId || null,
        notes: input.notes?.trim() || null,
        created_by: userId,
      })),
    );
    if (error) throw error;
    await logTaskAudit({
      companyId: event.company_id,
      relatedTable: "event_pnl",
      relatedId: event.id,
      action: "cost_added",
      newValue: `${event.event_name} · ${input.costBasis} · ${input.referenceNo?.trim() || "invoice"} by category: ${groups.map((g) => `${labelsOf[g.costType]} ${rm(g.amount)}`).join(", ")}`,
    });
    paths(input.eventId);
    return { count: groups.length };
  }, "Could not save the costs.");
}

export async function updateCostEntry(entryId: string, input: Omit<CostEntryInput, "eventId" | "supplierInvoiceId" | "confirmDuplicate">) {
  const { supabase, userId } = await requireUser();
  const { data: before } = await supabase.from("event_cost_entries").select("*").eq("id", entryId).maybeSingle();
  if (!before) throw new Error("Entry not found.");
  const event = await loadEventForFinance(supabase, before.catering_event_id);
  const labels = validateCost({ ...input, eventId: before.catering_event_id });

  const { error } = await supabase
    .from("event_cost_entries")
    .update({
      cost_class: input.costClass,
      cost_type: input.costType,
      cost_basis: input.costBasis,
      description: input.description?.trim() || null,
      supplier_name: input.supplierName?.trim() || null,
      reference_no: input.referenceNo?.trim() || null,
      quantity: input.quantity ?? null,
      unit: input.unit?.trim() || null,
      unit_cost: input.unitCost ?? null,
      amount: input.amount,
      cost_date: input.costDate,
      payment_status: input.paymentStatus ?? before.payment_status,
      document_id: input.documentId ?? before.document_id,
      notes: input.notes?.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);
  if (error) throw error;
  await logTaskAudit({
    companyId: event.company_id,
    relatedTable: "event_pnl",
    relatedId: event.id,
    action: "cost_edited",
    previousValue: `${before.cost_basis} · ${ANY_DIRECT_COST_TYPE_LABEL[before.cost_type] ?? ADDITIONAL_COST_TYPE_LABEL[before.cost_type]} · ${rm(Number(before.amount))} · ${before.cost_date}`,
    newValue: `${input.costBasis} · ${labels[input.costType]} · ${rm(input.amount)} · ${input.costDate}`,
  });
  paths(before.catering_event_id);
}

export async function deleteCostEntry(entryId: string, reason: string) {
  const { supabase } = await requireUser();
  const { data: entry } = await supabase.from("event_cost_entries").select("id, catering_event_id, cost_type, amount, description").eq("id", entryId).maybeSingle();
  if (!entry) throw new Error("Entry not found.");
  const event = await loadEventForFinance(supabase, entry.catering_event_id);
  if (!reason.trim()) throw new Error("Enter the reason for removing this entry.");
  const { error } = await supabase.from("event_cost_entries").delete().eq("id", entryId);
  if (error) throw error;
  const label = ANY_DIRECT_COST_TYPE_LABEL[entry.cost_type] ?? ADDITIONAL_COST_TYPE_LABEL[entry.cost_type] ?? entry.cost_type;
  await logTaskAudit({ companyId: event.company_id, relatedTable: "event_pnl", relatedId: event.id, action: "cost_removed", previousValue: `${label} · ${rm(Number(entry.amount))}${entry.description ? ` · ${entry.description}` : ""}`, reason: reason.trim() });
  paths(entry.catering_event_id);
}

// ----------------------------------------------------------------- budget

export type BudgetInput = { eventId: string; budgetRevenue?: number; budgetDirectCosts?: number; budgetAdditionalCosts?: number; notes?: string };

/** Sets (or clears) the budget of an event. A figure left empty stays "not set"; it is never stored as zero. */
export async function saveEventBudget(input: BudgetInput) {
  const { supabase, userId } = await requireUser();
  const event = await loadEventForFinance(supabase, input.eventId);
  for (const v of [input.budgetRevenue, input.budgetDirectCosts, input.budgetAdditionalCosts]) {
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new Error("Budget amounts cannot be negative.");
  }
  const { data: before } = await supabase.from("event_budgets").select("*").eq("catering_event_id", input.eventId).maybeSingle();
  const row = {
    company_id: event.company_id,
    catering_event_id: input.eventId,
    budget_revenue: input.budgetRevenue ?? null,
    budget_direct_costs: input.budgetDirectCosts ?? null,
    budget_additional_costs: input.budgetAdditionalCosts ?? null,
    notes: input.notes?.trim() || null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("event_budgets").upsert(row, { onConflict: "catering_event_id" });
  if (error) throw error;
  const fmt = (r: { budget_revenue: number | null; budget_direct_costs: number | null; budget_additional_costs: number | null } | null) => (r ? `revenue ${r.budget_revenue ?? "not set"} · direct ${r.budget_direct_costs ?? "not set"} · additional ${r.budget_additional_costs ?? "not set"}` : "none");
  await logTaskAudit({ companyId: event.company_id, relatedTable: "event_pnl", relatedId: event.id, action: "budget_saved", previousValue: fmt(before as never), newValue: fmt(row) });
  paths(input.eventId);
}
