import { todayInMalaysia } from "@/lib/format";
import type { PettyCashEntryInput } from "./actions";

/** The checks of a petty cash entry (shared by the form's server action and the offline sync, which must refuse the same things). */
export function validatePettyCashEntry(input: PettyCashEntryInput) {
  if (!input.personName?.trim()) throw new Error("Choose whose petty cash this is: the name.");
  if (input.entryType !== "top_up" && input.entryType !== "expense") throw new Error("Choose whether the money was received or spent.");
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "online_transfer") throw new Error(input.entryType === "top_up" ? "Choose how the money was received: cash or online transfer." : "Choose how the money was paid: cash or online transfer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) throw new Error("Select the date.");
  if (input.entryDate > todayInMalaysia()) throw new Error("The date cannot be in the future.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
}

export const pettyCashLabel = (r: { entry_type: string; amount: number | string; entry_date: string; description: string | null }) =>
  `${r.entry_type === "top_up" ? "Received" : "Spent"} RM ${Number(r.amount).toFixed(2)} · ${r.entry_date}${r.description ? ` · ${r.description}` : ""}`;
