/** The vendor categories of the catering business, in the order they are listed (like a wedding / event vendor contact list). */
export const VENDOR_CATEGORIES = [
  "Baker",
  "Car / Shuttle",
  "Videographer",
  "Caterer",
  "Beverage / Drinks",
  "Stationer",
  "Ceremony Venue",
  "Musicians / Deejay",
  "Wedding Planner",
  "Dressmaker",
  "Officiant / Tok Kadi",
  "Florist",
  "Seamstress or Tailor",
  "Photographer",
  "Reception Venue",
  "Canopy & Tent",
  "Decoration / Pelamin",
  "Sound System & Lighting",
  "Equipment Rental",
  "Ice Supplier",
  "Gas Supplier",
  "Manpower / Waiter",
  "Printing & Banner",
  "Cleaning",
  "Other",
] as const;

export type VendorContact = {
  id: string;
  category: string;
  name: string;
  contact_person: string | null;
  address: string | null;
  phone: string | null;
  cell_phone: string | null;
  email: string | null;
  notes: string | null;
  /** the vendor's bank account, for paying by bank transfer */
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_holder: string | null;
};

/** Banks offered in the Bank box (any other bank can be typed). */
export const MALAYSIAN_BANKS = [
  "Maybank",
  "CIMB Bank",
  "Public Bank",
  "RHB Bank",
  "Hong Leong Bank",
  "AmBank",
  "Bank Islam",
  "Bank Rakyat",
  "Bank Simpanan Nasional (BSN)",
  "Affin Bank",
  "Alliance Bank",
  "Bank Muamalat",
  "Agrobank",
  "MBSB Bank",
  "OCBC Bank",
  "UOB Bank",
  "HSBC Bank",
  "Standard Chartered",
  "Al Rajhi Bank",
  "Kuwait Finance House",
];

/** The categories to show: the fixed list first, then any other category that was typed in. */
export function orderedCategories(contacts: { category: string }[]): string[] {
  const extra = Array.from(new Set(contacts.map((c) => c.category))).filter((c) => !(VENDOR_CATEGORIES as readonly string[]).includes(c)).sort();
  const fixed = VENDOR_CATEGORIES.filter((c) => c !== "Other");
  return [...fixed, ...extra, "Other"];
}
