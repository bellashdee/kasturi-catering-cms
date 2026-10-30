export type ModuleKey =
  | "hr"
  | "marketing"
  | "catering"
  | "kitchen"
  | "driver-logistics"
  | "supplier-procurement"
  | "finance-admin"
  | "ingredient-calculator"
  | "reports"
  | "ai-assistant"
  /** Sub-permission: only the OT pages of HR (Staff OT Form, OT dashboard and approvals), not the rest of HR. */
  | "overtime"
  | "settings";

/** The modules in the order of the side menu (Marketing has no menu item: it is not offered when choosing a member's modules). */
export const MODULES: { key: ModuleKey; label: string; href: string; matchPrefixes?: string[] }[] = [
  { key: "catering", label: "Catering", href: "/catering" },
  { key: "kitchen", label: "Kitchen", href: "/kitchen" },
  { key: "supplier-procurement", label: "Supplier & Procurement", href: "/supplier-procurement" },
  { key: "driver-logistics", label: "Operation Management", href: "/driver-logistics", matchPrefixes: ["/driver-logistics"] },
  { key: "finance-admin", label: "Admin & Finance", href: "/admin", matchPrefixes: ["/admin", "/finance"] },
  { key: "hr", label: "HR", href: "/hr", matchPrefixes: ["/hr", "/payroll-centre"] },
  { key: "reports", label: "Reports", href: "/reports" },
  { key: "ai-assistant", label: "AI Assistant", href: "/ai-assistant" },
  { key: "marketing", label: "Marketing", href: "/marketing" },
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
