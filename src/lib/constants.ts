export type ModuleKey =
  | "hr"
  | "marketing"
  | "catering"
  | "kitchen"
  | "driver-logistics"
  | "supplier-procurement"
  | "finance"
  | "admin"
  | "ingredient-calculator"
  | "reports"
  | "ai-assistant"
  | "settings";

export const MODULES: { key: ModuleKey; label: string; href: string }[] = [
  { key: "hr", label: "HR", href: "/hr" },
  { key: "marketing", label: "Marketing", href: "/marketing" },
  { key: "catering", label: "Catering", href: "/catering" },
  { key: "kitchen", label: "Kitchen", href: "/kitchen" },
  { key: "ingredient-calculator", label: "Ingredient Calculator", href: "/ingredient-calculator" },
  { key: "driver-logistics", label: "Driver & Logistics", href: "/driver-logistics" },
  { key: "supplier-procurement", label: "Supplier & Procurement", href: "/supplier-procurement" },
  { key: "finance", label: "Finance", href: "/finance/invoices" },
  { key: "admin", label: "Admin", href: "/admin" },
  { key: "reports", label: "Reports", href: "/reports" },
  { key: "ai-assistant", label: "AI Assistant", href: "/ai-assistant" },
];

export type CompanyColorKey = "all" | "signature" | "kasturi" | "o2life";

/** Maps a company's legal name (as stored in the DB) to its UI accent color and short code. */
export const COMPANY_STYLE: Record<string, { colorVar: string; short: string }> = {
  "Signature Solution Sdn Bhd": { colorVar: "var(--color-company-signature)", short: "SS" },
  "Kasturi Indah Sdn Bhd": { colorVar: "var(--color-company-kasturi)", short: "KI" },
  "O2 Life Sdn Bhd": { colorVar: "var(--color-company-o2life)", short: "O2" },
};

export const ALL_COMPANIES_OPTION = {
  id: "all",
  name: "All Companies",
  colorVar: "var(--color-company-all)",
  short: "ALL",
};
