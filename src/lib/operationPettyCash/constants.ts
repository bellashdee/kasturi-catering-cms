import { SPENDING_CATEGORIES, joinCategories, splitCategories } from "@/lib/finance/spendingCategories";

export type EntryType = "top_up" | "expense";

/** How the money was received or paid: asked for every petty cash record (received, spent, staff claim and its payment) */
export type PaymentMethod = "cash" | "online_transfer";
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", online_transfer: "Online transfer" };

/** "Cash" / "Online transfer" for a saved method; empty when none was recorded (older entries) */
export const paymentMethodLabel = (method: string | null | undefined): string => (method ? (PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method) : "");
export const isPaymentMethod = (method: unknown): method is PaymentMethod => method === "cash" || method === "online_transfer";

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  top_up: "Received (top-up)",
  expense: "Spent",
};

/** What the money is spent on: the one list of the companies (see spendingCategories), in capitals and alphabetical order. */
export const PETTY_CASH_CATEGORIES = SPENDING_CATEGORIES;

/** An entry can have more than one category: they are saved in one text, kept apart with " | " (older entries: a comma). */
export { joinCategories, splitCategories };

export type OperationPettyCashRow = {
  id: string;
  company_id: string;
  entry_type: EntryType;
  entry_date: string;
  category: string | null;
  description: string | null;
  amount: number;
  document_id: string | null;
  created_by: string | null;
  /** who received (or spent) the money, and the position that holds the petty cash */
  person_name: string | null;
  person_position: string | null;
  /** cash or online transfer (older entries may have none) */
  payment_method: string | null;
  /** the other companies this entry is also for (company_id is the main one); the amount is counted once */
  shared_company_ids: string[];
};
