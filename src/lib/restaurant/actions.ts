"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { CHANNELS, PAYMENT_METHODS, RESTAURANT_ROLES } from "@/lib/restaurant/constants";

/**
 * Every restaurant action returns an ActionResult (production hides the message of a thrown error). The database has the last word: row
 * level security, the guard triggers and the closing functions refuse what a person may not do, and their message is shown as it is.
 */
async function context() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  const db = (await createClient()) as unknown as SupabaseClient;
  return { session, db };
}

function refresh() {
  revalidatePath("/restaurant", "layout");
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** An amount typed by a person: not negative, at most 2 decimals, not absurdly large. */
function money(value: number, label: string, { required = true } = {}): number {
  if (!Number.isFinite(value)) {
    if (required) throw new Error(`Enter ${label}.`);
    return 0;
  }
  if (value < 0) throw new Error(`${label} cannot be negative.`);
  if (value > 9_999_999) throw new Error(`${label} is too large.`);
  return Math.round(value * 100) / 100;
}

export type SalesLineInput = {
  id?: string;
  companyId: string;
  date: string;
  shiftNo: number;
  channel: string;
  paymentMethod: string;
  gross: number;
  discount: number;
  refund: number;
  orders: number | null;
  notes: string;
};

/** Adds a sales line of a day as a draft, or changes a draft line. A confirmed line is never changed (it is cancelled with a reason). */
export async function saveSalesLine(input: SalesLineInput): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    if (!isDate(input.date)) throw new Error("Choose the date of the sales.");
    if (!CHANNELS.some((c) => c.key === input.channel)) throw new Error("Choose the channel.");
    if (!PAYMENT_METHODS.some((p) => p.key === input.paymentMethod)) throw new Error("Choose the payment method.");
    if (!Number.isInteger(input.shiftNo) || input.shiftNo < 1 || input.shiftNo > 9) throw new Error("The shift must be 1 to 9.");
    const gross = money(input.gross, "the sales amount");
    const discount = money(input.discount, "The discount", { required: false });
    const refund = money(input.refund, "The refund", { required: false });
    if (discount + refund > gross) throw new Error("The discount and the refund together cannot be more than the sales amount.");
    if (input.orders !== null && (!Number.isInteger(input.orders) || input.orders < 0)) throw new Error("The number of orders must be a whole number.");
    const row = {
      sales_date: input.date,
      shift_no: input.shiftNo,
      channel: input.channel,
      payment_method: input.paymentMethod,
      gross_amount: gross,
      discount_amount: discount,
      refund_amount: refund,
      orders_count: input.orders,
      notes: input.notes.trim() || null,
    };
    const { error } = input.id
      ? await db.from("rst_sales_daily").update(row).eq("id", input.id).eq("status", "draft")
      : await db.from("rst_sales_daily").insert({ ...row, company_id: input.companyId });
    if (error) {
      if (error.code === "23505") throw new Error("This day, shift, channel and payment method already has a sales line. Change that line instead of adding another.");
      throw error;
    }
    refresh();
    return {};
  });
}

export async function deleteDraftLine(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const { error } = await db.from("rst_sales_daily").delete().eq("id", id).eq("status", "draft");
    if (error) throw error;
    refresh();
    return {};
  });
}

/** Confirms every draft line of the day in one step (a second press confirms nothing more). */
export async function confirmDay(companyId: string, date: string): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const { db } = await context();
    if (!isDate(date)) throw new Error("Choose the date of the sales.");
    const { data, error } = await db.from("rst_sales_daily").update({ status: "confirmed" }).eq("company_id", companyId).eq("sales_date", date).eq("status", "draft").select("id");
    if (error) throw error;
    // the day total imported from FeedMe (if any) is confirmed together with the lines of the day
    const { data: totals, error: totalsError } = await db.from("rst_sales_day_totals").update({ status: "confirmed" }).eq("company_id", companyId).eq("sales_date", date).eq("status", "draft").select("id");
    if (totalsError) throw totalsError;
    refresh();
    return { count: (data ?? []).length + (totals ?? []).length };
  });
}

export async function cancelSalesLine(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    if (!reason.trim()) throw new Error("Write the reason for cancelling.");
    const { data, error } = await db.from("rst_sales_daily").update({ status: "cancelled", cancel_reason: reason.trim() }).eq("id", id).eq("status", "confirmed").select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("This line is not confirmed (or you may not cancel it).");
    refresh();
    return {};
  });
}

export async function openCashSession(input: { companyId: string; date: string; shiftNo: number; openingCash: number }): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    if (!isDate(input.date)) throw new Error("Choose the date.");
    if (!Number.isInteger(input.shiftNo) || input.shiftNo < 1 || input.shiftNo > 9) throw new Error("The shift must be 1 to 9.");
    const opening = money(input.openingCash, "the opening cash");
    const { error } = await db.from("rst_cash_sessions").insert({ company_id: input.companyId, session_date: input.date, shift_no: input.shiftNo, opening_cash: opening });
    if (error) {
      if (error.code === "23505") throw new Error("This shift already has a cash session.");
      throw error;
    }
    refresh();
    return {};
  });
}

export async function updateCashSession(id: string, input: { openingCash: number; cashExpenses: number; withdrawals: number }): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const { data, error } = await db
      .from("rst_cash_sessions")
      .update({ opening_cash: money(input.openingCash, "the opening cash"), cash_expenses: money(input.cashExpenses, "The cash expenses", { required: false }), withdrawals: money(input.withdrawals, "The withdrawals", { required: false }) })
      .eq("id", id)
      .eq("status", "open")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("This cash session is closed. A Manager can reopen it.");
    refresh();
    return {};
  });
}

export async function closeCashSession(id: string, counted: number, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const amount = money(counted, "the cash counted in the till");
    const { error } = await db.rpc("rst_close_cash_session", { p_session: id, p_counted: amount, p_note: note.trim() || null });
    if (error) throw error;
    refresh();
    return {};
  });
}

export async function reopenCashSession(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    if (!reason.trim()) throw new Error("Write the reason for reopening.");
    const { error } = await db.rpc("rst_reopen_cash_session", { p_session: id, p_reason: reason.trim() });
    if (error) throw error;
    refresh();
    return {};
  });
}

export async function addRestaurantRole(companyId: string, userId: string, role: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db, session } = await context();
    if (!RESTAURANT_ROLES.some((r) => r.key === role)) throw new Error("Choose a role.");
    const { error } = await db.from("rst_staff_roles").insert({ company_id: companyId, user_id: userId, role, created_by: session.userId });
    if (error && error.code !== "23505") throw error;
    refresh();
    return {};
  });
}

export async function removeRestaurantRole(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await context();
    const { error } = await db.from("rst_staff_roles").delete().eq("id", id);
    if (error) throw error;
    refresh();
    return {};
  });
}
