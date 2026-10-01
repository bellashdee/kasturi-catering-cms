import type { ModuleKey } from "@/lib/constants";

type PageContextEntry = { prefix: string; label: string; module: ModuleKey | "general" };

// Ordered most-specific prefix first — the first match wins.
const PAGE_CONTEXT_MAP: PageContextEntry[] = [
  { prefix: "/supplier-procurement/payments", label: "Supplier & Procurement → Payment Dashboard", module: "supplier-procurement" },
  { prefix: "/supplier-procurement/invoices", label: "Supplier & Procurement → Supplier Invoices", module: "supplier-procurement" },
  { prefix: "/supplier-procurement/orders", label: "Supplier & Procurement → Purchase Orders", module: "supplier-procurement" },
  { prefix: "/supplier-procurement/requests", label: "Supplier & Procurement → Purchase Requests", module: "supplier-procurement" },
  { prefix: "/supplier-procurement", label: "Supplier & Procurement", module: "supplier-procurement" },
  { prefix: "/hr/leave", label: "HR → Leave", module: "hr" },
  { prefix: "/hr/overtime", label: "HR → Overtime", module: "hr" },
  { prefix: "/hr/payroll", label: "HR → Payroll", module: "hr" },
  { prefix: "/hr", label: "HR", module: "hr" },
  { prefix: "/marketing/leads", label: "Marketing → Leads", module: "marketing" },
  { prefix: "/marketing/customers", label: "Marketing → Customers", module: "marketing" },
  { prefix: "/marketing/content", label: "Marketing → Content Calendar", module: "marketing" },
  { prefix: "/marketing/promotions", label: "Marketing → Promotions", module: "marketing" },
  { prefix: "/marketing/expenses", label: "Marketing → Expenses", module: "marketing" },
  { prefix: "/marketing/reports", label: "Marketing → Reports", module: "marketing" },
  { prefix: "/marketing", label: "Marketing", module: "marketing" },
  { prefix: "/catering/customers", label: "Catering → Customers", module: "catering" },
  { prefix: "/catering/quotations", label: "Catering → Quotations", module: "catering" },
  { prefix: "/catering", label: "Catering", module: "catering" },
  { prefix: "/kitchen/ingredients", label: "Kitchen → Ingredients", module: "kitchen" },
  { prefix: "/kitchen/menus", label: "Kitchen → Menus", module: "kitchen" },
  { prefix: "/kitchen/recipes", label: "Kitchen → Recipes", module: "kitchen" },
  { prefix: "/kitchen/stock", label: "Kitchen → Stock", module: "kitchen" },
  { prefix: "/kitchen/purchase-requests", label: "Kitchen → Purchase Requests", module: "kitchen" },
  { prefix: "/kitchen/reports", label: "Kitchen → Daily Report", module: "kitchen" },
  { prefix: "/kitchen", label: "Kitchen", module: "kitchen" },
  { prefix: "/driver-logistics/drivers", label: "Driver & Logistics → Drivers", module: "driver-logistics" },
  { prefix: "/driver-logistics/vehicles", label: "Driver & Logistics → Vehicles", module: "driver-logistics" },
  { prefix: "/driver-logistics/maintenance", label: "Driver & Logistics → Maintenance", module: "driver-logistics" },
  { prefix: "/driver-logistics/expenses", label: "Driver & Logistics → Expenses", module: "driver-logistics" },
  { prefix: "/driver-logistics", label: "Driver & Logistics", module: "driver-logistics" },
  { prefix: "/finance/invoices", label: "Finance → Customer Invoices", module: "finance" },
  { prefix: "/finance/expenses", label: "Finance → Company Expenses", module: "finance" },
  { prefix: "/finance/petty-cash", label: "Finance → Petty Cash", module: "finance" },
  { prefix: "/finance", label: "Finance", module: "finance" },
  { prefix: "/admin/budgets", label: "Admin → Budgets", module: "admin" },
  { prefix: "/admin/categories", label: "Admin → Cost Categories", module: "admin" },
  { prefix: "/admin", label: "Admin → Monthly Costing", module: "admin" },
  { prefix: "/ingredient-calculator", label: "Kitchen → Ingredient Calculator", module: "kitchen" },
  { prefix: "/reports", label: "Reports", module: "reports" },
  { prefix: "/settings", label: "Settings", module: "general" },
  { prefix: "/ai-assistant", label: "AI Assistant", module: "general" },
  { prefix: "/", label: "Main Dashboard", module: "general" },
];

export function resolvePageContext(pathname: string): { label: string; module: ModuleKey | "general" } {
  const match = PAGE_CONTEXT_MAP.find(
    (entry) => pathname === entry.prefix || (entry.prefix !== "/" && pathname.startsWith(entry.prefix + "/")),
  );
  return match ?? { label: "Main Dashboard", module: "general" };
}
