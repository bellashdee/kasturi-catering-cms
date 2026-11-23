"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { FEEDME_SOURCE, MAX_FILE_BYTES, parseFeedMeOverview, type FeedMeDay } from "@/lib/restaurant/feedme";
import { detectFeedMeKind, parseFeedMeCloseUp, type CloseUpDay } from "@/lib/restaurant/closeup";

/**
 * The FeedMe import: the file is read here on the server (never trusted), shown as a preview, and saved only when the person confirms.
 * Saving never overwrites or deletes anything: a day that is already there is skipped, and every imported day starts as a draft.
 */
async function context() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  const db = (await createClient()) as unknown as SupabaseClient;
  return { session, db };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cents = (v: number) => Math.round(v * 100);

export type SavedDay = { status: string; bills: number; pax: number | null; gross: number; discount: number; serviceCharge: number; sst: number; deliveryFee: number; rounding: number; nett: number };
export type PreviewDay = FeedMeDay & {
  /** new = can be imported; same = already imported with these figures; different = a day with other figures is already saved; blocked = cannot be imported */
  state: "new" | "same" | "different" | "blocked";
  saved: SavedDay | null;
  /** sales lines already keyed in by hand for that day (draft or confirmed) */
  manualLines: number;
  manualNet: number;
};
export type FeedMePreview = { fileName: string; merchant: string; dateRange: string | null; warnings: string[]; days: PreviewDay[] };

async function readFile(formData: FormData): Promise<{ name: string; bytes: Uint8Array }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose the FeedMe Excel file first.");
  if (!/\.xlsx$/i.test(file.name)) throw new Error("The file must be an Excel .xlsx file (FeedMe: Report → Overview → Download → Excel).");
  if (file.size > MAX_FILE_BYTES) throw new Error("This file is too big. Download a shorter date range from FeedMe.");
  return { name: file.name.slice(0, 120), bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function classify(db: SupabaseClient, companyId: string, days: FeedMeDay[]): Promise<PreviewDay[]> {
  const dates = days.map((d) => d.date);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const [saved, manual] = await Promise.all([
    db.from("rst_sales_day_totals").select("sales_date, outlet, status, bills, pax, gross, discount, service_charge, sst, delivery_fee, rounding, nett").eq("company_id", companyId).eq("source", FEEDME_SOURCE).neq("status", "cancelled").gte("sales_date", from).lte("sales_date", to).range(0, 4999),
    db.from("rst_sales_daily").select("sales_date, gross_amount, discount_amount, refund_amount").eq("company_id", companyId).neq("status", "cancelled").gte("sales_date", from).lte("sales_date", to).range(0, 9999),
  ]);
  if (saved.error) throw saved.error;
  if (manual.error) throw manual.error;

  const savedBy = new Map<string, SavedDay>();
  for (const r of (saved.data ?? []) as Record<string, unknown>[]) {
    savedBy.set(`${r.sales_date}|${String(r.outlet).toLowerCase()}`, {
      status: String(r.status),
      bills: Number(r.bills),
      pax: r.pax === null ? null : Number(r.pax),
      gross: Number(r.gross),
      discount: Number(r.discount),
      serviceCharge: Number(r.service_charge),
      sst: Number(r.sst),
      deliveryFee: Number(r.delivery_fee),
      rounding: Number(r.rounding),
      nett: Number(r.nett),
    });
  }
  const manualBy = new Map<string, { lines: number; net: number }>();
  for (const r of (manual.data ?? []) as Record<string, unknown>[]) {
    const cur = manualBy.get(String(r.sales_date)) ?? { lines: 0, net: 0 };
    cur.lines += 1;
    cur.net += Number(r.gross_amount) - Number(r.discount_amount) - Number(r.refund_amount);
    manualBy.set(String(r.sales_date), cur);
  }

  return days.map((d) => {
    const s = savedBy.get(`${d.date}|${d.outlet.toLowerCase()}`) ?? null;
    const m = manualBy.get(d.date);
    const same = s && s.bills === d.bills && s.pax === d.pax && cents(s.gross) === cents(d.gross) && cents(s.discount) === cents(d.discount) && cents(s.serviceCharge) === cents(d.serviceCharge) && cents(s.sst) === cents(d.sst) && cents(s.deliveryFee) === cents(d.deliveryFee) && cents(s.rounding) === cents(d.rounding) && cents(s.nett) === cents(d.nett);
    const state: PreviewDay["state"] = d.problem ? "blocked" : !s ? "new" : same ? "same" : "different";
    return { ...d, state, saved: s, manualLines: m?.lines ?? 0, manualNet: Math.round((m?.net ?? 0) * 100) / 100 };
  });
}

export type CloseUpPreview = {
  fileName: string;
  merchant: string;
  day: CloseUpDay;
  /**
   * new_day = the day is not saved yet: the Close up creates it (a draft) with its split;
   * attach = the day is already saved (Overview file) with the same figures: the split is attached to it, no second sale;
   * same = this Close up is already imported; different = the day is saved with other figures (both shown, nothing overwritten); blocked = cannot be imported
   */
  state: "new_day" | "attach" | "same" | "different" | "blocked";
  saved: (SavedDay & { origin: string }) | null;
  manualLines: number;
  manualNet: number;
};

async function classifyCloseUp(db: SupabaseClient, companyId: string, fileName: string, merchant: string, day: CloseUpDay): Promise<CloseUpPreview> {
  const [saved, manual] = await Promise.all([
    db.from("rst_sales_day_totals").select("id, status, origin, bills, pax, gross, discount, service_charge, sst, delivery_fee, rounding, nett").eq("company_id", companyId).eq("source", FEEDME_SOURCE).eq("sales_date", day.date).ilike("outlet", day.outlet).neq("status", "cancelled").limit(1),
    db.from("rst_sales_daily").select("gross_amount, discount_amount, refund_amount").eq("company_id", companyId).eq("sales_date", day.date).neq("status", "cancelled").range(0, 999),
  ]);
  if (saved.error) throw saved.error;
  if (manual.error) throw manual.error;
  const r = ((saved.data ?? []) as Record<string, unknown>[])[0];
  let hasCloseUp = false;
  if (r) {
    const { data, error } = await db.from("rst_day_closeups").select("id").eq("day_total_id", r.id as string).limit(1);
    if (error) throw error;
    hasCloseUp = (data ?? []).length > 0;
  }
  const savedDay: CloseUpPreview["saved"] = r
    ? { status: String(r.status), origin: String(r.origin), bills: Number(r.bills), pax: r.pax === null ? null : Number(r.pax), gross: Number(r.gross), discount: Number(r.discount), serviceCharge: Number(r.service_charge), sst: Number(r.sst), deliveryFee: Number(r.delivery_fee), rounding: Number(r.rounding), nett: Number(r.nett) }
    : null;
  const manualRows = (manual.data ?? []) as Record<string, unknown>[];
  const manualNet = manualRows.reduce((t, m) => t + Number(m.gross_amount) - Number(m.discount_amount) - Number(m.refund_amount), 0);
  const same =
    savedDay !== null &&
    savedDay.bills === day.bills && savedDay.pax === day.pax && cents(savedDay.gross) === cents(day.gross) && cents(savedDay.discount) === cents(day.discount) && cents(savedDay.serviceCharge) === cents(day.serviceCharge) &&
    cents(savedDay.sst) === cents(day.sst) && cents(savedDay.deliveryFee) === cents(day.deliveryFee) && cents(savedDay.rounding) === cents(day.rounding) && cents(savedDay.nett) === cents(day.nett);
  const state: CloseUpPreview["state"] = day.problem ? "blocked" : !savedDay ? "new_day" : !same ? "different" : hasCloseUp ? "same" : "attach";
  return { fileName, merchant, day, state, saved: savedDay, manualLines: manualRows.length, manualNet: Math.round(manualNet * 100) / 100 };
}

/** Reads the file (the Overview or the Close up of FeedMe) and shows what it holds and what would happen. Nothing is saved. */
export async function previewFeedMeImport(formData: FormData): Promise<ActionResult<{ kind: "overview"; preview: FeedMePreview } | { kind: "closeup"; closeup: CloseUpPreview }>> {
  return runAction(async () => {
    const { db } = await context();
    const companyId = String(formData.get("companyId") ?? "");
    if (!UUID.test(companyId)) throw new Error("The company is missing. Reload the page.");
    const file = await readFile(formData);
    const kind = detectFeedMeKind(file.bytes);
    if (kind === null) throw new Error("This is not a FeedMe file. Download the Overview (Report → Overview) or the Close up (Report → Close up) of one day as Excel.");
    if (kind === "closeup") {
      const parsedCloseUp = parseFeedMeCloseUp(file.bytes);
      if (!parsedCloseUp.ok) throw new Error(parsedCloseUp.error);
      return { kind: "closeup" as const, closeup: await classifyCloseUp(db, companyId, file.name, parsedCloseUp.merchant, parsedCloseUp.day) };
    }
    const parsed = parseFeedMeOverview(file.bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    const days = await classify(db, companyId, parsed.days);
    return { kind: "overview" as const, preview: { fileName: file.name, merchant: parsed.merchant, dateRange: parsed.dateRange, warnings: parsed.warnings, days } };
  });
}

/** Saves the Close up of one day in ONE database step: the day (when it is not saved yet) as a draft, and its split by payment method and order type. */
async function importCloseUp(db: SupabaseClient, companyId: string, formData: FormData, file: { name: string; bytes: Uint8Array }): Promise<{ imported: number; skipped: { date: string; reason: string }[] }> {
  const parsed = parseFeedMeCloseUp(file.bytes);
  if (!parsed.ok) throw new Error(parsed.error);
  const c = await classifyCloseUp(db, companyId, file.name, parsed.merchant, parsed.day);
  const d = c.day;
  if (c.state === "blocked") throw new Error(d.problem ?? "This day cannot be imported.");
  if (c.state === "same") throw new Error("The Close up of this day is already imported.");
  if (c.state === "different") throw new Error("This day is already saved with other figures. Nothing was overwritten.");
  if (c.state === "new_day" && c.manualLines > 0 && formData.getAll("ack").length === 0) throw new Error("This day already has sales keyed in by hand: tick the choice to import it anyway.");
  const payload = {
    bills: d.bills,
    pax: d.pax,
    gross: d.gross,
    discount: d.discount,
    service_charge: d.serviceCharge,
    sst: d.sst,
    delivery_fee: d.deliveryFee,
    rounding: d.rounding,
    nett: d.nett,
    void_bills: d.voidBills,
    void_amount: d.voidAmount,
    refund_amount: d.refundAmount,
    source_file: file.name,
    manual_lines_ack: c.state === "new_day" && c.manualLines > 0 ? c.manualNet : null,
    payments: d.payments.map((p) => ({ label: p.label, key: p.key, qty: p.qty, amount: p.amount })),
    channels: d.channels.map((p) => ({ label: p.label, key: p.key, qty: p.qty, amount: p.amount })),
  };
  const { error } = await db.rpc("rst_import_closeup", { p_company: companyId, p_date: d.date, p_outlet: d.outlet, p_payload: payload });
  if (error) {
    if (error.code === "23505") throw new Error("The Close up of this day is already imported.");
    throw error;
  }
  revalidatePath("/restaurant", "layout");
  return { imported: 1, skipped: [] };
}

/**
 * Saves the chosen days as drafts. The file is read again here, so the figures always come from the file, never from the browser.
 * A day that already has hand-keyed sales lines is saved only when the person ticked it ("dates that already have sales").
 */
export async function importFeedMe(formData: FormData): Promise<ActionResult<{ imported: number; skipped: { date: string; reason: string }[] }>> {
  return runAction(async () => {
    const { db } = await context();
    const companyId = String(formData.get("companyId") ?? "");
    if (!UUID.test(companyId)) throw new Error("The company is missing. Reload the page.");
    const file = await readFile(formData);
    if (detectFeedMeKind(file.bytes) === "closeup") return importCloseUp(db, companyId, formData, file);
    const chosen = new Set(formData.getAll("date").map(String));
    const acknowledged = new Set(formData.getAll("ack").map(String));
    if (chosen.size === 0) throw new Error("Tick at least one day to import.");

    const parsed = parseFeedMeOverview(file.bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    const days = await classify(db, companyId, parsed.days);

    const skipped: { date: string; reason: string }[] = [];
    const rows: Record<string, unknown>[] = [];
    for (const d of days) {
      if (!chosen.has(d.date)) continue;
      if (d.state !== "new") {
        skipped.push({ date: d.date, reason: d.state === "same" ? "Already imported" : d.state === "different" ? "A day with other figures is already saved" : (d.problem ?? "Cannot be imported") });
        continue;
      }
      if (d.manualLines > 0 && !acknowledged.has(d.date)) {
        skipped.push({ date: d.date, reason: "Already has sales keyed in by hand: tick the choice to import it anyway" });
        continue;
      }
      rows.push({
        company_id: companyId,
        source: FEEDME_SOURCE,
        sales_date: d.date,
        outlet: d.outlet,
        bills: d.bills,
        pax: d.pax,
        gross: d.gross,
        discount: d.discount,
        service_charge: d.serviceCharge,
        sst: d.sst,
        delivery_fee: d.deliveryFee,
        rounding: d.rounding,
        nett: d.nett,
        source_file: file.name,
        manual_lines_ack: d.manualLines > 0 ? d.manualNet : null,
      });
    }
    if (rows.length > 0) {
      // one statement: all the chosen days are saved, or none
      const { error } = await db.from("rst_sales_day_totals").insert(rows);
      if (error) {
        if (error.code === "23505") throw new Error("Some of these days were imported in the meantime. Choose the file again to see the new state.");
        throw error;
      }
    }
    revalidatePath("/restaurant", "layout");
    return { imported: rows.length, skipped };
  });
}

export async function confirmDayTotal(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const { data, error } = await db.from("rst_sales_day_totals").update({ status: "confirmed" }).eq("id", id).eq("status", "draft").select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("This day is not a draft (or you may not confirm it).");
    revalidatePath("/restaurant", "layout");
    return {};
  });
}

export async function deleteDraftDayTotal(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const { error } = await db.from("rst_sales_day_totals").delete().eq("id", id).eq("status", "draft");
    if (error) throw error;
    revalidatePath("/restaurant", "layout");
    return {};
  });
}

export async function cancelDayTotal(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    if (!reason.trim()) throw new Error("Write the reason for cancelling.");
    const { data, error } = await db.from("rst_sales_day_totals").update({ status: "cancelled", cancel_reason: reason.trim() }).eq("id", id).eq("status", "confirmed").select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("This day is not confirmed (or you may not cancel it).");
    revalidatePath("/restaurant", "layout");
    return {};
  });
}
