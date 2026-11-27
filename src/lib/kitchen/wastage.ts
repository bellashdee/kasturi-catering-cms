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

export type WastageInput = {
  /** the id made on the device (optional): the same entry sent again (offline queue, lost answer) is never saved twice */
  id?: string;
  companyId: string;
  wastedOn: string;
  item: string;
  quantity: number;
  unit?: string;
  reason: string;
  estimatedValue?: number | null;
  notes?: string;
  documentId?: string | null;
};

/** Checks what was typed and returns the values ready to save (a problem the person can fix is thrown as a message and returned as the result). */
export function cleanWastageInput(input: WastageInput) {
  const item = input.item.trim().replace(/\s+/g, " ");
  if (!item) throw new Error("Enter the item that was thrown away.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.wastedOn)) throw new Error("Choose the date.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Enter a quantity more than 0.");
  if (!(WASTAGE_REASONS as readonly string[]).includes(input.reason)) throw new Error("Choose the reason.");
  const value = input.estimatedValue;
  if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error("The estimated value cannot be less than 0.");
  return {
    wasted_on: input.wastedOn,
    item,
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    reason: input.reason,
    estimated_value: value === null || value === undefined ? null : value,
    notes: input.notes?.trim() || null,
    document_id: input.documentId || null,
  };
}

export const describeWastage = (r: { item: string; quantity: number | string; unit: string | null; reason: string }) => `${r.item}: ${Number(r.quantity)} ${r.unit ?? ""} (${r.reason})`.replace(/\s+\(/, " (");
