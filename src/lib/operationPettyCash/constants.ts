export type EntryType = "top_up" | "expense";

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  top_up: "Received (top-up)",
  expense: "Spent",
};

/** What the float is spent on, for a catering business: alphabetical, "Other" last. */
export const PETTY_CASH_CATEGORIES = [
  "Bakery & bread",
  "Cleaning supplies",
  "Decoration & event setup",
  "Disposables & packaging",
  "Dry goods & groceries",
  "Equipment rental",
  "Fresh ingredients (market)",
  "Fuel",
  "Gas (LPG)",
  "Ice & beverages",
  "Lalamove",
  "Meals",
  "Parking",
  "Part-time worker wages",
  "Repairs & tools",
  "Stationery & printing",
  "Toll",
  "Transport & lorry hire",
  "Uniforms & safety gear",
  "Other",
];

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
};
