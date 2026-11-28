/**
 * The sub-categories (the tabs) of each module, so a member can be given only some of them in Settings.
 * A section key is "<module>:<name>". A member with NO key of a module has every section of that module; a member with some keys of a
 * module has only those sections. The first section of a module is its default: it also covers the pages that belong to no other section.
 */
export type Section = { key: string; label: string; href: string; prefixes: string[] };

/** The URL roots of each module that has sections. */
const MODULE_ROOTS: Record<string, string[]> = {
  catering: ["/catering"],
  kitchen: ["/kitchen"],
  "supplier-procurement": ["/supplier-procurement"],
  "driver-logistics": ["/driver-logistics"],
  "finance-admin": ["/admin", "/finance"],
  // the Birthday Calendar is opened from the HR page (it has no module of its own)
  hr: ["/hr", "/birthdays"],
};

export const MODULE_SECTIONS: Record<string, Section[]> = {
  catering: [
    { key: "catering:events", label: "Events", href: "/catering", prefixes: [] },
    { key: "catering:calendar", label: "Event Calendar", href: "/catering/calendar", prefixes: ["/catering/calendar"] },
    { key: "catering:quotation-inbox", label: "Quotation Request Inbox", href: "/catering/quotation-requests", prefixes: ["/catering/quotation-requests"] },
    { key: "catering:import", label: "Import Events", href: "/catering/import", prefixes: ["/catering/import"] },
    { key: "catering:event-report", label: "Event Report", href: "/catering/event-report", prefixes: ["/catering/event-report"] },
    { key: "catering:customers", label: "Customers", href: "/catering/customers", prefixes: ["/catering/customers"] },
    { key: "catering:meals-pax", label: "Meals & Pax", href: "/catering/meals-pax", prefixes: ["/catering/meals-pax"] },
  ],
  kitchen: [
    { key: "kitchen:schedule", label: "Production Schedule", href: "/kitchen", prefixes: ["/kitchen/event-ingredients"] },
    { key: "kitchen:plan", label: "Cooking Plan", href: "/kitchen/plan", prefixes: ["/kitchen/plan"] },
    { key: "kitchen:recipes", label: "Recipes", href: "/kitchen/recipes", prefixes: ["/kitchen/recipes"] },
    { key: "kitchen:packages", label: "Package Menu", href: "/kitchen/packages", prefixes: ["/kitchen/packages"] },
    { key: "kitchen:stock", label: "Stock", href: "/kitchen/stock", prefixes: ["/kitchen/stock", "/kitchen/ingredients", "/kitchen/wastage"] },
    { key: "kitchen:purchase-requests", label: "Purchase Requests", href: "/kitchen/purchase-requests", prefixes: ["/kitchen/purchase-requests"] },
    { key: "kitchen:daily-report", label: "Daily Report", href: "/kitchen/reports", prefixes: ["/kitchen/reports"] },
    { key: "kitchen:duty-roster", label: "Duty Roster", href: "/kitchen/roster", prefixes: ["/kitchen/roster"] },
  ],
  "supplier-procurement": [
    { key: "supplier-procurement:suppliers", label: "Suppliers", href: "/supplier-procurement", prefixes: [] },
    { key: "supplier-procurement:items", label: "Items & Prices", href: "/supplier-procurement/items", prefixes: ["/supplier-procurement/items"] },
    { key: "supplier-procurement:kitchen-requests", label: "Kitchen Requests", href: "/supplier-procurement/kitchen-requests", prefixes: ["/supplier-procurement/kitchen-requests"] },
    { key: "supplier-procurement:quotes", label: "Supplier Quotes", href: "/supplier-procurement/price-quotes", prefixes: ["/supplier-procurement/price-quotes"] },
    { key: "supplier-procurement:orders", label: "Purchase Orders", href: "/supplier-procurement/orders", prefixes: ["/supplier-procurement/orders", "/supplier-procurement/requests"] },
    { key: "supplier-procurement:invoices", label: "Invoices", href: "/supplier-procurement/invoices", prefixes: ["/supplier-procurement/invoices"] },
    { key: "supplier-procurement:ai-invoices", label: "AI Invoice Reader", href: "/supplier-procurement/ai-invoices", prefixes: ["/supplier-procurement/ai-invoices"] },
    { key: "supplier-procurement:notes", label: "Credit / Debit Notes", href: "/supplier-procurement/notes", prefixes: ["/supplier-procurement/notes"] },
    { key: "supplier-procurement:soa", label: "SOA (Statement of Account)", href: "/supplier-procurement/soa", prefixes: ["/supplier-procurement/soa"] },
    { key: "supplier-procurement:vendors", label: "Vendor Contacts", href: "/supplier-procurement/vendors", prefixes: ["/supplier-procurement/vendors"] },
    { key: "supplier-procurement:jdt-snacks", label: "JDT Training & Snack Requests", href: "/supplier-procurement/jdt-snacks", prefixes: ["/supplier-procurement/jdt-snacks"] },
  ],
  "driver-logistics": [
    { key: "driver-logistics:deliveries", label: "Deliveries", href: "/driver-logistics", prefixes: [] },
    { key: "driver-logistics:dashboard", label: "Driver Dashboard", href: "/driver-logistics/dashboard", prefixes: ["/driver-logistics/dashboard"] },
    { key: "driver-logistics:drivers", label: "Drivers Information", href: "/driver-logistics/drivers", prefixes: ["/driver-logistics/drivers"] },
    { key: "driver-logistics:vehicles", label: "Vehicles", href: "/driver-logistics/vehicles", prefixes: ["/driver-logistics/vehicles"] },
    { key: "driver-logistics:maintenance", label: "Maintenance", href: "/driver-logistics/maintenance", prefixes: ["/driver-logistics/maintenance"] },
    { key: "driver-logistics:equipment", label: "Equipment Checklist", href: "/driver-logistics/equipment", prefixes: ["/driver-logistics/equipment"] },
    { key: "driver-logistics:duty-roster", label: "Daily Duty Roster", href: "/driver-logistics/duty-roster", prefixes: ["/driver-logistics/duty-roster"] },
    { key: "driver-logistics:attendance", label: "Attendance (Clock In / Out)", href: "/driver-logistics/attendance", prefixes: ["/driver-logistics/attendance"] },
  ],
  hr: [
    { key: "hr:database", label: "Employee Database", href: "/hr", prefixes: [] },
    { key: "hr:birthdays", label: "Birthday Calendar", href: "/birthdays", prefixes: ["/birthdays"] },
    { key: "hr:leave", label: "Leave Requests", href: "/hr/leave", prefixes: ["/hr/leave"] },
    { key: "hr:overtime", label: "Overtime & OT Form", href: "/hr/overtime", prefixes: ["/hr/overtime"] },
    { key: "hr:documents", label: "Licences & Documents", href: "/hr/documents", prefixes: ["/hr/documents"] },
  ],
  "finance-admin": [
    { key: "finance-admin:monthly-costing", label: "Monthly Costing", href: "/admin", prefixes: [] },
    { key: "finance-admin:event-pnl", label: "Event P&L", href: "/finance/event-pnl", prefixes: ["/finance/event-pnl"] },
    { key: "finance-admin:invoices", label: "Customer Invoices", href: "/finance/invoices", prefixes: ["/finance/invoices"] },
    { key: "finance-admin:payment-proofs", label: "Payments Received", href: "/finance/payment-proofs", prefixes: ["/finance/payment-proofs", "/finance/receive-payments"] },
    // the Payment Overview tab: three pages
    { key: "finance-admin:payments", label: "Payment Overview: Payment Dashboard", href: "/finance/payments", prefixes: ["/finance/payments", "/finance/payment-accounts"] },
    { key: "finance-admin:checklist", label: "Payment Overview: Payment Checklist", href: "/finance/payments/checklist", prefixes: ["/finance/payments/checklist"] },
    { key: "finance-admin:outstanding", label: "Payment Overview: Outstanding Payment", href: "/finance/outstanding", prefixes: ["/finance/outstanding"] },
    // the Supplier, Rental & Utilities tab: three pages
    { key: "finance-admin:supplier-payment", label: "Supplier, Rental & Utilities: Supplier Payment", href: "/finance/supplier-payment", prefixes: ["/finance/supplier-payment"] },
    { key: "finance-admin:rental-payment", label: "Supplier, Rental & Utilities: Rental Payment", href: "/finance/rental-payment", prefixes: ["/finance/rental-payment"] },
    { key: "finance-admin:utilities-payment", label: "Supplier, Rental & Utilities: Utilities Payment", href: "/finance/utilities-payment", prefixes: ["/finance/utilities-payment"] },
  ],
};

const moduleOfKey = (key: string) => key.split(":")[0];

/** The section a page belongs to (the longest matching prefix; the module's first section when none matches), or null for a page outside these modules. */
export function sectionForPath(pathname: string): Section | null {
  for (const [module, roots] of Object.entries(MODULE_ROOTS)) {
    if (!roots.some((r) => pathname === r || pathname.startsWith(`${r}/`))) continue;
    const sections = MODULE_SECTIONS[module];
    // the leave and overtime forms of one staff record: /hr/<id>/leave/new and /hr/<id>/overtime/new
    if (module === "hr") {
      const own = /^\/hr\/[0-9a-f-]{36}\/(leave|overtime)(\/|$)/.exec(pathname);
      if (own) return sections.find((s) => s.key === `hr:${own[1]}`) ?? sections[0];
    }
    let best: Section | null = null;
    let bestLen = -1;
    for (const s of sections) {
      for (const p of s.prefixes) {
        if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > bestLen) {
          best = s;
          bestLen = p.length;
        }
      }
    }
    return best ?? sections[0];
  }
  return null;
}

/** Whether the member may open this section: a module they have no section key of is open in full. */
export function canOpenSection(allowedSections: string[] | null | undefined, sectionKey: string): boolean {
  if (!allowedSections || allowedSections.length === 0) return true;
  const module = moduleOfKey(sectionKey);
  if (!allowedSections.some((k) => moduleOfKey(k) === module)) return true;
  return allowedSections.includes(sectionKey);
}

/** Whether a tab (by its address) is shown: tabs that are not sections of these modules are always shown. */
export function tabVisible(allowedSections: string[] | null | undefined, href: string): boolean {
  for (const sections of Object.values(MODULE_SECTIONS)) {
    const s = sections.find((x) => x.href === href);
    if (s) return canOpenSection(allowedSections, s.key);
  }
  return true;
}

/** Where a module's menu link goes: its first page, or the first section the member has when the first one is not theirs. */
export function moduleHref(moduleKey: string, defaultHref: string, allowedSections: string[] | null | undefined): string {
  const sections = MODULE_SECTIONS[moduleKey];
  if (!sections) return defaultHref;
  const first = sections.find((s) => canOpenSection(allowedSections, s.key));
  return first ? first.href : defaultHref;
}

/** The sections of every module the member is limited in, for showing "Kitchen: Recipes, Stock". */
export function sectionSummary(allowedSections: string[] | null | undefined): { module: string; labels: string[] }[] {
  if (!allowedSections?.length) return [];
  const out: { module: string; labels: string[] }[] = [];
  for (const [module, sections] of Object.entries(MODULE_SECTIONS)) {
    const mine = sections.filter((s) => allowedSections.includes(s.key));
    if (mine.length > 0) out.push({ module, labels: mine.map((s) => s.label) });
  }
  return out;
}

/** Combines the section limits of a user's grants: an unlimited grant (null) means no limit, otherwise the union. */
export function mergeAllowedSections(grants: (string[] | null | undefined)[]): string[] | null {
  if (grants.length === 0 || grants.some((g) => g === null || g === undefined)) return null;
  const merged = Array.from(new Set((grants as string[][]).flat()));
  return merged.length === 0 ? null : merged;
}
