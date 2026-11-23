"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { billList, type OriginKind, type OriginRef } from "./kinds";

export type OriginBill = { id: string; name: string; uploadedBy: string | null; uploadedAt: string | null };
export type OriginFact = { label: string; value: string };
export type OriginChange = { at: string; by: string | null; action: string; before: string | null; after: string | null };

/** Everything the "Where does this amount come from?" box shows about one record. */
export type AmountOriginInfo = {
  /** what the record is ("Company expense", "Petty cash claim" ...) */
  title: string;
  /** the module and page it was keyed in on, with a link to it */
  place: { label: string; href: string | null };
  amount: number | null;
  date: string | null;
  enteredBy: string | null;
  enteredAt: string | null;
  changedAt: string | null;
  /** the bills (receipt, invoice, voucher, proof) attached to the record */
  bills: OriginBill[];
  /** a file it was imported from, when it came from an import (Excel, POS report) and not from a form */
  importedFrom: string | null;
  facts: OriginFact[];
  history: OriginChange[];
  /** a bill can be attached here (only Company Expenses without a bill yet: the other records attach bills on their own page) */
  canAttachBill: boolean;
  /** the company of the record (for the upload of a bill) */
  companyId: string | null;
};

type DB = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const money = (v: unknown) => (num(v) === null ? null : `RM ${Number(v).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fact = (label: string, value: unknown): OriginFact[] => (str(value) ? [{ label, value: String(value) }] : []);
const IMPORTED = /^(imported from|import(ed)?:)\s*/i;

/** The table each kind lives in, for the change history and the documents linked to it. */
const TABLE: Record<OriginKind, string> = {
  expense: "expenses",
  petty_cash_claim: "petty_cash_transactions",
  petty_cash_book: "operation_petty_cash",
  finance_payment: "finance_payments",
  supplier_payment: "supplier_payments",
  supplier_invoice: "supplier_invoices",
  driver_expense: "driver_expenses",
  marketing_expense: "marketing_expenses",
  payroll: "payroll_records",
  stock_movement: "stock_movements",
  event_costing: "event_costing",
  event_revenue_entry: "event_revenue_entries",
  event_cost_entry: "event_cost_entries",
  catering_event: "catering_events",
  // the Event P&L history is kept against the event as "event_pnl"
  event_pnl: "event_pnl",
  customer_invoice: "customer_invoices",
  customer_payment: "customer_payments",
  monthly_sales: "monthly_sales",
  breakdown_item: "breakdown_items",
  rst_sales_line: "rst_sales_daily",
  rst_day_total: "rst_sales_day_totals",
  rst_cash_session: "rst_cash_sessions",
};

type Read = {
  title: string;
  place: { label: string; href: string | null };
  amount: unknown;
  date: unknown;
  enteredBy: unknown;
  enteredAt: unknown;
  changedAt?: unknown;
  bills: string[];
  importedFrom?: string | null;
  people?: [string, unknown][];
  facts?: OriginFact[];
  canAttachBill?: boolean;
  companyId?: unknown;
};

async function one(db: DB, table: string, columns: string, id: string): Promise<Row> {
  // the person's own session: a record they may not see (another company, a salary they may not see) is "not found"
  const { data, error } = await (db as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Row | null; error: unknown }> } } } })
    .from(table)
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("This record was not found, or you do not have access to it.");
  return data;
}

const monthOf = (d: unknown) => (str(d) ?? "").slice(0, 7);

async function read(db: DB, ref: OriginRef): Promise<Read> {
  const { id } = ref;
  switch (ref.kind) {
    case "expense": {
      const r = await one(db, "expenses", "id, company_id, amount, expense_date, category, department, notes, invoice_no, autocount_invoice_no, note_type, document_id, created_by, created_at, updated_at", id);
      const notes = str(r.notes);
      return {
        title: r.note_type === "credit_note" ? "Company expense (Credit Note)" : r.note_type === "debit_note" ? "Company expense (Debit Note)" : "Company expense",
        place: { label: "Company Spending → Company Expenses", href: `/spending/expenses?from=${r.expense_date}&to=${r.expense_date}&q=${Number(r.amount).toFixed(2)}` },
        amount: r.amount,
        date: r.expense_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null),
        importedFrom: notes && IMPORTED.test(notes) ? notes.replace(IMPORTED, "") : null,
        facts: [...fact("Category", r.category), ...fact("Department", r.department), ...fact("Invoice / receipt no.", r.invoice_no), ...fact("AutoCount invoice no.", r.autocount_invoice_no), ...fact("Notes", notes)],
        canAttachBill: !r.document_id,
        companyId: r.company_id,
      };
    }
    case "petty_cash_claim": {
      const r = await one(db, "petty_cash_transactions", "id, amount, transaction_date, category, description, claimant_name, claimant_department, invoice_no, autocount_invoice_no, payment_status, payment_date, payment_reference, paid_by, document_id, extra_document_ids, created_by, created_at, updated_at", id);
      return {
        title: r.claimant_name ? "Staff claim (petty cash)" : "Petty cash",
        place: { label: "Company Spending → Petty Cash", href: `/spending/petty-cash?month=${monthOf(r.transaction_date)}` },
        amount: r.amount,
        date: r.transaction_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null, r.extra_document_ids as string[] | null),
        people: [["Paid out by", r.paid_by]],
        facts: [
          ...fact("Category", r.category),
          ...fact("Description", r.description),
          ...fact("Claimed by", [r.claimant_name, r.claimant_department].filter(Boolean).join(" · ")),
          ...fact("Invoice / receipt no.", r.invoice_no),
          ...fact("AutoCount invoice no.", r.autocount_invoice_no),
          ...fact("Payment", [r.payment_status, r.payment_date, r.payment_reference].filter(Boolean).join(" · ")),
        ],
      };
    }
    case "petty_cash_book": {
      const r = await one(db, "operation_petty_cash", "id, amount, entry_date, category, description, person_name, person_position, payment_method, remarks, invoice_no, autocount_invoice_no, document_id, extra_document_ids, created_by, created_at, updated_at", id);
      return {
        title: "Petty cash book",
        place: { label: "Company Spending → Petty Cash", href: `/spending/petty-cash?month=${monthOf(r.entry_date)}` },
        amount: r.amount,
        date: r.entry_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null, r.extra_document_ids as string[] | null),
        facts: [
          ...fact("Category", r.category),
          ...fact("Description", r.description),
          ...fact("Person", [r.person_name, r.person_position].filter(Boolean).join(" · ")),
          ...fact("Paid with", r.payment_method),
          ...fact("Invoice / receipt no.", r.invoice_no),
          ...fact("AutoCount invoice no.", r.autocount_invoice_no),
          ...fact("Remarks", r.remarks),
        ],
      };
    }
    case "finance_payment": {
      const r = await one(db, "finance_payments", "id, amount, category, payee_name, utility_provider, period_month, invoice_number, invoice_date, paid_date, payment_reference, voucher_number, status, remarks, document_id, proof_document_id, voucher_document_id, approved_by, created_by, created_at, updated_at", id);
      return {
        title: `Finance payment (${r.category})`,
        place: { label: "Admin & Finance → Payments", href: `/finance/payments/${id}` },
        amount: r.amount,
        date: r.paid_date ?? r.period_month,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null, r.proof_document_id as string | null, r.voucher_document_id as string | null),
        people: [["Approved by", r.approved_by]],
        facts: [
          ...fact("Paid to", r.payee_name),
          ...fact("Provider", r.utility_provider),
          ...fact("Invoice no.", r.invoice_number),
          ...fact("Invoice date", r.invoice_date),
          ...fact("Voucher no.", r.voucher_number),
          ...fact("Payment reference", r.payment_reference),
          ...fact("Status", r.status),
          ...fact("Remarks", r.remarks),
        ],
      };
    }
    case "supplier_payment": {
      const r = await one(db, "supplier_payments", "id, amount, payment_date, payment_method, reference_number, status, notes, receipt_document_id, supplier_invoice_id, requested_by, decided_by, confirmed_by, created_at, updated_at, supplier_invoices(invoice_number, document_id, suppliers(name))", id);
      const inv = (r.supplier_invoices ?? null) as { invoice_number?: string | null; document_id?: string | null; suppliers?: { name?: string | null } | null } | null;
      return {
        title: "Supplier payment",
        place: { label: "Supplier & Procurement → Supplier invoice", href: r.supplier_invoice_id ? `/supplier-procurement/invoices/${r.supplier_invoice_id}` : "/supplier-procurement" },
        amount: r.amount,
        date: r.payment_date,
        enteredBy: r.requested_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.receipt_document_id as string | null, inv?.document_id),
        people: [["Approved by", r.decided_by], ["Confirmed paid by", r.confirmed_by]],
        facts: [...fact("Supplier", inv?.suppliers?.name), ...fact("Supplier invoice no.", inv?.invoice_number), ...fact("Paid with", r.payment_method), ...fact("Reference", r.reference_number), ...fact("Status", r.status), ...fact("Notes", r.notes)],
      };
    }
    case "supplier_invoice": {
      const r = await one(db, "supplier_invoices", "id, amount, invoice_number, invoice_date, due_date, status, department, autocount_invoice_no, remarks, document_id, created_at, updated_at, suppliers(name)", id);
      return {
        title: "Supplier invoice",
        place: { label: "Supplier & Procurement → Supplier invoice", href: `/supplier-procurement/invoices/${id}` },
        amount: r.amount,
        date: r.invoice_date,
        enteredBy: null,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null),
        facts: [...fact("Supplier", (r.suppliers as { name?: string } | null)?.name), ...fact("Invoice no.", r.invoice_number), ...fact("Due", r.due_date), ...fact("Department", r.department), ...fact("AutoCount invoice no.", r.autocount_invoice_no), ...fact("Status", r.status), ...fact("Remarks", r.remarks)],
      };
    }
    case "driver_expense": {
      const r = await one(db, "driver_expenses", "id, amount, expense_date, category, distance_km, notes, document_id, created_by, created_at, updated_at", id);
      return {
        title: "Driver expense",
        place: { label: "Operation Management → Driver & Logistics", href: "/driver-logistics" },
        amount: r.amount,
        date: r.expense_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null),
        facts: [...fact("Category", r.category), ...fact("Distance (km)", r.distance_km), ...fact("Notes", r.notes)],
      };
    }
    case "marketing_expense": {
      const r = await one(db, "marketing_expenses", "id, amount, expense_date, category, description, campaign_id, document_id, created_by, created_at", id);
      return {
        title: "Marketing expense",
        place: { label: "Marketing", href: r.campaign_id ? `/marketing/${r.campaign_id}` : "/marketing" },
        amount: r.amount,
        date: r.expense_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        bills: billList(r.document_id as string | null),
        facts: [...fact("Category", r.category), ...fact("Description", r.description)],
      };
    }
    case "payroll": {
      // read with the person's own access: payroll of a person they may not see is "not found"
      const r = await one(db, "payroll_records", "id, gross_pay, pay_period_start, pay_period_end, status, paid_on, payment_method, payment_reference, paid_by, remarks, payslip_document_id, created_at, updated_at, employees(full_name, department)", id);
      const emp = (r.employees ?? null) as { full_name?: string | null; department?: string | null } | null;
      return {
        title: "Payroll (gross pay)",
        place: { label: "HR → Payroll", href: "/hr/payroll" },
        amount: r.gross_pay,
        date: r.pay_period_end,
        enteredBy: null,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.payslip_document_id as string | null),
        people: [["Paid out by", r.paid_by]],
        facts: [...fact("Staff", emp?.full_name), ...fact("Department", emp?.department), ...fact("Pay period", `${r.pay_period_start} to ${r.pay_period_end}`), ...fact("Paid on", r.paid_on), ...fact("Paid with", r.payment_method), ...fact("Reference", r.payment_reference), ...fact("Remarks", r.remarks)],
      };
    }
    case "stock_movement": {
      const r = await one(db, "stock_movements", "id, quantity, movement_type, reference_type, notes, document_id, created_by, created_at, ingredients(name, unit, unit_cost)", id);
      const ing = (r.ingredients ?? null) as { name?: string; unit?: string; unit_cost?: number } | null;
      const qty = Math.abs(Number(r.quantity));
      return {
        title: r.movement_type === "wastage" ? "Kitchen wastage" : "Kitchen stock used",
        place: { label: r.movement_type === "wastage" ? "Kitchen → Wastage" : "Kitchen → Stock", href: r.movement_type === "wastage" ? "/kitchen/wastage" : "/kitchen/stock" },
        amount: qty * Number(ing?.unit_cost ?? 0),
        date: str(r.created_at)?.slice(0, 10),
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        bills: billList(r.document_id as string | null),
        facts: [...fact("Ingredient", ing?.name), ...fact("Quantity", `${qty} ${ing?.unit ?? ""}`.trim()), ...fact("Unit cost", money(ing?.unit_cost)), ...fact("Worked out as", `${qty} × ${money(ing?.unit_cost) ?? "RM 0"}`), ...fact("Notes", r.notes)],
      };
    }
    case "event_costing": {
      const r = await one(db, "event_costing", "id, catering_event_id, food_cost, ingredient_cost, staff_cost, transport_cost, equipment_cost, other_cost, notes, updated_at, catering_events(event_name, event_date, autocount_invoice_no)", id);
      const ev = (r.catering_events ?? null) as { event_name?: string; event_date?: string; autocount_invoice_no?: string } | null;
      const parts: [string, unknown][] = [["Food cost", r.food_cost], ["Ingredient cost", r.ingredient_cost], ["Staff cost", r.staff_cost], ["Transport cost", r.transport_cost], ["Equipment cost", r.equipment_cost], ["Other cost", r.other_cost]];
      return {
        title: "Event costing",
        place: { label: "Admin & Finance → Event P&L", href: `/finance/event-pnl/${r.catering_event_id}` },
        amount: parts.reduce((t, [, v]) => t + Number(v ?? 0), 0),
        date: ev?.event_date,
        enteredBy: null,
        enteredAt: null,
        changedAt: r.updated_at,
        bills: [],
        facts: [...fact("Event", ev?.event_name), ...fact("AutoCount invoice no.", ev?.autocount_invoice_no), ...parts.flatMap(([l, v]) => (Number(v) > 0 ? fact(l, money(v)) : [])), ...fact("Notes", r.notes)],
      };
    }
    case "event_revenue_entry": {
      const r = await one(db, "event_revenue_entries", "id, catering_event_id, entry_type, description, amount, entry_date, customer_invoice_id, document_id, notes, created_by, created_at, updated_by, updated_at, customer_invoices(invoice_number, document_id)", id);
      const inv = (r.customer_invoices ?? null) as { invoice_number?: string; document_id?: string | null } | null;
      return {
        title: `Event revenue (${String(r.entry_type).replace(/_/g, " ")})`,
        place: { label: "Admin & Finance → Event P&L", href: `/finance/event-pnl/${r.catering_event_id}` },
        amount: r.amount,
        date: r.entry_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null, inv?.document_id),
        people: [["Last changed by", r.updated_by]],
        facts: [...fact("Description", r.description), ...fact("From customer invoice", inv?.invoice_number), ...fact("Notes", r.notes)],
      };
    }
    case "event_cost_entry": {
      const r = await one(db, "event_cost_entries", "id, catering_event_id, cost_class, cost_type, description, supplier_name, reference_no, amount, cost_date, document_id, notes, cost_basis, quantity, unit, unit_cost, payment_status, supplier_invoice_id, created_by, created_at, updated_by, updated_at, supplier_invoices(invoice_number, document_id)", id);
      const inv = (r.supplier_invoices ?? null) as { invoice_number?: string; document_id?: string | null } | null;
      return {
        title: `Event cost (${r.cost_class}, ${r.cost_basis})`,
        place: { label: "Admin & Finance → Event P&L", href: `/finance/event-pnl/${r.catering_event_id}` },
        amount: r.amount,
        date: r.cost_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null, inv?.document_id),
        people: [["Last changed by", r.updated_by]],
        facts: [
          ...fact("Category", String(r.cost_type ?? "").replace(/_/g, " ")),
          ...fact("Supplier", r.supplier_name),
          ...fact("Reference no.", r.reference_no),
          ...fact("From supplier invoice", inv?.invoice_number),
          ...fact("Worked out as", r.quantity && r.unit_cost ? `${r.quantity} ${r.unit ?? ""} × ${money(r.unit_cost)}` : null),
          ...fact("Payment", r.payment_status),
          ...fact("Description", r.description),
          ...fact("Notes", r.notes),
        ],
      };
    }
    case "event_pnl": {
      const r = await one(db, "catering_events", "id, event_name, event_date, pax_count, autocount_invoice_no, created_at, updated_at, customers(name)", id);
      return {
        title: "Event P&L (all the event's entries)",
        place: { label: "Admin & Finance → Event P&L of the event (every revenue and cost entry, each with its bill)", href: `/finance/event-pnl/${id}` },
        amount: null,
        date: r.event_date,
        enteredBy: null,
        enteredAt: null,
        bills: [],
        facts: [...fact("Event", r.event_name), ...fact("Customer", (r.customers as { name?: string } | null)?.name), ...fact("Pax", r.pax_count), ...fact("AutoCount invoice no.", r.autocount_invoice_no), { label: "How it is worked out", value: "The event's own revenue and cost entries, plus the costs keyed in with its AutoCount invoice no. Open the event to see each one and its bill." }],
      };
    }
    case "catering_event": {
      const r = await one(db, "catering_events", "id, event_name, event_date, total_amount, pax_count, price_per_pax, autocount_quotation_no, autocount_invoice_no, created_at, updated_at, customers(name)", id);
      // the bill of an event's amount is its customer invoice
      const { data: invoices } = await db.from("customer_invoices").select("document_id").eq("catering_event_id", id);
      return {
        title: "Catering event",
        place: { label: "Catering → Event", href: `/catering/${id}` },
        amount: r.total_amount,
        date: r.event_date,
        enteredBy: null,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList((invoices ?? []).map((i) => i.document_id)),
        facts: [...fact("Event", r.event_name), ...fact("Customer", (r.customers as { name?: string } | null)?.name), ...fact("Pax", r.pax_count), ...fact("Price per pax", money(r.price_per_pax)), ...fact("AutoCount quotation no.", r.autocount_quotation_no), ...fact("AutoCount invoice no.", r.autocount_invoice_no)],
      };
    }
    case "customer_invoice": {
      const r = await one(db, "customer_invoices", "id, invoice_number, invoice_date, due_date, amount, tax_amount, status, description, document_id, catering_event_id, created_at, updated_at, customers(name)", id);
      return {
        title: "Customer invoice",
        place: { label: "Admin & Finance → Invoices", href: `/finance/invoices/${id}` },
        amount: r.amount,
        date: r.invoice_date,
        enteredBy: null,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(r.document_id as string | null),
        facts: [...fact("Customer", (r.customers as { name?: string } | null)?.name), ...fact("Invoice no.", r.invoice_number), ...fact("Due", r.due_date), ...fact("Tax", money(r.tax_amount)), ...fact("Status", r.status), ...fact("Description", r.description)],
      };
    }
    case "customer_payment": {
      const r = await one(db, "customer_payments", "id, amount, payment_date, payment_reference, payment_remarks, customer_invoice_id, recorded_by, created_at, updated_at, customer_invoices(invoice_number, document_id)", id);
      const inv = (r.customer_invoices ?? null) as { invoice_number?: string; document_id?: string | null } | null;
      return {
        title: "Customer payment received",
        place: { label: "Admin & Finance → Invoices", href: `/finance/invoices/${r.customer_invoice_id}` },
        amount: r.amount,
        date: r.payment_date,
        enteredBy: r.recorded_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: billList(inv?.document_id),
        facts: [...fact("For invoice no.", inv?.invoice_number), ...fact("Reference", r.payment_reference), ...fact("Remarks", r.payment_remarks)],
      };
    }
    case "monthly_sales": {
      const r = await one(db, "monthly_sales", "id, year, month, sales_type, sales_amount, notes, updated_by, updated_at", id);
      const notes = str(r.notes);
      const type = r.sales_type === "catering" ? "catering events" : r.sales_type === "daily" ? "daily sales" : "total";
      return {
        title: `Monthly sales from AutoCount (${type})`,
        place: { label: "Admin & Finance → Monthly Sales", href: "/admin" },
        amount: r.sales_amount,
        date: `${r.year}-${String(r.month).padStart(2, "0")}`,
        enteredBy: r.updated_by,
        enteredAt: r.updated_at,
        bills: [],
        importedFrom: notes && IMPORTED.test(notes) ? notes.replace(IMPORTED, "") : null,
        facts: [...fact("Month", `${r.year}-${String(r.month).padStart(2, "0")}`), ...fact("Notes", notes), { label: "How it is kept", value: "Keyed in as one monthly total (from the AutoCount report); there is no bill for it in the system." }],
      };
    }
    case "breakdown_item": {
      const r = await one(db, "breakdown_items", "id, year, line, label, budget, note, amounts, updated_by, updated_at", id);
      const amounts = (r.amounts ?? []) as (number | null)[];
      const LINE: Record<string, string> = { raw: "Raw item cost", labour: "Labour / salary", utilities: "Utilities", contribution: "Contribution" };
      return {
        title: `Monthly Breakdown line (${LINE[String(r.line)] ?? r.line})`,
        place: { label: "Reports → Monthly Breakdown (the editor at the bottom of the page)", href: `/reports/monthly-breakdown?year=${r.year}` },
        amount: null,
        date: String(r.year),
        enteredBy: r.updated_by,
        enteredAt: r.updated_at,
        bills: [],
        facts: [
          ...fact("Item", r.label),
          ...fact("Budget", money(r.budget)),
          ...fact("Note", r.note),
          ...fact("Months keyed in", amounts.map((v, m) => (v === null ? null : `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]} ${money(v)}`)).filter(Boolean).join(" · ")),
          { label: "How it is kept", value: "Keyed in by hand on the Monthly Breakdown (from the costing report); there is no bill for it in the system." },
        ],
      };
    }
    case "rst_sales_line": {
      const r = await one(db, "rst_sales_daily", "id, sales_date, shift_no, channel, payment_method, gross_amount, discount_amount, refund_amount, orders_count, source, status, notes, confirmed_by, confirmed_at, created_by, created_at, updated_at", id);
      return {
        title: "Restaurant daily sales line",
        place: { label: "Restaurant → Daily sales", href: `/restaurant/sales?date=${r.sales_date}` },
        amount: Number(r.gross_amount ?? 0) - Number(r.discount_amount ?? 0) - Number(r.refund_amount ?? 0),
        date: r.sales_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: [],
        people: [["Confirmed by", r.confirmed_by]],
        facts: [...fact("Shift", r.shift_no), ...fact("Channel", r.channel), ...fact("Payment method", r.payment_method), ...fact("Gross", money(r.gross_amount)), ...fact("Discount", money(r.discount_amount)), ...fact("Refund", money(r.refund_amount)), ...fact("Orders", r.orders_count), ...fact("Keyed in from", r.source), ...fact("Status", r.status), ...fact("Notes", r.notes)],
      };
    }
    case "rst_day_total": {
      const r = await one(db, "rst_sales_day_totals", "id, sales_date, source, outlet, bills, pax, gross, discount, nett, source_file, status, origin, confirmed_by, created_by, created_at, updated_at", id);
      return {
        title: "Restaurant day total (POS report)",
        place: { label: "Restaurant → Daily sales", href: `/restaurant/sales?date=${r.sales_date}` },
        amount: r.nett,
        date: r.sales_date,
        enteredBy: r.created_by,
        enteredAt: r.created_at,
        changedAt: r.updated_at,
        bills: [],
        importedFrom: str(r.source_file),
        people: [["Confirmed by", r.confirmed_by]],
        facts: [...fact("Outlet", r.outlet), ...fact("Bills", r.bills), ...fact("Pax", r.pax), ...fact("Gross", money(r.gross)), ...fact("Discount", money(r.discount)), ...fact("Keyed in from", r.source ?? r.origin), ...fact("Status", r.status)],
      };
    }
    case "rst_cash_session": {
      const r = await one(db, "rst_cash_sessions", "id, session_date, shift_no, opening_cash, cash_expenses, withdrawals, expected_closing, counted_closing, variance, variance_note, status, opened_by, opened_at, closed_by, closed_at, created_at, updated_at", id);
      return {
        title: "Restaurant cash session",
        place: { label: "Restaurant → Cash", href: `/restaurant/cash?date=${r.session_date}` },
        amount: r.variance,
        date: r.session_date,
        enteredBy: r.opened_by,
        enteredAt: r.opened_at ?? r.created_at,
        changedAt: r.closed_at ?? r.updated_at,
        bills: [],
        people: [["Closed by", r.closed_by]],
        facts: [...fact("Shift", r.shift_no), ...fact("Opening cash", money(r.opening_cash)), ...fact("Cash expenses", money(r.cash_expenses)), ...fact("Withdrawals", money(r.withdrawals)), ...fact("Expected closing", money(r.expected_closing)), ...fact("Counted closing", money(r.counted_closing)), ...fact("Difference", money(r.variance)), ...fact("Reason given", r.variance_note), ...fact("Status", r.status)],
      };
    }
  }
}

/**
 * Where an amount comes from: the bills attached to its record, who keyed it in and when, on which page, and the changes made to
 * it since. Read with the person's own access, so nobody sees a record (or a bill) they could not open on its own page.
 */
export async function getAmountOrigin(ref: OriginRef): Promise<ActionResult<{ info: AmountOriginInfo }>> {
  return runAction(async () => {
    if (!ref || !(ref.kind in TABLE) || typeof ref.id !== "string" || !ref.id) throw new Error("This amount has no record to show.");
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error("Please sign in again.");

    const r = await read(db, ref);
    const table = TABLE[ref.kind];

    // bills linked from the documents side too (a file uploaded for the record and confirmed against it)
    const { data: linked } = await db.from("documents").select("id").eq("related_table", table).eq("related_id", ref.id).limit(20);
    const billIds = billList(r.bills, (linked ?? []).map((d) => d.id));
    const { data: docs } = billIds.length ? await db.from("documents").select("id, original_filename, uploaded_by, uploaded_at").in("id", billIds) : { data: [] };

    const { data: log } = await db.from("task_audit_log").select("action, performed_by, previous_value, new_value, created_at").eq("related_table", table).eq("related_id", ref.id).order("created_at", { ascending: false }).limit(8);

    const personIds = billList(str(r.enteredBy), ...(r.people ?? []).map(([, v]) => str(v)), ...(docs ?? []).map((d) => d.uploaded_by), ...(log ?? []).map((l) => l.performed_by));
    const { data: profiles } = personIds.length ? await db.from("profiles").select("id, full_name, email").in("id", personIds) : { data: [] };
    const nameOf = (id: unknown) => {
      const p = (profiles ?? []).find((x) => x.id === id);
      return p ? (p.full_name?.trim() || p.email || null) : null;
    };

    const byId = new Map((docs ?? []).map((d) => [d.id, d]));
    const info: AmountOriginInfo = {
      title: r.title,
      place: r.place,
      amount: num(r.amount),
      date: str(r.date),
      enteredBy: nameOf(r.enteredBy),
      enteredAt: str(r.enteredAt),
      changedAt: str(r.changedAt),
      bills: billIds.filter((id) => byId.has(id)).map((id) => {
        const d = byId.get(id)!;
        return { id, name: d.original_filename, uploadedBy: nameOf(d.uploaded_by), uploadedAt: d.uploaded_at };
      }),
      importedFrom: r.importedFrom ?? null,
      facts: [...(r.people ?? []).flatMap(([label, v]) => fact(label, nameOf(v))), ...(r.facts ?? [])],
      history: (log ?? []).map((l) => ({ at: l.created_at, by: nameOf(l.performed_by), action: l.action.replace(/_/g, " "), before: l.previous_value, after: l.new_value })),
      canAttachBill: !!r.canAttachBill,
      companyId: str(r.companyId),
    };
    return { info };
  }, "The details of this amount could not be read. Please try again.");
}

/** Attaches a bill (already uploaded with uploadReceipt) to a Company Expense that has none yet. */
export async function attachExpenseBill(expenseId: string, documentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error("Please sign in again.");
    const { data: before } = await db.from("expenses").select("id, company_id, document_id, category, amount, expense_date").eq("id", expenseId).maybeSingle();
    if (!before) throw new Error("This expense was not found.");
    const { data: allowed } = await db.rpc("user_has_company_access", { target_company_id: before.company_id });
    if (allowed !== true) throw new Error("You cannot change the expenses of this company.");
    if (before.document_id) throw new Error("This expense already has a bill.");
    const { error } = await db.from("expenses").update({ document_id: documentId }).eq("id", expenseId).is("document_id", null);
    if (error) throw new Error("The bill could not be attached.");
    await db.from("documents").update({ related_table: "expenses", related_id: expenseId, extraction_status: "confirmed", reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", documentId);
    await recordAudit({ companyId: before.company_id, relatedTable: "expenses", relatedId: expenseId, action: "bill_attached", newValue: `${before.category} · RM ${Number(before.amount).toFixed(2)} · ${before.expense_date}` });
    revalidatePath("/spending/expenses");
    return {};
  }, "The bill could not be attached. Please try again.");
}
