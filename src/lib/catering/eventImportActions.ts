"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { updateEventStatus } from "@/lib/catering/actions";
import { EVENT_STATUS_LABEL, EVENT_TYPE_LABEL, MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { normalizeMenu } from "@/lib/catering/days";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  parseDate,
  parseEventType,
  parseMealTypes,
  parsePax,
  parseRevenue,
  parseSalesAgent,
  parseServiceTypes,
  parseStatus,
  parseTime,
  type CheckedRow,
  type ImportAction,
  type ImportDetail,
  type ImportRow,
} from "@/lib/catering/eventImport";
import type { Database, Json } from "@/lib/supabase/types";

type Client = Awaited<ReturnType<typeof createClient>>;
type EventStatus = Database["public"]["Enums"]["event_status"];

/** Only the Quotation Request Inbox people (Ms. Nabilah, Mr. Adlan, Ms. Penny) may import confirmed events. */
async function requireImportAccess(companyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");
  if (allowed !== true) throw new Error("Only Ms. Nabilah, Mr. Adlan and Ms. Penny can import confirmed events.");
  const { data: company } = await supabase.rpc("user_has_company_access", { target_company_id: companyId });
  if (company !== true) throw new Error("You do not have access to this company.");
  return { supabase, userId: user.id };
}

/** The values of one row as an event would store them, with what could not be read. Nothing is guessed. */
type Values = {
  reference: string | null;
  customerName: string | null;
  event_name: string;
  event_date: string | null;
  event_time: string | null;
  end_time: string | null;
  location: string | null;
  event_address: string | null;
  pax: number | null;
  meal_types: string[] | null;
  service_type: string | null;
  menu_description: string | null;
  sales_agent: string | null;
  autocount_quotation_no: string | null;
  autocount_invoice_no: string | null;
  status: string | null;
  /** false when the file has no status (then "Confirmed" is used for a new event, and a saved event keeps its status) */
  statusGiven: boolean;
  event_type: string | null;
  remarks: string | null;
  total_amount: number | null;
  /** other service types of the row ("B & D": Dome Set), noted on a new event because the pax of each was not given */
  otherServices: string[];
};

const text = (v: string, max: number, label: string, errors: string[]) => {
  const s = v.trim();
  if (!s) return null;
  if (s.length > max) {
    errors.push(`${label} is longer than ${max} characters.`);
    return null;
  }
  return s;
};

function interpret(row: ImportRow): { values: Values; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const eventName = text(row.eventName, 200, "The event name", errors);
  if (!eventName) errors.push("The event name is missing.");
  const date = parseDate(row.eventDate);
  if (!row.eventDate.trim()) errors.push("The event date is missing.");
  else if (!date) errors.push(`"${row.eventDate}" is not a date (use e.g. 04/11/2026 or 2026-11-04).`);
  const time = (v: string, label: string) => {
    if (!v.trim()) return null;
    const t = parseTime(v);
    if (!t) errors.push(`"${v}" is not a valid ${label}.`);
    return t;
  };
  // "-" in an event list means the pax is not known yet
  const paxText = /^-+$/.test(row.pax.trim()) ? "" : row.pax.trim();
  const pax = paxText ? parsePax(paxText) : null;
  if (paxText && pax === null) errors.push(`"${row.pax}" is not a number of pax.`);
  const meals = row.mealTypes.trim() ? parseMealTypes(row.mealTypes) : null;
  if (meals?.unknown.length) warnings.push(`Meal type not known, left out: ${meals.unknown.join(", ")}.`);
  const services = parseServiceTypes(row.serviceType);
  const service = services.key;
  if (services.unknown.length) warnings.push(`Service type "${services.unknown.join(", ")}" is not in the list, left out.`);
  if (services.others.length) warnings.push(`Also ${services.others.join(", ")}: kept as a note (the pax of each service was not given).`);
  const revenue = parseRevenue(row.revenue);
  if (revenue === "invalid") errors.push(`"${row.revenue}" is not an amount in RM.`);
  const agent = parseSalesAgent(row.salesAgent);
  if (row.salesAgent.trim() && !agent) warnings.push(`Sales agent "${row.salesAgent}" is not in the list, left empty.`);
  const status = parseStatus(row.status);
  if (!status) errors.push(`"${row.status}" is not an event status (Confirmed, Preparation, In Progress, Completed or Cancelled).`);
  else if (!row.status.trim()) warnings.push("No status: imported as Confirmed.");
  const eventType = parseEventType(row.eventType);
  if (row.eventType.trim() && !eventType) warnings.push(`Event type "${row.eventType}" is not in the list, left as it is.`);

  return {
    values: {
      reference: text(row.eventReference, 30, "The Event ID", errors),
      customerName: text(row.customerName, 200, "The customer name", errors),
      event_name: eventName ?? "",
      event_date: date,
      event_time: time(row.startTime, "start time"),
      end_time: time(row.endTime, "end time"),
      location: text(row.venue, 300, "The venue", errors),
      event_address: text(row.eventAddress, 500, "The event address", errors),
      pax,
      meal_types: meals && meals.keys.length > 0 ? meals.keys : null,
      service_type: service,
      menu_description: row.menu.trim() ? normalizeMenu(row.menu.replace(/\s*[;|]\s*/g, "\n")) || null : null,
      sales_agent: agent,
      autocount_quotation_no: text(row.autocountQuotationNo, 50, "The AutoCount quotation number", errors),
      autocount_invoice_no: text(row.autocountInvoiceNo, 50, "The AutoCount invoice number", errors),
      status,
      statusGiven: !!row.status.trim(),
      event_type: eventType,
      remarks: text(row.remarks, 2000, "The remarks", errors),
      total_amount: revenue === "invalid" ? null : revenue,
      otherServices: services.others,
    },
    errors,
    warnings,
  };
}

const EVENT_SELECT =
  "id, event_reference, event_name, event_date, event_time, end_time, location, event_address, pax_count, service_type, service_pax, second_service_type, meal_types, menu_description, sales_agent, autocount_quotation_no, autocount_invoice_no, status, event_type, remarks, total_amount, customer_id, customers(name)";

type Existing = {
  id: string;
  event_reference: string | null;
  event_name: string;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  location: string | null;
  event_address: string | null;
  pax_count: number | null;
  service_type: string | null;
  service_pax: number | null;
  second_service_type: string | null;
  meal_types: string[] | null;
  menu_description: string | null;
  sales_agent: string | null;
  autocount_quotation_no: string | null;
  autocount_invoice_no: string | null;
  status: string;
  event_type: string;
  remarks: string | null;
  total_amount: number | string | null;
  customer_id: string | null;
  customers: { name: string } | null;
};

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase().replace(/\s+/g, " ") === (b ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const meals = (m: string[] | null) => (m ?? []).map((k) => MEAL_TYPE_LABEL[k] ?? k).join(", ");

type Change = { field: string; from: string; to: string; column: string; value: unknown };

/**
 * The values of the row that differ from the saved event. A cell left empty never clears a saved value. An event with separate
 * days keeps its dates, times, pax, meals and menu (they belong to its days); only the rest is updated.
 */
function changesFor(v: Values, e: Existing, hasDays: boolean, keepName = false): Change[] {
  const out: Change[] = [];
  const add = (field: string, from: string, to: string, column: string, value: unknown) => {
    if (!same(from, to)) out.push({ field, from: from || "—", to, column, value });
  };
  if (v.event_name && !keepName) add("Event name", e.event_name, v.event_name, "event_name", v.event_name);
  if (v.location) add("Venue", e.location ?? "", v.location, "location", v.location);
  if (v.event_address) add("Event address", e.event_address ?? "", v.event_address, "event_address", v.event_address);
  if (v.sales_agent) add("Sales agent", e.sales_agent ?? "", v.sales_agent, "sales_agent", v.sales_agent);
  if (v.autocount_quotation_no) add("AutoCount quotation no.", e.autocount_quotation_no ?? "", v.autocount_quotation_no, "autocount_quotation_no", v.autocount_quotation_no);
  if (v.autocount_invoice_no) add("AutoCount invoice no.", e.autocount_invoice_no ?? "", v.autocount_invoice_no, "autocount_invoice_no", v.autocount_invoice_no);
  if (v.event_type) add("Event type", EVENT_TYPE_LABEL[e.event_type] ?? e.event_type, EVENT_TYPE_LABEL[v.event_type] ?? v.event_type, "event_type", v.event_type);
  if (v.remarks) add("Remarks", e.remarks ?? "", v.remarks, "remarks", v.remarks);
  if (v.status && v.statusGiven) add("Status", EVENT_STATUS_LABEL[e.status] ?? e.status, EVENT_STATUS_LABEL[v.status] ?? v.status, "status", v.status);
  if (v.total_amount !== null && Number(e.total_amount ?? NaN) !== v.total_amount) {
    add("Revenue (RM)", e.total_amount === null ? "" : Number(e.total_amount).toFixed(2), v.total_amount.toFixed(2), "total_amount", v.total_amount);
  }
  if (hasDays) return out;
  if (v.event_date) add("Event date", e.event_date, v.event_date, "event_date", v.event_date);
  if (v.event_time) add("Start time", hhmm(e.event_time), v.event_time, "event_time", v.event_time);
  if (v.end_time) add("End time", hhmm(e.end_time), v.end_time, "end_time", v.end_time);
  if (v.meal_types) add("Meal type", meals(e.meal_types), meals(v.meal_types), "meal_types", v.meal_types);
  if (v.menu_description) add("Menu", e.menu_description ?? "", v.menu_description, "menu_description", v.menu_description);
  // pax and service type go together (a service type always has its pax)
  const service = v.service_type ?? e.service_type;
  if (v.pax !== null) {
    add("Pax", String(e.pax_count ?? ""), String(v.pax), "pax_count", v.pax);
    if (service && !e.second_service_type) add("Service pax", String(e.service_pax ?? ""), String(v.pax), "service_pax", v.pax);
  }
  if (v.service_type && !e.second_service_type) {
    const pax = v.pax ?? e.service_pax ?? e.pax_count;
    if (pax) {
      add("Service type", SERVICE_TYPE_LABEL[e.service_type ?? ""] ?? "", SERVICE_TYPE_LABEL[v.service_type] ?? v.service_type, "service_type", v.service_type);
      if (!out.some((c) => c.column === "service_pax")) add("Service pax", String(e.service_pax ?? ""), String(pax), "service_pax", pax);
    }
  }
  return out;
}

type Checked = CheckedRow & { values: Values; changeList: Change[]; existing: Existing | null };

/** The revenue entry the import keeps on the Event P&L (the Event Management Report reads the P&L, not the event). */
const LIST_REVENUE = "Event list revenue";
type PnlRevenue = { listEntry: { id: string; amount: number } | null; otherEntries: number };

/**
 * The Revenue (RM) of the file goes to the event's P&L: the import's own entry is added or corrected; revenue someone entered by hand
 * is never changed; an enquiry or a cancelled event gets none.
 */
function pnlRevenueChange(v: Values, status: string, pnl: PnlRevenue | undefined, warnings: string[]): Change | null {
  if (!v.total_amount || v.total_amount <= 0) return null;
  if (status === "enquiry" || status === "cancelled") {
    warnings.push("Not confirmed: the revenue is not put on the Event P&L.");
    return null;
  }
  const to = v.total_amount.toFixed(2);
  if (pnl?.listEntry) {
    return pnl.listEntry.amount === v.total_amount ? null : { field: "Revenue on Event P&L", from: pnl.listEntry.amount.toFixed(2), to, column: "pnl_revenue", value: { amount: v.total_amount, entryId: pnl.listEntry.id } };
  }
  if (pnl && pnl.otherEntries > 0) {
    warnings.push("The Event P&L already has revenue entered by hand: it is not changed.");
    return null;
  }
  return { field: "Revenue on Event P&L", from: "—", to, column: "pnl_revenue", value: { amount: v.total_amount, entryId: null } };
}

const words = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** One name inside the other ("MEDIA DIGITAL JOHOR" and "MEDIA DIGITAL JOHOR (MDJ)"). */
const near = (a: string | null | undefined, b: string | null | undefined) => {
  const x = words(a);
  const y = words(b);
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
};
const firstWord = (s: string | null | undefined) => words(s).split(" ")[0] ?? "";

/** Every row checked against the events of the company: new, an update of an existing Event ID, a likely duplicate, or an error. */
async function checkRows(supabase: Client, companyId: string, rows: ImportRow[]): Promise<Checked[]> {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("There are no rows to import.");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`At most ${MAX_IMPORT_ROWS} rows in one import.`);
  const clean: ImportRow[] = rows.map((r) => Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, String(r?.[f.key] ?? "").slice(0, 5000)])) as ImportRow);
  const read = clean.map(interpret);

  const refs = Array.from(new Set(read.map((r) => r.values.reference).filter((x): x is string => !!x)));
  const dates = Array.from(new Set(read.map((r) => r.values.event_date).filter((x): x is string => !!x)));
  const [byRef, byDate, customers] = await Promise.all([
    refs.length ? supabase.from("catering_events").select(EVENT_SELECT).eq("company_id", companyId).in("event_reference", refs) : Promise.resolve({ data: [], error: null }),
    dates.length ? supabase.from("catering_events").select(EVENT_SELECT).eq("company_id", companyId).in("event_date", dates) : Promise.resolve({ data: [], error: null }),
    supabase.from("customers").select("id, name").eq("company_id", companyId),
  ]);
  if (byRef.error) throw byRef.error;
  if (byDate.error) throw byDate.error;
  const refEvents = (byRef.data ?? []) as unknown as Existing[];
  const dateEvents = (byDate.data ?? []) as unknown as Existing[];
  const known = new Set((customers.data ?? []).map((c) => c.name.trim().toLowerCase()));

  const ids = Array.from(new Set([...refEvents, ...dateEvents].map((e) => e.id)));
  const [{ data: dayRows }, { data: revenueRows }] = ids.length
    ? await Promise.all([
        supabase.from("catering_event_days").select("catering_event_id").in("catering_event_id", ids),
        supabase.from("event_revenue_entries").select("id, catering_event_id, amount, description").in("catering_event_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const withDays = new Set((dayRows ?? []).map((d) => d.catering_event_id));
  const pnlOf = new Map<string, PnlRevenue>();
  for (const r of revenueRows ?? []) {
    const p = pnlOf.get(r.catering_event_id) ?? { listEntry: null, otherEntries: 0 };
    if (r.description === LIST_REVENUE && !p.listEntry) p.listEntry = { id: r.id, amount: Number(r.amount) };
    else p.otherEntries++;
    pnlOf.set(r.catering_event_id, p);
  }

  /** What the row would change on a saved event, the P&L revenue included. */
  const changesOf = (values: Values, e: Existing, keepName: boolean, warnings: string[]) => {
    const list = changesFor(values, e, withDays.has(e.id), keepName);
    const revenue = pnlRevenueChange(values, values.statusGiven && values.status ? values.status : e.status, pnlOf.get(e.id), warnings);
    if (revenue) list.push(revenue);
    return list;
  };
  // a saved event is matched to one row only
  const taken = new Set<string>();
  for (const r of read) {
    const e = r.values.reference ? refEvents.find((x) => same(x.event_reference, r.values.reference)) : undefined;
    if (e) taken.add(e.id);
  }

  const seenRefs = new Map<string, number>();
  return read.map(({ values, errors, warnings }, i): Checked => {
    const ref = values.reference;
    if (ref) {
      const first = seenRefs.get(ref.toLowerCase());
      if (first !== undefined) errors.push(`The Event ID ${ref} is also on row ${first + 1} of this file.`);
      else seenRefs.set(ref.toLowerCase(), i);
    }
    const existing = ref ? refEvents.find((e) => same(e.event_reference, ref)) ?? null : null;
    const customerIsNew = !!values.customerName && !known.has(values.customerName.toLowerCase());
    const base = { row: clean[i], values, errors, warnings, customerIsNew, changes: [] as CheckedRow["changes"], changeList: [] as Change[] };

    if (errors.length > 0) return { ...base, kind: "error", action: "skip", match: null, existing: null };
    if (existing) {
      const changeList = changesOf(values, existing, false, warnings);
      if (values.customerName && !same(values.customerName, existing.customers?.name)) changeList.push({ field: "Customer", from: existing.customers?.name ?? "—", to: values.customerName, column: "customer", value: values.customerName });
      if (withDays.has(existing.id)) warnings.push("This event has separate days: its dates, times, pax, meals and menu are kept (change them on the event page).");
      if (changeList.length === 0) warnings.push("Nothing to change: the event already has these values.");
      return {
        ...base,
        kind: "update",
        action: changeList.length > 0 ? "update" : "skip",
        match: { id: existing.id, reference: existing.event_reference, name: existing.event_name, date: existing.event_date, customer: existing.customers?.name ?? null },
        changes: changeList.map(({ field, from, to }) => ({ field, from, to })),
        changeList,
        existing,
      };
    }
    // no Event ID: a saved event on the same date with the same customer, name or venue is probably this one
    const candidates = dateEvents.filter(
      (e) =>
        e.event_date === values.event_date &&
        ((values.customerName && same(e.customers?.name, values.customerName)) ||
          near(e.event_name, values.event_name) ||
          near(e.customers?.name, values.event_name) ||
          (values.location && same(e.location, values.location)) ||
          (values.pax !== null && e.pax_count === values.pax && (firstWord(e.event_name) === firstWord(values.event_name) || firstWord(e.customers?.name) === firstWord(values.event_name)))),
    );
    const matchOf = (e: Existing) => ({ id: e.id, reference: e.event_reference, name: e.event_name, date: e.event_date, customer: e.customers?.name ?? null });
    // the same date, a matching name and the same pax: this is the saved event (an event list has no Event ID), so it is updated
    const sure = candidates.filter((e) => !taken.has(e.id) && values.pax !== null && e.pax_count === values.pax);
    if (sure.length === 1) {
      const e = sure[0];
      taken.add(e.id);
      warnings.push(`Matched to the saved event ${e.event_reference ?? ""} ${e.event_name} by its date, name and pax (its name is kept).`);
      const changeList = changesOf(values, e, true, warnings);
      if (changeList.length === 0) warnings.push("Nothing to change: the event already has these values.");
      return { ...base, kind: "update", action: changeList.length > 0 ? "update" : "skip", match: matchOf(e), changes: changeList.map(({ field, from, to }) => ({ field, from, to })), changeList, existing: e };
    }
    const likely = candidates.find((e) => !taken.has(e.id)) ?? candidates[0];
    if (likely) {
      warnings.push(`Possibly already saved: ${likely.event_reference ?? ""} ${likely.event_name} on ${likely.event_date}. Skipped unless you choose "Update the saved event" or "Import as new".`);
      const changeList = changesOf(values, likely, true, warnings);
      return { ...base, kind: "duplicate", action: "skip", match: matchOf(likely), changes: changeList.map(({ field, from, to }) => ({ field, from, to })), changeList, existing: likely };
    }
    if (ref && refs.length > 0) warnings.push(`New event: it will keep the Event ID ${ref}.`);
    return { ...base, kind: "new", action: "create", match: null, existing: null };
  });
}

const publicRow = (c: Checked): CheckedRow => ({ row: c.row, kind: c.kind, action: c.action, errors: c.errors, warnings: c.warnings, match: c.match, changes: c.changes, customerIsNew: c.customerIsNew });

/** Step 1: checks the rows read from the Excel file and shows what the import would do. Nothing is saved. */
export async function checkEventImport(companyId: string, rows: ImportRow[]): Promise<ActionResult<{ rows: CheckedRow[] }>> {
  return runAction(async () => {
    const { supabase } = await requireImportAccess(companyId);
    return { rows: (await checkRows(supabase, companyId, rows)).map(publicRow) };
  }, "Could not check the file. Please try again.");
}

/** A customer of the company by name; a customer that does not exist yet is created. */
async function customerIdFor(supabase: Client, companyId: string, name: string, cache: Map<string, string>, fileName: string): Promise<string> {
  const key = name.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const { data: found } = await supabase.from("customers").select("id").eq("company_id", companyId).ilike("name", name.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
  let id = found?.id;
  if (!id) {
    const { data: created, error } = await supabase.from("customers").insert({ company_id: companyId, name, notes: `Created by the Excel import of ${fileName}.` }).select("id").single();
    if (error) throw error;
    id = created.id;
  }
  cache.set(key, id);
  return id;
}

/** Adds the import's revenue entry to the Event P&L, or corrects its amount. */
async function savePnlRevenue(
  supabase: Client,
  r: { companyId: string; eventId: string; eventName: string; eventDate: string; amount: number; entryId: string | null; userId: string; fileName: string },
) {
  if (r.entryId) {
    const { error } = await supabase.from("event_revenue_entries").update({ amount: r.amount, updated_by: r.userId }).eq("id", r.entryId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("event_revenue_entries").insert({
      company_id: r.companyId,
      catering_event_id: r.eventId,
      entry_type: "sales",
      description: LIST_REVENUE,
      amount: r.amount,
      entry_date: r.eventDate,
      notes: `Revenue (RM) of ${r.fileName}.`,
      created_by: r.userId,
    });
    if (error) throw error;
  }
  await recordAudit({ companyId: r.companyId, relatedTable: "event_pnl", relatedId: r.eventId, action: r.entryId ? "revenue_updated" : "revenue_added", newValue: `${r.eventName} · Customer / client sales · RM ${r.amount.toFixed(2)} · from ${r.fileName}` });
}

/**
 * Step 2 (CONFIRM IMPORT): checks the rows again (the preview is not trusted), then creates the new events and updates the
 * existing ones the user chose, and records the import (file, sheet, who, when, and the old values of every update).
 */
export async function confirmEventImport(input: {
  companyId: string;
  fileName: string;
  sheetName?: string;
  rows: ImportRow[];
  actions: ImportAction[];
}): Promise<ActionResult<{ created: number; updated: number; skipped: number; failed: number; details: ImportDetail[] }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireImportAccess(input.companyId);
    const fileName = (input.fileName ?? "").trim().slice(0, 200) || "Excel file";
    const checked = await checkRows(supabase, input.companyId, input.rows);
    const customers = new Map<string, string>();
    const details: ImportDetail[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < checked.length; i++) {
      const c = checked[i];
      const wanted = input.actions?.[i] ?? c.action;
      const line = i + 1;
      const base = { line, name: c.values.event_name, date: c.values.event_date ?? "" };
      // what each kind of row may do: an error is never imported, an update only updates, a new or likely duplicate row only creates
      const allowed =
        c.kind === "error"
          ? "skip"
          : c.kind === "update"
            ? wanted === "update" ? "update" : "skip"
            : c.kind === "duplicate" && wanted === "update" && c.existing
              ? "update"
              : wanted === "create" ? "create" : "skip";
      if (allowed === "skip") {
        skipped++;
        details.push({ ...base, action: c.kind === "error" ? "error" : "skip", message: c.errors.join(" ") || undefined, eventId: c.match?.id, reference: c.match?.reference });
        continue;
      }
      try {
        const v = c.values;
        if (allowed === "create") {
          const customerId = v.customerName ? await customerIdFor(supabase, input.companyId, v.customerName, customers, fileName) : null;
          const { data: event, error } = await supabase
            .from("catering_events")
            .insert({
              company_id: input.companyId,
              customer_id: customerId,
              event_reference: v.reference,
              event_name: v.event_name,
              event_date: v.event_date as string,
              event_time: v.event_time,
              end_time: v.end_time,
              location: v.location,
              event_address: v.event_address,
              pax_count: v.pax,
              service_type: v.service_type && v.pax ? v.service_type : null,
              service_pax: v.service_type && v.pax ? v.pax : null,
              meal_types: v.meal_types ?? [],
              menu_description: v.menu_description,
              sales_agent: v.sales_agent,
              autocount_quotation_no: v.autocount_quotation_no,
              autocount_invoice_no: v.autocount_invoice_no,
              total_amount: v.total_amount,
              remarks: [v.remarks, v.otherServices.length ? `Also ${v.otherServices.join(", ")} (the pax of each service was not given).` : ""].filter(Boolean).join("\n") || null,
              ...(v.event_type ? { event_type: v.event_type } : {}),
              // created as an enquiry first: setting the status next makes Kitchen and Operation work for a confirmed event, as everywhere else
              status: "enquiry" as EventStatus,
            })
            .select("id, event_reference")
            .single();
          if (error) throw error;
          if (v.status && v.status !== "enquiry") await updateEventStatus(event.id, v.status);
          await recordAudit({ companyId: input.companyId, relatedTable: "catering_events", relatedId: event.id, action: "imported", newValue: `${v.event_name} · ${v.event_date} · from ${fileName}` });
          let message: string | undefined;
          const revenue = pnlRevenueChange(v, v.status ?? "confirmed", undefined, []);
          if (revenue) {
            try {
              await savePnlRevenue(supabase, { companyId: input.companyId, eventId: event.id, eventName: v.event_name, eventDate: v.event_date as string, ...(revenue.value as { amount: number; entryId: string | null }), userId, fileName });
            } catch (err) {
              message = `Event saved, but its revenue could not be put on the Event P&L: ${err instanceof Error ? err.message : (err as { message?: string })?.message ?? "error"}`;
            }
          }
          created++;
          details.push({ ...base, action: "create", eventId: event.id, reference: event.event_reference, message });
        } else if (c.existing) {
          const patch: Record<string, unknown> = {};
          let newStatus: string | null = null;
          let revenue: { amount: number; entryId: string | null } | null = null;
          for (const ch of c.changeList) {
            if (ch.column === "pnl_revenue") revenue = ch.value as { amount: number; entryId: string | null };
            else if (ch.column === "status") newStatus = ch.value as string;
            else if (ch.column === "customer") patch.customer_id = await customerIdFor(supabase, input.companyId, ch.value as string, customers, fileName);
            else patch[ch.column] = ch.value;
          }
          if (Object.keys(patch).length > 0) {
            const { error } = await supabase.from("catering_events").update(patch as Database["public"]["Tables"]["catering_events"]["Update"]).eq("id", c.existing.id);
            if (error) throw error;
          }
          if (newStatus) await updateEventStatus(c.existing.id, newStatus);
          if (revenue) {
            await savePnlRevenue(supabase, { companyId: input.companyId, eventId: c.existing.id, eventName: c.existing.event_name, eventDate: c.existing.event_date, ...revenue, userId, fileName });
          }
          const changes = c.changeList.map(({ field, from, to }) => ({ field, from, to }));
          await recordAudit({
            companyId: input.companyId,
            relatedTable: "catering_events",
            relatedId: c.existing.id,
            action: "import_updated",
            previousValue: changes.map((x) => `${x.field}: ${x.from}`).join(" · "),
            newValue: changes.map((x) => `${x.field}: ${x.to}`).join(" · "),
          });
          updated++;
          details.push({ ...base, action: "update", eventId: c.existing.id, reference: c.existing.event_reference, changes });
        }
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Could not be saved.";
        details.push({ ...base, action: "error", message: /duplicate key|23505/.test(message) ? "This Event ID is already used by another event." : message });
      }
    }

    const { error: logError } = await supabase.from("event_import_batches").insert({
      company_id: input.companyId,
      file_name: fileName,
      sheet_name: input.sheetName?.slice(0, 100) || null,
      imported_by: userId,
      created_count: created,
      updated_count: updated,
      skipped_count: skipped + failed,
      details: details as unknown as Json,
    });
    if (logError) console.warn("Event import saved; history entry failed:", logError.message);

    revalidatePath("/catering");
    revalidatePath("/catering/calendar");
    revalidatePath("/catering/import");
    revalidatePath("/catering/event-report");
    revalidatePath("/finance/event-pnl");
    return { created, updated, skipped, failed, details };
  }, "Could not import the events. Please try again.");
}
