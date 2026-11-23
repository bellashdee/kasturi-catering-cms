"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { FEEDME_SOURCE, MAX_FILE_BYTES, parseFeedMeOverview, type FeedMeDay } from "@/lib/restaurant/feedme";

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

/** Reads the file and shows what it holds and what would happen to each day. Nothing is saved. */
export async function previewFeedMeImport(formData: FormData): Promise<ActionResult<{ preview: FeedMePreview }>> {
  return runAction(async () => {
    const { db } = await context();
    const companyId = String(formData.get("companyId") ?? "");
    if (!UUID.test(companyId)) throw new Error("The company is missing. Reload the page.");
    const file = await readFile(formData);
    const parsed = parseFeedMeOverview(file.bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    const days = await classify(db, companyId, parsed.days);
    return { preview: { fileName: file.name, merchant: parsed.merchant, dateRange: parsed.dateRange, warnings: parsed.warnings, days } };
  });
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
    const chosen = new Set(formData.getAll("date").map(String));
    const acknowledged = new Set(formData.getAll("ack").map(String));
    if (chosen.size === 0) throw new Error("Tick at least one day to import.");

    const file = await readFile(formData);
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
