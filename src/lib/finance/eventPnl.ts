/** Monthly Event P&L: the labels and the one calculation every page uses, so the dashboard, the detail page and the exports can never disagree. */

/** The module covers events handled by these two companies only (matched by name, as everywhere else in Finance). */
export const EVENT_PNL_COMPANY_NAMES = ["Signature Solution", "Kasturi Indah"] as const;

export const REVENUE_TYPE_LABEL: Record<string, string> = {
  sales: "Customer / client sales",
  package: "Catering & food package",
  additional_service: "Additional services charged to the customer",
  other_revenue: "Other approved event revenue",
  discount: "Discount",
  refund: "Refund",
  credit_note: "Credit note",
};
/** Entries that add to gross revenue, and entries that are deducted from it. */
export const REVENUE_ADDITIONS = ["sales", "package", "additional_service", "other_revenue"] as const;
export const REVENUE_DEDUCTIONS = ["discount", "refund", "credit_note"] as const;

/**
 * The categories of a direct cost, each kept apart (none is combined with another). These are the only ones offered for a new cost.
 * The keys `packaging`, `labour_overtime` and `transport_delivery` are the older keys of the same categories.
 */
export const DIRECT_COST_TYPE_LABEL: Record<string, string> = {
  bakery: "Bakery",
  chicken: "Chicken",
  dry_goods_groceries: "Dry Goods & Groceries",
  equipment_rental: "Equipment Rental",
  event_setup: "Event Set-up",
  fruits: "Fruits",
  ice: "Ice",
  meat: "Meat",
  packaging: "Packaging",
  seafood: "Seafood",
  labour_overtime: "Staff Serving / Event Labour & Overtime",
  transport_delivery: "Transportation",
  vegetables: "Vegetables",
};
/** Costs saved before the categories were separated. They keep their figures and are shown as they were; they are not offered for a new cost. */
export const LEGACY_DIRECT_COST_TYPE_LABEL: Record<string, string> = {
  food_ingredients: "Food ingredients & raw materials (earlier entry)",
  meat_seafood_vegetables: "Chicken, meat, seafood, vegetables & other food supplies (earlier entry)",
  equipment_setup: "Equipment rental & event set-up (earlier entry)",
  subcontractor: "External catering / subcontractor (earlier entry)",
  other_direct: "Other approved event-specific costs (earlier entry)",
};
/** The category (or an earlier combined category) of a direct cost, for showing it. */
export const ANY_DIRECT_COST_TYPE_LABEL: Record<string, string> = { ...DIRECT_COST_TYPE_LABEL, ...LEGACY_DIRECT_COST_TYPE_LABEL };
/** The categories offered for a new cost, A to Z. `keep` is the category of the entry being edited, so an earlier entry can still be edited. */
export function directCostOptions(keep?: string): [string, string][] {
  const all: Record<string, string> = keep && LEGACY_DIRECT_COST_TYPE_LABEL[keep] ? { ...DIRECT_COST_TYPE_LABEL, [keep]: LEGACY_DIRECT_COST_TYPE_LABEL[keep] } : DIRECT_COST_TYPE_LABEL;
  return Object.entries(all).sort((a, b) => a[1].localeCompare(b[1]));
}
export const ADDITIONAL_COST_TYPE_LABEL: Record<string, string> = {
  permit: "Event-specific permits",
  venue: "Venue-related charges",
  other_additional: "Other event-specific expenses",
};
export const COST_TYPE_LABEL: Record<string, string> = { ...ANY_DIRECT_COST_TYPE_LABEL, ...ADDITIONAL_COST_TYPE_LABEL };

/** The Catering event costing sheet is not split into these categories, so each of its lines is shown as its own line (never mixed into a category). */
export const SHEET_LINE_LABEL = {
  food: "Catering costing sheet: food & ingredients",
  staff: "Catering costing sheet: staff",
  transport: "Catering costing sheet: transport",
  equipment: "Catering costing sheet: equipment",
  other: "Catering costing sheet: other",
} as const;

/** The lines of the direct costs, in order: every category A to Z (even at 0), then the earlier combined categories and the costing sheet lines when they have an amount. */
const DIRECT_LINE_ORDER: { label: string; always: boolean }[] = [
  ...Object.values(DIRECT_COST_TYPE_LABEL).sort((a, b) => a.localeCompare(b)).map((label) => ({ label, always: true })),
  ...Object.values(LEGACY_DIRECT_COST_TYPE_LABEL).sort((a, b) => a.localeCompare(b)).map((label) => ({ label, always: false })),
  ...Object.values(SHEET_LINE_LABEL).map((label) => ({ label, always: false })),
];
export function directLinesOf(pnl: { directByGroup: Record<string, number> }): [string, number][] {
  return DIRECT_LINE_ORDER.filter((l) => l.always || (pnl.directByGroup[l.label] ?? 0) !== 0).map((l) => [l.label, pnl.directByGroup[l.label] ?? 0]);
}

/** The message an action throws when the same entry already exists; the form then asks "save anyway?". */
export const DUPLICATE_ENTRY_MESSAGE = "DUPLICATE_ENTRY";

export const COST_BASIS_LABEL: Record<string, string> = { actual: "Actual", estimated: "Estimated" };
export const PAYMENT_STATUS_LABEL: Record<string, string> = { unpaid: "Unpaid", paid: "Paid" };

export type RevenueEntry = { entry_type: string; amount: number | string };
export type CostEntry = { cost_class: string; cost_type: string; amount: number | string; cost_basis?: string | null };
/** The Catering module's own event costing sheet (one row per event, six cost lines). */
export type CateringCostingSheet = {
  food_cost: number | string;
  ingredient_cost: number | string;
  staff_cost: number | string;
  transport_cost: number | string;
  equipment_cost: number | string;
  other_cost: number | string;
} | null;

export type PnlVerdict = "profit" | "break_even" | "loss" | "no_data";

export type EventPnl = {
  grossRevenue: number;
  deductions: number;
  netRevenue: number;
  directCosts: number;
  /** The part of direct costs that comes from the Catering event costing sheet (shown so nothing is hidden). */
  fromCostingSheet: number;
  /** Direct costs by category (actual costs), and the lines of the costing sheet, each under its own label. */
  directByGroup: Record<string, number>;
  grossProfit: number;
  additionalExpenses: number;
  netProfit: number;
  /** null when net revenue is zero (shown as N/A). */
  margin: number | null;
  /** Estimated costs are kept apart: they never enter the P&L above. */
  estimatedCosts: number;
  verdict: PnlVerdict;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function sheetTotal(sheet: CateringCostingSheet): number {
  if (!sheet) return 0;
  return round2(num(sheet.food_cost) + num(sheet.ingredient_cost) + num(sheet.staff_cost) + num(sheet.transport_cost) + num(sheet.equipment_cost) + num(sheet.other_cost));
}

/**
 * Net Event Revenue = Gross − Discounts − Refunds (and credit notes)
 * Gross Profit      = Net Revenue − Direct Costs
 * Net Event Profit  = Gross Profit − Additional Event-Specific Expenses
 * Margin            = Net Profit ÷ Net Revenue × 100 (N/A when revenue is zero)
 * Only ACTUAL costs count; estimated costs are reported separately and budgets are never costs.
 */
export function computeEventPnl(revenue: RevenueEntry[], costs: CostEntry[], sheet: CateringCostingSheet): EventPnl {
  const grossRevenue = round2(revenue.filter((r) => (REVENUE_ADDITIONS as readonly string[]).includes(r.entry_type)).reduce((t, r) => t + num(r.amount), 0));
  const deductions = round2(revenue.filter((r) => (REVENUE_DEDUCTIONS as readonly string[]).includes(r.entry_type)).reduce((t, r) => t + num(r.amount), 0));
  const netRevenue = round2(grossRevenue - deductions);

  const actual = costs.filter((c) => (c.cost_basis ?? "actual") === "actual");
  const estimatedCosts = round2(costs.filter((c) => c.cost_basis === "estimated").reduce((t, c) => t + num(c.amount), 0));

  const directByGroup: Record<string, number> = {};
  const addTo = (label: string, amount: number) => {
    directByGroup[label] = (directByGroup[label] ?? 0) + amount;
  };
  for (const c of actual.filter((x) => x.cost_class === "direct")) addTo(ANY_DIRECT_COST_TYPE_LABEL[c.cost_type] ?? LEGACY_DIRECT_COST_TYPE_LABEL.other_direct, num(c.amount));
  if (sheet) {
    addTo(SHEET_LINE_LABEL.food, num(sheet.food_cost) + num(sheet.ingredient_cost));
    addTo(SHEET_LINE_LABEL.staff, num(sheet.staff_cost));
    addTo(SHEET_LINE_LABEL.transport, num(sheet.transport_cost));
    addTo(SHEET_LINE_LABEL.equipment, num(sheet.equipment_cost));
    addTo(SHEET_LINE_LABEL.other, num(sheet.other_cost));
  }
  for (const g of Object.keys(directByGroup)) directByGroup[g] = round2(directByGroup[g]);

  const fromCostingSheet = sheetTotal(sheet);
  const directCosts = round2(Object.values(directByGroup).reduce((t, v) => t + v, 0));
  const additionalExpenses = round2(actual.filter((c) => c.cost_class === "additional").reduce((t, c) => t + num(c.amount), 0));
  const grossProfit = round2(netRevenue - directCosts);
  const netProfit = round2(grossProfit - additionalExpenses);
  const margin = netRevenue === 0 ? null : (netProfit / netRevenue) * 100;
  const hasAnything = revenue.length > 0 || actual.length > 0 || fromCostingSheet > 0;
  const verdict: PnlVerdict = !hasAnything ? "no_data" : Math.abs(netProfit) < 0.005 ? "break_even" : netProfit > 0 ? "profit" : "loss";
  return { grossRevenue, deductions, netRevenue, directCosts, fromCostingSheet, directByGroup, grossProfit, additionalExpenses, netProfit, margin, estimatedCosts, verdict };
}

/** Monthly totals are summed from the events, and the monthly margin is total profit ÷ total revenue (never an average of event margins). */
export function totalEventPnl(items: EventPnl[]) {
  const sum = (pick: (p: EventPnl) => number) => round2(items.reduce((t, p) => t + pick(p), 0));
  const netRevenue = sum((p) => p.netRevenue);
  const netProfit = sum((p) => p.netProfit);
  return {
    netRevenue,
    grossRevenue: sum((p) => p.grossRevenue),
    deductions: sum((p) => p.deductions),
    directCosts: sum((p) => p.directCosts),
    grossProfit: sum((p) => p.grossProfit),
    additionalExpenses: sum((p) => p.additionalExpenses),
    netProfit,
    margin: netRevenue === 0 ? null : (netProfit / netRevenue) * 100,
    estimatedCosts: sum((p) => p.estimatedCosts),
    events: items.length,
    lossMaking: items.filter((p) => p.verdict === "loss").length,
    profitable: items.filter((p) => p.verdict === "profit").length,
    breakEven: items.filter((p) => p.verdict === "break_even").length,
  };
}

export const VERDICT_LABEL: Record<PnlVerdict, string> = { profit: "Profitable", break_even: "Break-even", loss: "Loss-making", no_data: "No figures yet" };
export const VERDICT_TONE: Record<PnlVerdict, "success" | "warning" | "danger" | "neutral"> = { profit: "success", break_even: "warning", loss: "danger", no_data: "neutral" };

export function formatMargin(margin: number | null): string {
  return margin === null ? "N/A" : `${margin.toFixed(1)}%`;
}

/** Percentage change that is only shown when it means something: no previous value (or zero) gives null → "n/a". */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || Math.abs(previous) < 0.005) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
export function formatChange(change: number | null): string {
  return change === null ? "n/a" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

export type Budget = { budget_revenue: number | string | null; budget_direct_costs: number | string | null; budget_additional_costs: number | string | null } | null;

/** Budget vs actual for one event; any figure the budget does not have stays null ("Budget not set"), never zero. */
export function budgetVsActual(pnl: EventPnl, budget: Budget) {
  if (!budget) return null;
  const rev = budget.budget_revenue === null ? null : num(budget.budget_revenue);
  const direct = budget.budget_direct_costs === null ? null : num(budget.budget_direct_costs);
  const add = budget.budget_additional_costs === null ? null : num(budget.budget_additional_costs);
  const costBudget = direct === null && add === null ? null : (direct ?? 0) + (add ?? 0);
  const actualCosts = round2(pnl.directCosts + pnl.additionalExpenses);
  const profitBudget = rev === null || costBudget === null ? null : round2(rev - costBudget);
  const line = (budgeted: number | null, actual: number) => ({
    budgeted,
    actual,
    variance: budgeted === null ? null : round2(actual - budgeted),
    variancePct: budgeted === null ? null : percentChange(actual, budgeted),
  });
  return { revenue: line(rev, pnl.netRevenue), costs: line(costBudget, actualCosts), profit: line(profitBudget, pnl.netProfit) };
}

export type DataFlag = "no_entries" | "no_revenue" | "no_costs";
export const DATA_FLAG_LABEL: Record<DataFlag, string> = {
  no_entries: "No revenue or cost recorded yet",
  no_revenue: "Costs recorded but no revenue",
  no_costs: "Revenue recorded but no direct costs",
};
/** Events whose figures are probably incomplete (cancelled events and enquiries are not expected to have figures). */
export function dataFlagsFor(pnl: EventPnl, status: string): DataFlag[] {
  if (status === "cancelled" || status === "enquiry") return [];
  const flags: DataFlag[] = [];
  if (pnl.verdict === "no_data") flags.push("no_entries");
  else {
    if (pnl.netRevenue === 0 && pnl.grossRevenue === 0) flags.push("no_revenue");
    if (pnl.directCosts === 0 && pnl.grossRevenue > 0) flags.push("no_costs");
  }
  return flags;
}
