import type { Database } from "@/lib/supabase/types";

/**
 * Wastage Log of the restaurant (O2 Life): food thrown away, kept for information only. It is never added to a cost: the food bought is already
 * counted by day in Company Expenses, so a wastage cost would count the same food twice (see the Monthly Breakdown, which shows it as a note).
 */
export type WastageRow = Database["public"]["Tables"]["wastage_log"]["Row"];

export const WASTAGE_REASONS = [
  "Spoiled / rotten",
  "Expired",
  "Overcooked / burnt",
  "Leftover not sold",
  "Dropped / spilled",
  "Customer return",
  "Preparation waste (trimming)",
  "Other",
] as const;

/** The units offered in the box (anything else can be typed). */
export const WASTAGE_UNITS = ["kg", "g", "pcs", "portion", "tray", "litre", "ml", "pack", "bottle", "box", "bag", "can"];

export const WASTAGE_PATH = "/kitchen/wastage";
