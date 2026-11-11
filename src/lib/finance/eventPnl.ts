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
  others: "Others",
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
/**
 * The direct cost category proposed for one line of a supplier invoice, from words in its description (Malay and English).
 * Only a proposal: the user checks every line before the costs are saved. A line that is not recognised gets "" and the user chooses.
 */
const ITEM_CATEGORY_WORDS: [string, RegExp][] = [
  // gas and air-conditioning parts are not food
  ["others", /\b(GAS|AIR COND|AIRCOND|COIL|FILTER)\b/i],
  ["labour_overtime", /\b(STAFF CATERING|STAFF EVENT|COMPANY SERVICE|OVERTIME|LABOUR|LABOR|UPAH|WAITER|PELAYAN)\b/i],
  ["transport_delivery", /\b(TRANSPORT|TRANSPORTATION|DELIVERY|PENGHANTARAN|LORI|LORRY|LALAMOVE|TOLL)\b/i],
  ["equipment_rental", /\b(RENTAL|SEWA|SEWAAN|HIRE|KHEMAH|TENT|CANOPY|KANOPI|CHAFING|KERUSI|CHAIR|MEJA|TABLE)\b/i],
  ["event_setup", /\b(SET UP|SETUP|SET-UP|DECO|DECORATION|DEKORASI|HIASAN|PELAMIN|BACKDROP|SKIRTING|CARPET|KARPET)\b/i],
  // ice before the groceries, so "ICE CUBE" is not taken for a stock cube
  ["ice", /\b(ICE|AIS|ICE CUBE|ICE BLOCK)\b/i],
  // sauces, flour, oil, powders and other processed goods before the fresh food, so "SOS CILI" or "KNORR PATI AYAM" is not taken for chilli or chicken
  ["dry_goods_groceries", /\b(DRY GOODS|KUEH TEOW|KWAY TEOW|KNORR|PATI|PUREE|CREAM|MADU|HONEY|JUICE|JUS|PELAGA|JINTAN|LADA HITAM|BLACK PEPPER|BAWANG GORENG|CILI KERING|KACANG TANAH|TAUFU|TAUHU|TOFU|CARNATION|SOS|SAUCE|KICAP|SOY|MINYAK|OIL|TEPUNG|FLOUR|GULA|SUGAR|GARAM|SALT|SERBUK|POWDER|PES|PASTE|PERENCAH|REMPAH|SPICE|BERAS|RICE|MEE|MI|NOODLE|BIHUN|KUEY TEAW|SPAGHETTI|PASTA|SANTAN|SUSU|MILK|CREAMER|MARJERIN|MARGARINE|BUTTER|MENTEGA|CUKA|VINEGAR|MAYONIS|MAYONNAISE|KETCHUP|SIRAP|SYRUP|KORDIAL|CORDIAL|TIN|CANNED|TELUR|EGG|EGGS|AIR MINERAL|MINERAL WATER|TEH|TEA|KOPI|COFFEE|MILO|AJINOMOTO|STOK|STOCK|KIUB|CUBE|SAGU|SAGO|AGAR|SUNQUICK|NESTUM|DUTCH LADY|GOLDCOIN|PELANGI|YOGURT)\b/i],
  ["packaging", /\b(PACKAGING|PACKING|BEKAS|CONTAINER|BOX|KOTAK|PLASTIK|PLASTIC|BAG|BEG|FOIL|CLING|WRAP|TISSUE|TISU|STRAW|SUDU|SPOON|FORK|GARFU|CAWAN|CUP|LID|PENUTUP|PAPER|KERTAS|SERVIETTE|NAPKIN|GLOVE|POLYSTYRENE|TRAY|LUNCH BOX|TAKE AWAY|FILM|BUBBLE|BOTTLE|BOTOL|PP)\b/i],
  ["chicken", /\b(AYAM|CHICKEN|DRUMSTICK|THIGH|WING|KEPAK|PEHA|DADA|BREAST|FILLET AYAM|NUGGET)\b/i],
  ["meat", /\b(DAGING|BEEF|LEMBU|KAMBING|MUTTON|LAMB|TULANG|BONE|MINCE|KISAR|BURGER|SOSEJ|SAUSAGE|BEBOLA DAGING|MEATBALL|BATANG PINANG|TOPSIDE|SILVERSIDE)\b/i],
  ["seafood", /\b(IKAN|FISH|UDANG|PRAWN|SHRIMP|SOTONG|SQUID|KETAM|CRAB|KERANG|CLAM|MUSSEL|SIPUT|DORY|SALMON|TUNA|KEMBUNG|SELAR|BILIS|ANCHOVY|SEAFOOD|FISHBALL|BEBOLA IKAN|KEROPOK LEKOR)\b/i],
  ["fruits", /\b(BUAH|FRUIT|TEMBIKAI|WATERMELON|BETIK|PAPAYA|NANAS|NENAS|PINEAPPLE|PISANG|BANANA|EPAL|APPLE|OREN|ORANGE|ANGGUR|GRAPE|MANGGA|MANGO|JAMBU|GUAVA|HONEYDEW|ROCKMELON|LIMAU|LEMON|LIME|KURMA|DATES)\b/i],
  ["bakery", /\b(ROTI|BREAD|BUN|BUNS|KEK|CAKE|CROISSANT|PASTRY|PASTRI|MUFFIN|DONUT|DONAT|TART|PUFF|KARIPAP|BISKUT|BISCUIT|COOKIE)\b/i],
  ["vegetables", /\b(SAYUR|VEGETABLE|BELL PEPPER|ZUCCHINI|ZUKINI|KETOLA|TAOGEH|PARSLEY|PANDAN|SAWI|KOBIS|CABBAGE|KANGKUNG|BAYAM|SPINACH|TOMATO|TIMUN|CUCUMBER|LOBAK|CARROT|KENTANG|POTATO|BAWANG|ONION|GARLIC|HALIA|GINGER|CILI|CHILI|CHILLI|LADA|SERAI|LEMONGRASS|DAUN|LEAF|LEAVES|KACANG PANJANG|LONG BEAN|BENDI|OKRA|TERUNG|BRINJAL|EGGPLANT|BROCCOLI|BROKOLI|CAULIFLOWER|KUBIS|JAGUNG|CORN|CENDAWAN|MUSHROOM|SALAD|LETTUCE|CORAL|SADERI|CELERY|KUNYIT|TURMERIC|LENGKUAS|GALANGAL|PUCUK|TAUGE|TAUGEH|BEANSPROUT|KETUMBAR|CORIANDER|PUDINA|MINT|LABU|PUMPKIN|UBI|KELADI|SENGKUANG|PETAI|KACANG BUNCIS|FRENCH BEAN)\b/i],
];
export function suggestItemCostType(itemName: string): string {
  const name = itemName.replace(/[^A-Za-z0-9 ]+/g, " ");
  for (const [type, words] of ITEM_CATEGORY_WORDS) if (words.test(name)) return type;
  return "";
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
