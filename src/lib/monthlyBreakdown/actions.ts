"use server";

import { isModuleEditor } from "@/lib/moduleAccess";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import type { BreakdownLine, Months } from "./restoranBara";

const LINES = ["raw", "labour", "utilities", "contribution"];

async function requireAdmin(companyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  if (!(await isModuleEditor(supabase, companyId, "finance-admin"))) throw new Error("Only a Finance / Admin user of this company can change the monthly breakdown.");
  return { supabase, userId: user.id };
}

function refresh() {
  revalidatePath("/reports/monthly-breakdown");
  revalidatePath("/reports/monthly-costing");
}

/** The twelve months as numbers (or null for a month left empty); each must be a number of 0 or more. */
function cleanMonths(values: Months): Months {
  if (!Array.isArray(values) || values.length !== 12) throw new Error("Enter the twelve months.");
  return values.map((v) => {
    if (v === null || v === undefined || (v as unknown) === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error("Every amount must be a number of 0 or more (leave a month empty if it is not entered yet).");
    return Math.round(n * 100) / 100;
  });
}

export type BreakdownItemInput = {
  /** the item to change; none = a new item */
  id?: string;
  companyId: string;
  year: number;
  line: BreakdownLine;
  label: string;
  budget: number | null;
  note: string | null;
  values: Months;
};

/** Saves a new item of a cost line, or the changes of an existing one. */
export async function saveBreakdownItem(input: BreakdownItemInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireAdmin(input.companyId);
    if (!LINES.includes(input.line)) throw new Error("Unknown cost line.");
    const label = input.label.trim();
    if (!label) throw new Error("Enter the name of the item.");
    if (input.budget !== null && (!Number.isFinite(input.budget) || input.budget < 0)) throw new Error("The amount (avg/mth) must be 0 or more.");
    const row = {
      label: label.slice(0, 120),
      budget: input.budget,
      note: input.note?.trim().slice(0, 500) || null,
      amounts: cleanMonths(input.values),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (input.id) {
      const { error } = await supabase.from("breakdown_items").update(row).eq("id", input.id).eq("company_id", input.companyId);
      if (error) throw error;
    } else {
      const { data: last } = await supabase.from("breakdown_items").select("sort_order").eq("company_id", input.companyId).eq("year", input.year).eq("line", input.line).order("sort_order", { ascending: false }).limit(1);
      const { error } = await supabase.from("breakdown_items").insert({ ...row, company_id: input.companyId, year: input.year, line: input.line, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
      if (error) throw error;
    }
    refresh();
    return {};
  }, "Could not save the item. Please try again.");
}

export async function deleteBreakdownItem(companyId: string, id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireAdmin(companyId);
    const { error } = await supabase.from("breakdown_items").delete().eq("id", id).eq("company_id", companyId);
    if (error) throw error;
    refresh();
    return {};
  }, "Could not delete the item. Please try again.");
}

/** Saves the total sales of the twelve months: a month left empty has its saved sales removed. */
export async function saveBreakdownSales(companyId: string, year: number, values: Months): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireAdmin(companyId);
    const months = cleanMonths(values);
    const now = new Date().toISOString();
    const filled = months.map((v, i) => ({ v, month: i + 1 })).filter((m): m is { v: number; month: number } => m.v !== null);
    if (filled.length) {
      const { error } = await supabase.from("monthly_sales").upsert(
        filled.map((m) => ({ company_id: companyId, year, month: m.month, sales_type: "total", sales_amount: m.v, updated_by: userId, updated_at: now })),
        { onConflict: "company_id,year,month,sales_type" },
      );
      if (error) throw error;
    }
    const empty = months.map((v, i) => (v === null ? i + 1 : 0)).filter(Boolean);
    if (empty.length) {
      const { error } = await supabase.from("monthly_sales").delete().eq("company_id", companyId).eq("year", year).eq("sales_type", "total").in("month", empty);
      if (error) throw error;
    }
    refresh();
    return {};
  }, "Could not save the sales. Please try again.");
}

/** Removes every saved total sales of the year. */
export async function deleteBreakdownSales(companyId: string, year: number): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireAdmin(companyId);
    const { error } = await supabase.from("monthly_sales").delete().eq("company_id", companyId).eq("year", year).eq("sales_type", "total");
    if (error) throw error;
    refresh();
    return {};
  }, "Could not delete the sales. Please try again.");
}
